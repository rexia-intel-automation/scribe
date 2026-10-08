//! Human decisions are bounded, single-use and tied to a live transport.
use crate::sanitize::ambiguous_text;
use crate::{model::Hook, now_ms, sanitize, Core, Result, StateEvent};
use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{sync::LazyLock, time::Duration};
use tokio::sync::oneshot;

static RISK: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)(\brm\s+[^\n]*(--recursive|--force|-[a-z]*[rf])|\b(rd|rmdir|del)\s+[^\n]*/[sq]|sudo\b|git\s+push\b[^\n]*(--force|-f\b)|git\s+reset\s+--hard|\b(curl|wget|iwr|Invoke-WebRequest)\b[^\n]*\|\s*(sh|bash|python[23]?|iex|Invoke-Expression)\b|chmod\s+-R\s+777|dd\s+if=|mkfs\b|drop\s+table|--prod\b|production|kubectl\s+delete|terraform\s+apply|npm\s+publish|Remove-Item\b[^\n]*-Recurse|\b(Format-Volume|Stop-Computer|Restart-Computer|Set-ExecutionPolicy|iex|Invoke-Expression)\b|\bStart-Process\b[^\n]*-Verb\b[^\n]*\bRunAs\b)").unwrap()
});

/// Sanitized display data. Original tool inputs and tool results are excluded.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Decision {
    pub id: String,
    pub session_id: String,
    pub project: String,
    pub kind: String,
    pub tool: Option<String>,
    pub target: String,
    pub question: Option<String>,
    pub options: Vec<String>,
    pub risk: bool,
    #[serde(default)]
    pub can_allow: bool,
    pub armed: bool,
    pub status: String,
    pub created_at: u64,
    pub expires_at: u64,
    pub resolved_at: Option<u64>,
}

/// Only the authenticated UI accepts this input; hook and MCP callers cannot resolve it.
#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DecisionInput {
    pub action: Option<String>,
    pub option: Option<usize>,
    pub message: Option<String>,
}

pub(crate) struct Pending {
    pub view: Decision,
    pub sender: Option<oneshot::Sender<Value>>,
    pub tool_use_id: Option<String>,
    pub tool_key: Option<String>,
    pub deadline: Option<tokio::time::Instant>,
    pub armed_at: Option<tokio::time::Instant>,
}

/// Dropping a disconnected request invalidates its card immediately.
pub struct DecisionWait {
    core: Core,
    id: String,
    receiver: oneshot::Receiver<Value>,
    deadline: tokio::time::Instant,
}
impl DecisionWait {
    /// Await one answer, or expire without granting permission.
    pub async fn receive(mut self) -> Value {
        match tokio::time::timeout_at(self.deadline, &mut self.receiver).await {
            Ok(Ok(value)) => value,
            _ => {
                self.core.expire_decision(&self.id);
                json!({"answer":null,"reason":"timeout"})
            }
        }
    }
}
impl Drop for DecisionWait {
    fn drop(&mut self) {
        self.core.expire_decision(&self.id);
    }
}

impl Core {
    /// Register a permission while retaining only command/path metadata.
    pub fn permission(&self, body: &[u8], seconds: u64) -> Result<DecisionWait> {
        if !(1..=120).contains(&seconds) {
            return Err("Invalid permission timeout".into());
        }
        let hook: Hook = serde_json::from_slice(body)?;
        if !hook.valid("PermissionRequest") || hook.tool_name.is_none() {
            return Err("Invalid permission".into());
        }
        self.hook("PermissionRequest", body, now_ms())?;
        let target = [
            "command",
            "file_path",
            "path",
            "url",
            "notebook_path",
            "pattern",
        ]
        .iter()
        .find_map(|key| hook.tool_input.get(key).and_then(Value::as_str));
        let allowed_fields: &[&str] = match hook.tool_name.as_deref() {
            Some("Bash" | "PowerShell") => {
                &["command", "description", "timeout", "run_in_background"]
            }
            Some("Read") => &["file_path", "offset", "limit", "pages"],
            Some("Glob") => &["pattern", "path"],
            Some("Grep") => &[
                "pattern",
                "path",
                "glob",
                "output_mode",
                "-B",
                "-A",
                "-C",
                "-n",
                "-i",
                "type",
                "head_limit",
                "offset",
                "multiline",
            ],
            _ => &[],
        };
        // Only known metadata-only schemas can be approved here. Write/Edit and
        // arbitrary MCP inputs stay in the terminal: their omitted content may
        // determine the action. Never persist that content just to enable approval.
        let complete = hook.tool_input.as_object().is_some_and(|fields| {
            !fields.is_empty()
                && fields.iter().all(|(key, value)| {
                    allowed_fields.contains(&key.as_str())
                        && (value.is_string() || value.is_number() || value.is_boolean())
                        && value.as_str().is_none_or(|s| !ambiguous_text(s))
                })
        });
        let raw_target = if complete && hook.tool_input.as_object().unwrap().len() > 1 {
            serde_json::to_string_pretty(&hook.tool_input)?
        } else {
            target.unwrap_or("Ferramenta sem alvo informado").to_owned()
        };
        let redacted = sanitize::redact(&raw_target);
        let mut display_target: String = redacted.chars().take(8000).collect();
        if redacted.chars().count() > 8000 {
            display_target.push('…');
        }
        // A hidden or unknown action must be answered in the terminal, where
        // Claude displays the original. Never weaken secret redaction to allow it.
        let can_allow = complete
            && target.is_some_and(|s| !s.is_empty() && !ambiguous_text(s))
            && display_target == raw_target;
        let tool_key = tool_key(hook.tool_name.as_deref(), &hook.tool_input);
        let view = Decision {
            id: format!("{:032x}", rand::random::<u128>()),
            session_id: hook.session_id,
            project: String::new(),
            kind: "permission".into(),
            tool: hook.tool_name.map(|s| sanitize::summary(&s, 80)),
            target: display_target,
            question: None,
            options: vec![],
            risk: !can_allow || RISK.is_match(&raw_target),
            can_allow,
            armed: false,
            status: "pending".into(),
            created_at: now_ms(),
            expires_at: now_ms() + seconds * 1000,
            resolved_at: None,
        };
        self.begin_decision(
            view,
            hook.tool_use_id,
            tool_key,
            Duration::from_secs(seconds),
        )
    }

