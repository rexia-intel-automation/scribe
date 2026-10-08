use crate::sanitize::{redact, shorten_path, summary};
use serde::{Deserialize, Serialize};
use serde_json::Value;

pub(crate) const EVENTS: &[&str] = &[
    "SessionStart",
    "UserPromptSubmit",
    "PreToolUse",
    "PostToolUse",
    "PostToolUseFailure",
    "PermissionRequest",
    "Notification",
    "SubagentStart",
    "SubagentStop",
    "Stop",
    "SessionEnd",
];
pub(crate) const TEN_MINUTES: u64 = 600_000;

/// The nine session forms used by hooks; the tenth form is the empty-app dot.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum SessionState {
    Respingo,
    Gota,
    Orbita,
    Pena,
    Interrogacao,
    Ampulheta,
    Mancha,
    Divisao,
    Selo,
}

impl SessionState {
    /// Priority used by the app header, collapsed window and tray.
    pub fn priority(self) -> u8 {
        match self {
            Self::Interrogacao => 5,
            Self::Mancha => 4,
            Self::Pena | Self::Orbita | Self::Divisao => 3,
            Self::Ampulheta => 2,
            _ => 1,
        }
    }
}

/// A sanitized progress entry. Tool outputs and original payloads are excluded.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Step {
    pub at: u64,
    pub tool: Option<String>,
    pub summary: String,
    pub ok: Option<bool>,
}

/// Persisted and displayed session data, containing only sanitized metadata.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub id: String,
    pub project: String,
    #[serde(default)]
    pub title: Option<String>,
    pub cwd: String,
    pub origin: Option<String>,
    pub state: SessionState,
    pub action: String,
    pub started_at: u64,
    pub last_event_at: u64,
    pub steps: Vec<Step>,
    pub ended_at: Option<u64>,
}

impl Session {
    pub(crate) fn new(id: String, cwd: &str, at: u64) -> Self {
        let mut session = Self {
            id,
            project: String::new(),
            title: None,
            cwd: String::new(),
            origin: None,
            state: SessionState::Gota,
            action: "Sessão iniciada".into(),
            started_at: at,
            last_event_at: at,
            steps: vec![],
            ended_at: None,
        };
        session.update_cwd(cwd);
        session
    }

    pub(crate) fn update_cwd(&mut self, cwd: &str) {
        let normalized = cwd.replace('\\', "/");
        let project = normalized
            .trim_end_matches('/')
            .rsplit('/')
            .next()
            .unwrap_or("?");
        self.project = summary(project, 80);
        self.cwd = shorten_path(cwd);
    }

    pub(crate) fn visible(&self, now: u64, completed_minutes: u16) -> bool {
        self.ended_at
            .is_none_or(|end| now.saturating_sub(end) < u64::from(completed_minutes) * 60_000)
    }

    pub(crate) fn at_time(&self, now: u64) -> Self {
        let mut session = self.clone();
        if session.state == SessionState::Respingo && now.saturating_sub(session.started_at) >= 1500
        {
            session.state = SessionState::Gota;
        }
        if session.ended_at.is_none()
            && session.state != SessionState::Mancha
            && now.saturating_sub(session.last_event_at) >= TEN_MINUTES
        {
            session.state = SessionState::Ampulheta;
            session.action = format!(
                "sem notícias há {} min",
                now.saturating_sub(session.last_event_at) / 60_000
            );
        }
        session
    }

    pub(crate) fn step(&mut self, tool: Option<String>, ok: Option<bool>, at: u64) {
        self.steps.push(Step {
            at,
            tool,
            summary: self.action.clone(),
            ok,
        });
        if self.steps.len() > 20 {
            self.steps.remove(0);
        }
    }
}

#[derive(Deserialize)]
pub(crate) struct Hook {
    pub hook_event_name: String,
    pub session_id: String,
    pub cwd: String,
    pub tool_name: Option<String>,
    #[serde(default)]
    pub tool_input: Value,
    pub agent_id: Option<String>,
    pub source: Option<String>,
    pub notification_type: Option<String>,
    pub session_title: Option<String>,
    pub tool_use_id: Option<String>,
    #[serde(default)]
    pub permission_suggestions: Value,
}

impl Hook {
    pub(crate) fn session_title(&self) -> Option<Option<String>> {
        self.session_title.as_deref().and_then(|title| {
            if crate::sanitize::ambiguous_text(title) {
                return None;
            }
            let title = title.trim();
            Some((!title.is_empty()).then(|| summary(title, 79)))
        })
    }

    pub(crate) fn valid(&self, route: &str) -> bool {
        EVENTS.contains(&route)
            && self.hook_event_name == route
            && identifier(&self.session_id)
            && !self.cwd.is_empty()
            && self.cwd.len() <= 8192
            && self
                .tool_name
                .as_ref()
                .is_none_or(|s| !s.is_empty() && s.len() <= 128)
            && self.agent_id.as_ref().is_none_or(|s| identifier(s))
    }
    pub(crate) fn tool(&self) -> Option<String> {
        self.tool_name.as_deref().map(|s| summary(s, 80))
    }
    pub(crate) fn origin(&self) -> Option<String> {
        self.source
            .as_deref()
            .filter(|s| ["startup", "resume", "clear", "compact"].contains(s))
            .map(redact)
    }
}

pub(crate) fn identifier(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 256
        && redact(id) == id
        && id
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || c == b'-' || c == b'_')
}

/// Full snapshot for initial synchronization or recovery after missed deltas.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub sessions: Vec<Session>,
    pub decisions: Vec<crate::Decision>,
}

/// An update contains sanitized state only; credentials are never serialized.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", content = "data", rename_all = "lowercase")]
pub enum StateEvent {
    Snapshot(Snapshot),
    Session(Session),
    Decision(crate::Decision),
}
