//! Notifications contain a project label only. Activation opens a live card;
//! it never carries a decision action or credentials.
use crate::Decision;
use std::{
    collections::HashSet,
    sync::{
        atomic::{AtomicUsize, Ordering},
        Arc,
    },
};

const MAX_LISTENERS: usize = 8;

#[derive(Default)]
pub(crate) struct Notifications {
    seen: HashSet<String>,
    listeners: Arc<AtomicUsize>,
}

pub(crate) struct Listener(Arc<AtomicUsize>);
impl Drop for Listener {
    fn drop(&mut self) {
        self.0.fetch_sub(1, Ordering::Relaxed);
    }
}

impl Notifications {
    pub(crate) fn new_requests<'a>(
        &mut self,
        decisions: &'a [Decision],
        enabled: bool,
        foreground: bool,
        at: u64,
    ) -> Vec<&'a Decision> {
        let live = |d: &&Decision| d.status == "pending" && d.expires_at > at;
        self.seen
            .retain(|id| decisions.iter().filter(live).any(|d| d.id == *id));
        let mut pending: Vec<_> = decisions.iter().filter(live).collect();
        pending.sort_by_key(|d| d.created_at);
        pending
            .into_iter()
            .filter(|d| self.seen.insert(d.id.clone()) && enabled && !foreground)
            .collect()
    }

    // An OS backend may retain its callback indefinitely. The hard cap keeps
    // missing dismissal events from creating an unbounded number of threads.
    pub(crate) fn listener(&self) -> Option<Listener> {
        self.listeners
            .fetch_update(Ordering::Relaxed, Ordering::Relaxed, |n| {
                (n < MAX_LISTENERS).then_some(n + 1)
            })
            .ok()
            .map(|_| Listener(self.listeners.clone()))
    }
}

pub(crate) fn body(project: &str, portuguese: bool) -> String {
    // The project was sanitized by the core; keep OS previews small and omit
    // paths, commands, question/plan text and answers.
    let project: String = project.chars().take(80).collect();
    if portuguese {
        format!("{project} precisa de uma resposta. Clique para abrir o Scribe.")
    } else {
        format!("{project} needs a response. Click to open Scribe.")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn request(id: &str) -> Decision {
        serde_json::from_value(serde_json::json!({
            "id": id, "sessionId": "session", "project": "demo", "kind": "permission",
            "tool": "Bash", "target": "SECRET_COMMAND", "question": null, "options": [],
            "risk": false, "canAllow": true, "armed": false, "status": "pending",
            "createdAt": 1, "expiresAt": 100, "resolvedAt": null
        }))
        .unwrap()
    }

    #[test]
    fn only_new_live_background_requests_notify_and_resume_does_not_repeat() {
        let mut notifications = Notifications::default();
        let one = request("one");
        assert!(notifications
            .new_requests(std::slice::from_ref(&one), false, false, 2)
            .is_empty());
        assert!(notifications
            .new_requests(std::slice::from_ref(&one), true, false, 3)
            .is_empty());
        let two = request("two");
        assert!(notifications
            .new_requests(&[one.clone(), two.clone()], true, true, 4)
            .is_empty());
        let three = request("three");
        let requests = [one, two, three];
        let first = notifications.new_requests(&requests, true, false, 5);
        assert_eq!(first.len(), 1);
        assert_eq!(first[0].id, "three");
        assert!(notifications
            .new_requests(&requests, true, false, 6)
            .is_empty());
        assert!(notifications
            .new_requests(&[request("expired")], true, false, 100)
            .is_empty());
        let mut resolved = request("resolved");
        resolved.status = "allowed".into();
        assert!(notifications
            .new_requests(&[resolved], true, false, 5)
            .is_empty());
    }

    #[test]
    fn listener_cap_releases_on_drop_and_previews_exclude_decision_content() {
        let notifications = Notifications::default();
        let listeners: Vec<_> = (0..MAX_LISTENERS)
            .map(|_| notifications.listener().unwrap())
            .collect();
        assert!(notifications.listener().is_none());
        drop(listeners);
        assert!(notifications.listener().is_some());
        let decision = request("one");
        let preview = body(&decision.project, true);
        assert!(preview.contains("demo"));
        assert!(!preview.contains(&decision.target));
        assert!(body("demo", false).contains("needs a response"));
    }
}
