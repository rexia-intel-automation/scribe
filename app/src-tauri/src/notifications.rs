//! Notifications contain a session/project label only. Activation opens a live card;
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
        if self.listeners.fetch_add(1, Ordering::Relaxed) >= MAX_LISTENERS {
            self.listeners.fetch_sub(1, Ordering::Relaxed);
            None
        } else {
            Some(Listener(self.listeners.clone()))
        }
    }

    pub(crate) fn defer(&mut self, id: &str) {
        self.seen.remove(id);
    }
}

pub(crate) fn body(project: &str, template: &str) -> String {
    // The project was sanitized by the core; keep OS previews small and omit
    // paths, commands, question/plan text and answers.
    let project = if crate::sanitize::ambiguous_text(project) {
        "Scribe"
    } else {
        project
    };
    let project: String = project.chars().take(80).collect();
    template.replace("{project}", &project)
}

pub(crate) fn body_key(kind: &str) -> &'static str {
    match kind {
        "permission" => "notificationPermission",
        "question" | "nativeQuestion" => "notificationQuestion",
        "plan" => "notificationPlan",
        _ => "notificationBody",
    }
}

pub(crate) fn escape_markup(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
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
    fn localized_previews_identify_the_need_without_exposing_decision_content() {
        for (messages, permission, question, plan) in [
            (
                include_str!("../../ui/src/i18n/en.json"),
                "demo needs your permission",
                "demo has a question",
                "demo needs your plan approval",
            ),
            (
                include_str!("../../ui/src/i18n/pt-BR.json"),
                "demo precisa da sua permissão",
                "demo tem uma pergunta",
                "demo precisa da sua aprovação do plano",
            ),
        ] {
            let messages: serde_json::Value = serde_json::from_str(messages).unwrap();
            let mut decision = request("preview");
            decision.question = Some("PRIVATE_QUESTION_CONTENT".into());
            decision.plan_file_path = Some("PRIVATE_PLAN_PATH".into());
            for (kind, expected) in [
                ("permission", permission),
                ("question", question),
                ("nativeQuestion", question),
                ("plan", plan),
            ] {
                decision.kind = kind.into();
                let preview = body(
                    &decision.project,
                    messages[body_key(&decision.kind)].as_str().unwrap(),
                );
                assert_eq!(preview, expected);
                for private in [
                    &decision.target,
                    decision.question.as_ref().unwrap(),
                    decision.plan_file_path.as_ref().unwrap(),
                ] {
                    assert!(!preview.contains(private));
                }
            }
            let fallback = body("demo", messages[body_key("futureKind")].as_str().unwrap());
            assert!(fallback.contains("demo"));
        }
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
        let preview = body(&decision.project, "{project} precisa de uma resposta.");
        assert!(preview.contains("demo"));
        assert!(!preview.contains(&decision.target));
        assert!(body("demo", "{project} needs a response").contains("needs a response"));
        assert_eq!(body("demo\u{202e}hidden", "{project}"), "Scribe");
        assert_eq!(
            escape_markup("<a href='x'>A&B</a>"),
            "&lt;a href='x'&gt;A&amp;B&lt;/a&gt;"
        );
    }

    #[test]
    fn capacity_deferred_request_retries_while_live_but_not_after_pause() {
        let mut notifications = Notifications::default();
        let requests = [request("one")];
        assert_eq!(
            notifications.new_requests(&requests, true, false, 2).len(),
            1
        );
        notifications.defer("one");
        assert_eq!(
            notifications.new_requests(&requests, true, false, 3).len(),
            1
        );
        notifications.defer("one");
        assert!(notifications
            .new_requests(&requests, false, false, 4)
            .is_empty());
        assert!(notifications
            .new_requests(&requests, true, false, 5)
            .is_empty());
    }
}
