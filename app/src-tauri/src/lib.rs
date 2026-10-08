//! Scribe's local session core. Original hook payloads never enter persistence.
mod decisions;
mod mcp;
pub use decisions::{Decision, DecisionInput, DecisionWait};
mod model;
mod private_fs;
mod sanitize;
mod server;
mod store;

use model::Hook;
pub use model::{Session, SessionState, Snapshot, StateEvent, Step};
pub use server::LocalServer;
use std::{
    collections::{HashMap, HashSet},
    path::Path,
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc, Mutex,
    },
    time::{SystemTime, UNIX_EPOCH},
};
use tokio::sync::broadcast;

/// Errors stay inside Rust; HTTP handlers expose only fixed status codes.
pub type Error = Box<dyn std::error::Error + Send + Sync>;
/// Fallible local storage and state operations.
pub type Result<T> = std::result::Result<T, Error>;

struct Data {
    store: store::Store,
    sessions: HashMap<String, Session>,
    agents: HashMap<String, HashSet<String>>,
    retention_days: u16,
    completed_minutes: u16,
    decisions: HashMap<String, decisions::Pending>,
}

impl Data {
    fn prune(&mut self, at: u64) -> Result<()> {
        let before = at.saturating_sub(u64::from(self.retention_days) * 86_400_000);
        self.store.prune(before)?;
        self.prune_memory(before);
        Ok(())
    }

    fn prune_memory(&mut self, before: u64) {
        self.sessions.retain(|_, session| {
            session.steps.retain(|step| step.at >= before);
            session.last_event_at >= before
        });
        let session_ids: HashSet<_> = self.sessions.keys().cloned().collect();
        self.agents.retain(|id, _| session_ids.contains(id));
        self.decisions
            .retain(|_, d| d.view.status == "pending" || d.view.created_at >= before);
    }
}

/// Shared state serializes commits and publishes only successfully stored changes.
#[derive(Clone)]
pub struct Core {
    data: Arc<Mutex<Data>>,
    events: broadcast::Sender<StateEvent>,
    permission_seconds: Arc<AtomicU64>,
}

/// Current Unix time used by the live server; tests supply explicit timestamps.
pub fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

impl Core {
    /// Open a database inside a dedicated private app directory. Do not pass
    /// a directory shared with other projects: its permissions are restricted.
    pub fn open(path: &Path, at: u64) -> Result<Self> {
        let store = store::Store::open(path)?;
        let retention_days = store.policy("retention_days", 14)?;
        let completed_minutes = store.policy("completed_minutes", 10)?;
        store.prune(at.saturating_sub(u64::from(retention_days) * 86_400_000))?;
        let mut sessions = HashMap::new();
        for mut session in store.load(at, completed_minutes)? {
            if session.ended_at.is_none() {
                session.state = SessionState::Ampulheta;
                session.action = "Esperando notícias após reinício".into();
            }
            sessions.insert(session.id.clone(), session);
        }
        let decisions = store
            .load_decisions(at)?
            .into_iter()
            .map(|view| {
                (
                    view.id.clone(),
                    decisions::Pending {
                        view,
                        sender: None,
                        tool_use_id: None,
                    },
                )
            })
            .collect();
        let (events, _) = broadcast::channel(64);
        Ok(Self {
            data: Arc::new(Mutex::new(Data {
                store,
                sessions,
                agents: HashMap::new(),
                retention_days,
                completed_minutes,
                decisions,
            })),
            events,
            permission_seconds: Arc::new(AtomicU64::new(120)),
        })
    }

    /// Configure the wait for new permissions, always below the 130-second hook limit.
    pub fn set_permission_seconds(&self, seconds: u64) -> Result<()> {
        if !(1..=120).contains(&seconds) {
            return Err("Invalid permission timeout".into());
        }
        self.permission_seconds.store(seconds, Ordering::Relaxed);
        Ok(())
    }

    /// Current deadline policy; changes affect new requests only.
    pub fn permission_seconds(&self) -> u64 {
        self.permission_seconds.load(Ordering::Relaxed)
    }

    /// Subscribe before taking a snapshot to avoid losing concurrent deltas.
    pub fn subscribe(&self) -> broadcast::Receiver<StateEvent> {
        self.events.subscribe()
    }

    /// Enforce session/step retention, hide completed sessions and derive quiet states.
    pub fn snapshot(&self, at: u64) -> Result<Snapshot> {
        let mut data = self.data.lock().map_err(|_| "State lock unavailable")?;
        data.prune(at)?;
        let mut sessions: Vec<_> = data
            .sessions
            .values()
            .filter(|s| s.visible(at, data.completed_minutes))
            .map(|s| s.at_time(at))
            .collect();
        sessions.sort_by_key(|s| {
            (
                std::cmp::Reverse(s.state.priority()),
                std::cmp::Reverse(s.started_at),
                s.id.clone(),
            )
        });
        let mut decisions: Vec<_> = data
            .decisions
            .values()
            .filter(|d| {
                d.view.status == "pending"
                    || d.view.resolved_at.is_some_and(|end| {
                        at.saturating_sub(end)
                            < if d.view.status == "expired" {
                                600_000
                            } else {
                                5000
                            }
                    })
            })
            .map(|d| d.view.clone())
            .collect();
        decisions.sort_by_key(|d| (d.created_at, d.id.clone()));
        for session in &mut sessions {
            if decisions
                .iter()
                .any(|d| d.session_id == session.id && d.status == "pending")
            {
                session.state = SessionState::Interrogacao;
                session.action = "Esperando sua permissão".into();
            }
        }
        Ok(Snapshot {
            sessions,
            decisions,
        })
    }