    /// Register an MCP question for an explicitly identified live session.
    pub fn question(
        &self,
        session_id: &str,
        question: &str,
        options: &[String],
        seconds: u64,
    ) -> Result<DecisionWait> {
        if !crate::model::identifier(session_id)
            || question.is_empty()
            || question.chars().count() > 200
            || !(2..=4).contains(&options.len())
            || options
                .iter()
                .any(|s| s.is_empty() || s.chars().count() > 40)
            || !(1..=600).contains(&seconds)
        {
            return Err("Invalid question".into());
        }
        if sanitize::redact(question) != question
            || ambiguous_text(question)
            || options
                .iter()
                .any(|s| sanitize::redact(s) != *s || ambiguous_text(s))
            || options
                .iter()
                .enumerate()
                .any(|(i, s)| options[..i].iter().any(|other| other.trim() == s.trim()))
        {
            return Err("Question or options cannot be displayed unambiguously".into());
        }
        let at = now_ms();
        self.begin_decision(
            Decision {
                id: format!("{:032x}", rand::random::<u128>()),
                session_id: session_id.into(),
                project: String::new(),
                kind: "question".into(),
                tool: None,
                target: String::new(),
                question: Some(sanitize::redact(question)),
                options: options.iter().map(|s| sanitize::redact(s)).collect(),
                risk: false,
                can_allow: false,
                armed: false,
                status: "pending".into(),
                created_at: at,
                expires_at: at + seconds * 1000,
                resolved_at: None,
            },
            None,
            None,
            Duration::from_secs(seconds),
        )
    }

    fn begin_decision(
        &self,
        mut view: Decision,
        tool_use_id: Option<String>,
        tool_key: Option<String>,
        duration: Duration,
    ) -> Result<DecisionWait> {
        let mut data = self.data.lock().map_err(|_| "State lock unavailable")?;
        let session = data
            .sessions
            .get(&view.session_id)
            .filter(|s| s.ended_at.is_none())
            .ok_or("Unknown live session")?;
        view.project = session.project.clone();
        if data
            .decisions
            .values()
            .filter(|d| d.view.status == "pending")
            .count()
            >= 256
            || data.decisions.values().any(|d| {
                d.view.status == "pending"
                    && d.view.session_id == view.session_id
                    && (view.kind == "question" && d.view.kind == "question"
                        || tool_use_id.is_some() && d.tool_use_id == tool_use_id
                        || view.kind == "permission"
                            && d.view.kind == "permission"
                            && tool_key.is_some()
                            && d.tool_key == tool_key)
            })
        {
            return Err("Duplicate or excess pending decision".into());
        }
        data.store.save_decision(&view)?;
        if data.decisions.len() >= 512 {
            if let Some(oldest) = data
                .decisions
                .values()
                .filter(|d| d.view.status != "pending")
                .min_by_key(|d| d.view.created_at)
                .map(|d| d.view.id.clone())
            {
                data.decisions.remove(&oldest);
            }
        }
        let (sender, receiver) = oneshot::channel();
        let id = view.id.clone();
        let deadline = tokio::time::Instant::now() + duration;
        data.decisions.insert(
            id.clone(),
            Pending {
                view: view.clone(),
                sender: Some(sender),
                tool_use_id,
                tool_key,
                deadline: Some(deadline),
                armed_at: None,
            },
        );
        let _ = self.events.send(StateEvent::Decision(view));
        Ok(DecisionWait {
            core: self.clone(),
            id,
            receiver,
            deadline,
        })
    }