    /// Apply a verified hook. Extra payload fields are ignored, never serialized.
    pub fn hook(&self, route: &str, body: &[u8], at: u64) -> Result<()> {
        let hook: Hook = serde_json::from_slice(body)?;
        if !hook.valid(route) {
            return Err("Invalid hook contract".into());
        }
        let mut data = self.data.lock().map_err(|_| "State lock unavailable")?;
        data.prune(at)?;
        let completed_minutes = data.completed_minutes;
        data.sessions
            .retain(|_, s| s.visible(at, completed_minutes));
        let session_ids: HashSet<_> = data.sessions.keys().cloned().collect();
        data.agents.retain(|id, _| session_ids.contains(id));
        let mut session = match data.sessions.get(&hook.session_id) {
            Some(session) => session.clone(),
            None => data
                .store
                .session(&hook.session_id)?
                .unwrap_or_else(|| Session::new(hook.session_id.clone(), &hook.cwd, at)),
        };
        // An ended session is immutable until an explicit new SessionStart.
        if session.ended_at.is_some() && route != "SessionStart" {
            return Ok(());
        }
        if !data.sessions.contains_key(&hook.session_id) && data.sessions.len() >= 256 {
            return Err("Live session capacity reached".into());
        }
        if route == "SessionStart" && session.ended_at.is_some() {
            session = Session::new(hook.session_id.clone(), &hook.cwd, at);
        }
        session.update_cwd(&hook.cwd);
        session.last_event_at = at;
        let tool = hook.tool();
        let target = sanitize::target(&hook.tool_input);
        let mut agents = data.agents.get(&session.id).cloned().unwrap_or_default();
        match route {
            "SessionStart" => {
                agents.clear();
                session.started_at = at;
                session.state = SessionState::Respingo;
                session.action = "Sessão iniciada".into();
                session.origin = hook.origin();
            }
            "UserPromptSubmit" => {
                session.state = SessionState::Orbita;
                session.action = "Pensando".into();
            }
            "PreToolUse" => {
                let editing = matches!(
                    hook.tool_name.as_deref(),
                    Some("Edit" | "Write" | "NotebookEdit")
                );
                session.state = if editing {
                    SessionState::Pena
                } else {
                    SessionState::Orbita
                };
                session.action = if editing {
                    format!("Editando {target}")
                } else {
                    format!("{}: {target}", tool.as_deref().unwrap_or("Ferramenta"))
                };
            }
            "PostToolUse" => {
                session.state = SessionState::Orbita;
                session.action = format!("{} concluída", tool.as_deref().unwrap_or("Ferramenta"));
            }
            "PostToolUseFailure" => {
                session.state = SessionState::Mancha;
                session.action = format!("Falhou: {}", tool.as_deref().unwrap_or("Ferramenta"));
            }
            "PermissionRequest" => {
                session.state = SessionState::Interrogacao;
                session.action = "Esperando sua permissão".into();
            }
            "Notification" => {
                if matches!(
                    hook.notification_type.as_deref(),
                    Some("idle_prompt" | "permission_prompt")
                ) {
                    session.state = SessionState::Ampulheta;
                    session.action = "Esperando você".into();
                }
            }
            "SubagentStart" => {
                if let Some(id) = hook.agent_id {
                    if agents.len() >= 256 && !agents.contains(&id) {
                        return Err("Subagent capacity reached".into());
                    }
                    agents.insert(id);
                }
                session.state = SessionState::Divisao;
                session.action = format!("{} subagentes", agents.len());
            }
            "SubagentStop" => {
                if let Some(id) = hook.agent_id {
                    agents.remove(&id);
                }
                session.state = if agents.is_empty() {
                    SessionState::Orbita
                } else {
                    SessionState::Divisao
                };
                session.action = format!("{} subagentes", agents.len());
            }
            "Stop" => {
                agents.clear();
                session.state = SessionState::Gota;
                session.action = "Terminou o turno".into();
            }
            "SessionEnd" => {
                agents.clear();
                session.state = SessionState::Selo;
                session.action = "Concluída".into();
                session.ended_at = Some(at);
            }
            _ => unreachable!("validated event"),
        }
        session.action = sanitize::summary(&session.action, 240);
        session.step(
            tool,
            if route == "PostToolUseFailure" {
                Some(false)
            } else if route == "PostToolUse" {
                Some(true)
            } else {
                None
            },
            at,
        );
        data.store.save(&session)?;
        data.agents.insert(session.id.clone(), agents);
        data.sessions.insert(session.id.clone(), session.clone());
        let _ = self.events.send(StateEvent::Session(session));
        let cancel_ids: Vec<_> =
            if matches!(route, "SessionEnd" | "SessionStart" | "UserPromptSubmit") {
                data.decisions
                    .values()
                    .filter(|d| d.view.session_id == hook.session_id && d.view.status == "pending")
                    .map(|d| d.view.id.clone())
                    .collect()
            } else if matches!(route, "PostToolUse" | "PostToolUseFailure") {
                data.decisions
                    .values()
                    .filter(|d| {
                        d.view.session_id == hook.session_id
                            && d.view.status == "pending"
                            && hook.tool_use_id.is_some()
                            && d.tool_use_id == hook.tool_use_id
                    })
                    .map(|d| d.view.id.clone())
                    .collect()
            } else {
                vec![]
            };
        for id in cancel_ids {
            self.expire_locked(&mut data, &id);
        }
        Ok(())
    }