    /// Resolve exactly once, after validating type, deadline and risk confirmation.
    pub fn resolve_decision(&self, id: &str, input: DecisionInput) -> Result<()> {
        let mut data = self.data.lock().map_err(|_| "State lock unavailable")?;
        let pending = data.decisions.get(id).ok_or("Unknown decision")?;
        let mut view = pending.view.clone();
        if view.status != "pending"
            || now_ms() >= view.expires_at
            || pending
                .deadline
                .is_none_or(|at| tokio::time::Instant::now() >= at)
            || pending.sender.as_ref().is_none_or(|s| s.is_closed())
        {
            return Err("Decision no longer pending".into());
        }
        let response = if view.kind == "permission" {
            if input.option.is_some() {
                return Err("Invalid permission choice".into());
            }
            if input.action.as_deref() == Some("terminal") && input.message.is_none() {
                self.expire_locked(&mut data, id);
                return Ok(());
            }
            match input.action.as_deref() {
                Some("arm")
                    if view.can_allow && view.risk && !view.armed && input.message.is_none() =>
                {
                    view.armed = true;
                    data.store.save_decision(&view)?;
                    let pending = data.decisions.get_mut(id).unwrap();
                    pending.view = view.clone();
                    pending.armed_at = Some(tokio::time::Instant::now());
                    let _ = self.events.send(StateEvent::Decision(view));
                    return Ok(());
                }
                Some("allow")
                    if view.can_allow
                        && (!view.risk
                            || view.armed
                                && pending
                                    .armed_at
                                    .is_some_and(|at| at.elapsed() >= Duration::from_secs(1))) =>
                {
                    if input.message.is_some() {
                        return Err("Invalid permission message".into());
                    }
                    view.status = "allowed".into();
                    json!({"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"allow"}}})
                }
                Some("deny") => {
                    if input
                        .message
                        .as_ref()
                        .is_some_and(|s| s.chars().count() > 200)
                    {
                        return Err("Invalid denial message".into());
                    }
                    view.status = "denied".into();
                    json!({"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{
                        "behavior":"deny", "message":sanitize::redact(input.message.as_deref().unwrap_or("Negado pelo usuário no Scribe"))}}})
                }
                _ => return Err("Invalid permission choice".into()),
            }
        } else {
            if input.action.is_some() || input.message.is_some() {
                return Err("Invalid question choice".into());
            }
            let option = input
                .option
                .and_then(|i| view.options.get(i))
                .ok_or("Invalid question choice")?;
            let response = json!({"answer":option});
            view.status = "answered".into();
            response
        };
        view.resolved_at = Some(now_ms());
        data.store.save_decision(&view)?;
        let pending = data.decisions.get_mut(id).unwrap();
        pending.view = view.clone();
        if let Some(sender) = pending.sender.take() {
            if sender.send(response).is_err() {
                view.status = "expired".into();
                pending.view = view.clone();
                data.store.save_decision(&view)?;
                let _ = self.events.send(StateEvent::Decision(view));
                return Err("Decision transport closed".into());
            }
        }
        let _ = self.events.send(StateEvent::Decision(view));
        Ok(())
    }

    pub(crate) fn expire_decision(&self, id: &str) {
        if let Ok(mut data) = self.data.lock() {
            self.expire_locked(&mut data, id);
        }
    }

    pub(crate) fn expire_locked(&self, data: &mut crate::Data, id: &str) {
        if let Some(pending) = data.decisions.get_mut(id) {
            if pending.view.status != "pending" {
                return;
            }
            pending.view.status = "expired".into();
            pending.view.resolved_at = Some(now_ms());
            if let Some(sender) = pending.sender.take() {
                let _ = sender.send(json!({"answer":null,"reason":"scribe_unavailable"}));
            }
            let view = pending.view.clone();
            let _ = data.store.save_decision(&view);
            let _ = self.events.send(StateEvent::Decision(view));
        }
    }
}

/// A keyed digest kept only in memory. No raw tool input enters persistence.
pub(crate) fn tool_key(tool: Option<&str>, input: &Value) -> Option<String> {
    static KEY: LazyLock<String> = LazyLock::new(|| format!("{:032x}", rand::random::<u128>()));
    Some(scribe_hook_protocol::sign(
        &KEY,
        &[b"tool", tool?.as_bytes(), &serde_json::to_vec(input).ok()?],
    ))
}