    /// Record a sanitized milestone only for a known live session.
    pub fn report(&self, session_id: &str, text: &str, at: u64) -> Result<()> {
        if text.is_empty() || text.chars().count() > 140 {
            return Err("Invalid report length".into());
        }
        let mut data = self.data.lock().map_err(|_| "State lock unavailable")?;
        data.prune(at)?;
        let mut session = data
            .sessions
            .get(session_id)
            .filter(|s| s.ended_at.is_none())
            .cloned()
            .ok_or("Unknown live session")?;
        session.action = sanitize::summary(text, 140);
        session.last_event_at = at;
        session.step(None, None, at);
        data.store.save(&session)?;
        data.sessions.insert(session.id.clone(), session.clone());
        let _ = self.events.send(StateEvent::Session(session));
        Ok(())
    }

    /// Configure retention without exposing any raw event history.
    pub fn set_retention_days(&self, days: u16, at: u64) -> Result<()> {
        if !(1..=365).contains(&days) {
            return Err("Retention must be 1 to 365 days".into());
        }
        let mut data = self.data.lock().map_err(|_| "State lock unavailable")?;
        let before = at.saturating_sub(u64::from(days) * 86_400_000);
        data.store.set_retention(days, before)?;
        data.prune_memory(before);
        data.retention_days = days;
        Ok(())
    }

    /// Reevaluate the bounded live list immediately when its visibility changes.
    /// The caller supplies the current timestamp, as for retention changes.
    pub fn set_completed_minutes(&self, minutes: u16, at: u64) -> Result<()> {
        if !(1..=1440).contains(&minutes) {
            return Err("Completed visibility must be 1 to 1440 minutes".into());
        }
        let mut data = self.data.lock().map_err(|_| "State lock unavailable")?;
        data.prune(at)?;
        let sessions = data
            .store
            .load(at, minutes)?
            .into_iter()
            .map(|stored| {
                let current = data.sessions.get(&stored.id).cloned().unwrap_or(stored);
                (current.id.clone(), current)
            })
            .collect();
        data.store.set_policy("completed_minutes", minutes)?;
        data.sessions = sessions;
        let session_ids: HashSet<_> = data.sessions.keys().cloned().collect();
        data.agents.retain(|id, _| session_ids.contains(id));
        data.completed_minutes = minutes;
        Ok(())
    }

    /// Commit both desktop policies, retention cleanup and visibility in one transaction.
    pub fn set_policies(&self, days: u16, minutes: u16, at: u64) -> Result<()> {
        if !(1..=365).contains(&days) || !(1..=1440).contains(&minutes) {
            return Err("Invalid history policies".into());
        }
        let mut data = self.data.lock().map_err(|_| "State lock unavailable")?;
        let before = at.saturating_sub(u64::from(days) * 86_400_000);
        let stored = data.store.set_policies(days, minutes, before, at)?;
        data.prune_memory(before);
        data.sessions = stored
            .into_iter()
            .map(|stored| {
                let current = data.sessions.get(&stored.id).cloned().unwrap_or(stored);
                (current.id.clone(), current)
            })
            .collect();
        let session_ids: HashSet<_> = data.sessions.keys().cloned().collect();
        data.agents.retain(|id, _| session_ids.contains(id));
        data.retention_days = days;
        data.completed_minutes = minutes;
        Ok(())
    }

    /// Remove stored and in-memory history. The app supplies the explicit UI gesture.
    pub fn clear_history(&self) -> Result<()> {
        let mut data = self.data.lock().map_err(|_| "State lock unavailable")?;
        data.store.clear()?;
        data.sessions.clear();
        data.agents.clear();
        for pending in data.decisions.values_mut() {
            if let Some(sender) = pending.sender.take() {
                let _ =
                    sender.send(serde_json::json!({"answer":null,"reason":"scribe_unavailable"}));
            }
        }
        data.decisions.clear();
        let _ = self.events.send(StateEvent::Snapshot(Snapshot {
            sessions: vec![],
            decisions: vec![],
        }));
        Ok(())
    }
}
#[cfg(feature = "desktop")]
pub mod desktop;
