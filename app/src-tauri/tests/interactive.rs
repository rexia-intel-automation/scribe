use rusqlite::Connection;
use scribe_core::{now_ms, Core, Decision, DecisionInput};
use serde_json::{json, Value};
use std::{fs, path::Path, time::Duration};
use tempfile::TempDir;

fn start(core: &Core, session: &str) {
    let body = json!({
        "hook_event_name": "SessionStart",
        "session_id": session,
        "cwd": "/public/project",
    });
    core.hook("SessionStart", &body.to_string().into_bytes(), now_ms())
        .unwrap();
}

fn question_input(session: &str, questions: Value) -> Vec<u8> {
    json!({
        "hook_event_name": "PreToolUse",
        "session_id": session,
        "cwd": "/public/project",
        "tool_name": "AskUserQuestion",
        "tool_use_id": "ask-public-1",
        "tool_input": { "questions": questions },
    })
    .to_string()
    .into_bytes()
}

fn native_question(question: &str, multi_select: bool) -> Value {
    json!({
        "question": question,
        "header": "Choice",
        "options": [
            { "label": "Option A", "description": "First choice" },
            { "label": "Option B", "description": "Second choice" },
        ],
        "multiSelect": multi_select,
    })
}

fn unicode_questions(question_length: usize) -> Value {
    Value::Array(
        (0..4)
            .map(|index| {
                json!({
                    "question": format!("{index}{}", "\u{20000}".repeat(question_length)),
                    "header": "H",
                    "options": [
                        {"label": format!("A{}", "\u{20000}".repeat(39)), "description": "D"},
                        {"label": format!("B{}", "\u{20000}".repeat(39)), "description": "D"},
                    ],
                    "multiSelect": true,
                })
            })
            .collect(),
    )
}

#[tokio::test]
async fn pending_session_action_distinguishes_questions_plans_and_permissions() {
    let temp = TempDir::new().unwrap();
    let core = Core::open(&temp.path().join("state.db"), now_ms()).unwrap();
    for session in ["mcp", "native", "plan", "permission"] {
        start(&core, session);
    }
    let waits = [
        core.question("mcp", "Choose?", &["A".into(), "B".into()], 60).unwrap(),
        core.interactive(&question_input("native", json!([native_question("Choose?", false)])), 60).unwrap(),
        core.interactive(&plan_input("plan", "1. Inspect", "/public/plan.md"), 60).unwrap(),
        core.permission(&json!({"hook_event_name":"PermissionRequest", "session_id":"permission", "cwd":"/public/project", "tool_name":"Bash", "tool_input":{"command":"echo public"}}).to_string().into_bytes(), 60).unwrap(),
    ];
    let snapshot = core.snapshot(now_ms()).unwrap();
    for (session_id, expected) in [
        ("mcp", "Fez uma pergunta"),
        ("native", "Fez uma pergunta"),
        ("plan", "Esperando sua aprovação do plano"),
        ("permission", "Esperando sua permissão"),
    ] {
        let session = snapshot
            .sessions
            .iter()
            .find(|s| s.id == session_id)
            .unwrap();
        assert_eq!(session.action, expected);
        let decision = snapshot
            .decisions
            .iter()
            .find(|d| d.session_id == session_id)
            .unwrap();
        core.resolve_decision(&decision.id, input(json!({"action":"terminal"})))
            .unwrap();
        let resolved = core.snapshot(now_ms()).unwrap();
        assert!(!resolved
            .decisions
            .iter()
            .any(|d| d.session_id == session_id && d.status == "pending"));
        // A permission returned to the terminal is still waiting there. The
        // question/plan overlay, however, must not outlive its pending card.
        if session_id != "permission" {
            assert_ne!(
                resolved
                    .sessions
                    .iter()
                    .find(|s| s.id == session_id)
                    .unwrap()
                    .action,
                expected
            );
        }
    }
    drop(waits);
}

#[tokio::test]
async fn questions_with_oversized_valid_answers_stay_in_terminal() {
    let temp = TempDir::new().unwrap();
    let core = Core::open(&temp.path().join("state.db"), now_ms()).unwrap();
    start(&core, "unicode-large");
    let questions = unicode_questions(158);
    let mut updated = json!({"questions": questions.clone()});
    let answers = questions
        .as_array()
        .unwrap()
        .iter()
        .map(|q| {
            (
                q["question"].as_str().unwrap().to_owned(),
                Value::String(format!(
                    "{},{}",
                    q["options"][0]["label"].as_str().unwrap(),
                    q["options"][1]["label"].as_str().unwrap()
                )),
            )
        })
        .collect::<serde_json::Map<_, _>>();
    updated["answers"] = Value::Object(answers);
    let response = json!({"hookSpecificOutput": {"hookEventName":"PreToolUse", "permissionDecision":"allow", "updatedInput":updated}});
    assert_eq!(
        serde_json::to_vec(&json!({"questions":questions.clone()}))
            .unwrap()
            .len(),
        4291
    );
    assert_eq!(serde_json::to_vec(&response).unwrap().len(), 8217);
    assert!(core
        .interactive(&question_input("unicode-large", questions), 60)
        .is_err());
    assert!(core.snapshot(now_ms()).unwrap().decisions.is_empty());
}

#[tokio::test]
async fn largest_free_answers_fit_exact_transport_boundary() {
    let temp = TempDir::new().unwrap();
    let core = Core::open(&temp.path().join("state.db"), now_ms()).unwrap();
    start(&core, "unicode-boundary");
    let mut questions = unicode_questions(90);
    questions[0]["options"][0]["description"] = Value::String("D".repeat(212));
    let body = question_input("unicode-boundary", questions.clone());
    let wait = core.interactive(&body, 60).unwrap();
    let id = pending_id(&core, "unicode-boundary");
    let text = "\u{20000}".repeat(200);
    core.resolve_decision(
        &id,
        input(json!({
            "action": "answer", "answers": (0..4).map(|_| json!({"text":text})).collect::<Vec<_>>(),
        })),
    )
    .unwrap();
    let response = wait.receive().await;
    assert_eq!(serde_json::to_vec(&response).unwrap().len(), 8192);
    assert_eq!(
        response["hookSpecificOutput"]["updatedInput"]["questions"],
        questions
    );
    for question in questions.as_array().unwrap() {
        assert_eq!(
            response["hookSpecificOutput"]["updatedInput"]["answers"]
                [question["question"].as_str().unwrap()],
            text
        );
    }

    start(&core, "unicode-over-boundary");
    questions[0]["options"][0]["description"] = Value::String("D".repeat(213));
    assert!(core
        .interactive(&question_input("unicode-over-boundary", questions), 60)
        .is_err());
    assert!(core
        .snapshot(now_ms())
        .unwrap()
        .decisions
        .iter()
        .all(|d| d.status != "pending"));
}

fn plan_input(session: &str, plan: &str, path: &str) -> Vec<u8> {
    json!({
        "hook_event_name": "PreToolUse",
        "session_id": session,
        "cwd": "/public/project",
        "tool_name": "ExitPlanMode",
        "tool_use_id": "plan-public-1",
        "tool_input": { "plan": plan, "planFilePath": path, "allowedPrompts": [] },
    })
    .to_string()
    .into_bytes()
}

fn input(value: Value) -> DecisionInput {
    serde_json::from_value(value).unwrap()
}

fn pending_id(core: &Core, session: &str) -> String {
    core.snapshot(now_ms())
        .unwrap()
        .decisions
        .into_iter()
        .find(|d| d.session_id == session && d.status == "pending")
        .unwrap()
        .id
}

fn decision(core: &Core, id: &str) -> Decision {
    core.snapshot(now_ms())
        .unwrap()
        .decisions
        .into_iter()
        .find(|decision| decision.id == id)
        .unwrap()
}

fn database_text(path: &Path) -> String {
    String::from_utf8_lossy(&fs::read(path).unwrap()).into_owned()
}

fn persisted_decisions(path: &Path) -> String {
    let connection = Connection::open(path).unwrap();
    let mut statement = connection.prepare("SELECT data FROM decisions").unwrap();
    let rows = statement
        .query_map([], |row| row.get::<_, String>(0))
        .unwrap();
    let values = rows.map(|row| row.unwrap()).collect::<Vec<_>>();
    values.join("\n")
}

#[tokio::test]
async fn native_questions_echo_original_questions_and_answers_by_question_text() {
    let temp = TempDir::new().unwrap();
    let core = Core::open(&temp.path().join("state.db"), now_ms()).unwrap();
    start(&core, "native-session");
    let original_questions = json!([
        native_question("Choose one", false),
        native_question("Choose several", true),
        native_question("Describe the goal", false),
        native_question("Choose one more", false),
    ]);
    let original = question_input("native-session", original_questions.clone());
    let wait = core.interactive(&original, 60).unwrap();
    let id = pending_id(&core, "native-session");
    let card = decision(&core, &id);
    assert_eq!(card.kind, "nativeQuestion");
    assert_eq!(card.native_questions.len(), 4);

    core.resolve_decision(
        &id,
        input(json!({
            "action": "answer",
            "answers": [
                { "options": [1] },
                { "options": [0, 1] },
                { "text": "A short free-form answer" },
                { "options": [0] },
            ],
        })),
    )
    .unwrap();
    let response = wait.receive().await;
    let updated = &response["hookSpecificOutput"]["updatedInput"];
    assert_eq!(updated["questions"], original_questions);
    assert_eq!(updated["answers"]["Choose one"], "Option B");
    assert_eq!(updated["answers"]["Choose several"], "Option A,Option B");
    assert_eq!(
        updated["answers"]["Describe the goal"],
        "A short free-form answer"
    );
    assert_eq!(updated["answers"]["Choose one more"], "Option A");
    assert!(core
        .resolve_decision(&id, input(json!({"action":"deny"})))
        .is_err());
}

#[tokio::test]
async fn one_question_accepts_answer_and_invalid_answer_sets_leave_card_pending() {
    let temp = TempDir::new().unwrap();
    let core = Core::open(&temp.path().join("state.db"), now_ms()).unwrap();
    start(&core, "single-session");
    let body = question_input(
        "single-session",
        json!([native_question("Pick one", false)]),
    );
    let wait = core.interactive(&body, 60).unwrap();
    let id = pending_id(&core, "single-session");

    for invalid in [
        json!({"action":"answer","answers":[]}),
        json!({"action":"answer","answers":[{"options":[0,1]}]}),
        json!({"action":"answer","answers":[{"options":[0,0]}]}),
        json!({"action":"answer","answers":[{"options":[2]}]}),
        json!({"action":"answer","answers":[{"options":[0],"text":"conflict"}]}),
        json!({"action":"answer","answers":[{"options":[0]}, {"options":[1]}]}),
    ] {
        assert!(core.resolve_decision(&id, input(invalid)).is_err());
        assert_eq!(decision(&core, &id).status, "pending");
    }
    assert!(serde_json::from_value::<DecisionInput>(json!({
        "action":"answer", "answers":[], "unexpected":true
    }))
    .is_err());

    core.resolve_decision(
        &id,
        input(json!({"action":"answer","answers":[{"options":[0]}]})),
    )
    .unwrap();
    assert_eq!(
        wait.receive().await["hookSpecificOutput"]["updatedInput"]["answers"]["Pick one"],
        "Option A"
    );
}

#[tokio::test]
async fn plan_allow_echoes_original_content_and_deny_fails_closed() {
    let temp = TempDir::new().unwrap();
    let path = temp.path().join("state.db");
    let core = Core::open(&path, now_ms()).unwrap();
    start(&core, "plan-allow");
    let body = plan_input("plan-allow", "Step 1: inspect", "/public/project/PLAN.md");
    let wait = core.interactive(&body, 60).unwrap();
    let id = pending_id(&core, "plan-allow");
    let card = decision(&core, &id);
    assert_eq!(card.kind, "plan");
    assert!(card.risk);
    assert!(card.can_allow);
    assert!(!card.armed);
    assert_eq!(card.target, "Step 1: inspect");
    assert_eq!(
        card.plan_file_path.as_deref(),
        Some("/public/project/PLAN.md")
    );
    let original: Value = serde_json::from_slice(&body).unwrap();

    for invalid in [
        json!({"action":"allow"}),
        json!({"action":"allow","option":0}),
        json!({"action":"allow","message":"not empty"}),
        json!({"action":"allow","answers":[]}),
        json!({"action":"answer","answers":[]}),
        json!({"action":"arm","option":0}),
        json!({"action":"arm","message":"not empty"}),
        json!({"action":"arm","answers":[]}),
    ] {
        assert!(core.resolve_decision(&id, input(invalid)).is_err());
        assert_eq!(decision(&core, &id).status, "pending");
    }
    core.resolve_decision(&id, input(json!({"action":"arm"})))
        .unwrap();
    assert!(decision(&core, &id).armed);
    assert!(core
        .resolve_decision(&id, input(json!({"action":"arm"})))
        .is_err());
    assert!(core
        .resolve_decision(&id, input(json!({"action":"allow"})))
        .is_err());
    assert_eq!(decision(&core, &id).status, "pending");
    tokio::time::sleep(Duration::from_millis(1050)).await;
    core.resolve_decision(&id, input(json!({"action":"allow"})))
        .unwrap();
    let response = wait.receive().await;
    assert_eq!(
        response["hookSpecificOutput"]["updatedInput"],
        original["tool_input"]
    );

    start(&core, "plan-deny");
    let wait = core
        .interactive(
            &plan_input("plan-deny", "Step 1: inspect", "/public/project/PLAN.md"),
            60,
        )
        .unwrap();
    let id = pending_id(&core, "plan-deny");
    let secret = "sk-ant-PUBLIC_PLAN_DENIAL_SECRET";
    assert!(core
        .resolve_decision(&id, input(json!({"action":"deny","message":secret})))
        .is_err());
    assert_eq!(decision(&core, &id).status, "pending");
    assert!(!persisted_decisions(&path).contains(secret));
    assert!(!database_text(&path).contains(secret));
    let feedback = "I need a clearer plan before continuing.";
    core.resolve_decision(&id, input(json!({"action":"deny","message":feedback})))
        .unwrap();
    let response = wait.receive().await;
    assert_eq!(response["hookSpecificOutput"]["permissionDecision"], "deny");
    assert_eq!(
        response["hookSpecificOutput"]["hookEventName"],
        "PreToolUse"
    );
    assert_eq!(
        response["hookSpecificOutput"]["permissionDecisionReason"],
        feedback
    );
    assert!(feedback.chars().count() <= 200);
}

#[tokio::test]
async fn invalid_native_inputs_are_rejected_without_persisting_secrets() {
    let temp = TempDir::new().unwrap();
    let path = temp.path().join("state.db");
    let core = Core::open(&path, now_ms()).unwrap();
    start(&core, "invalid-session");
    let valid = native_question("Choose", false);
    let secret = "sk-ant-PUBLIC_INTERACTIVE_SECRET";
    let oversized = Value::Array(
        (0..4)
            .map(|q| {
                json!({
                    "question": format!("Question {q}"),
                    "header": "Choice",
                    "options": (0..4)
                        .map(|o| json!({
                            "label": format!("Option {q}-{o}"),
                            "description": "x".repeat(400),
                        }))
                        .collect::<Vec<_>>(),
                })
            })
            .collect(),
    );
    let invalid_inputs = [
        json!([]),
        json!([valid.clone(), valid.clone()]),
        json!([{
            "question":"Choose", "header":"Choice", "options":[
                {"label":"Same","description":"A"},
                {"label":"Same ","description":"B"}
            ]
        }]),
        json!([{
            "question":"Choose", "header":"Choice", "options":[
                {"label":"A","description":"A"},
                {"label":"B","description":"B"}
            ], "unknown":"field"
        }]),
        json!([native_question("bad\u{202e}question", false)]),
        json!([native_question(&format!("credential {secret}"), false)]),
        json!([native_question(&"x".repeat(2001), false)]),
        oversized,
        json!([
            valid.clone(),
            valid.clone(),
            valid.clone(),
            valid.clone(),
            valid.clone()
        ]),
    ];
    for questions in invalid_inputs {
        let body = question_input("invalid-session", questions);
        assert!(core.interactive(&body, 60).is_err());
        assert!(core
            .snapshot(now_ms())
            .unwrap()
            .decisions
            .iter()
            .all(|d| d.status != "pending"));
    }
    assert!(!persisted_decisions(&path).contains(secret));
    assert!(!database_text(&path).contains(secret));
}

#[tokio::test]
async fn free_text_answers_are_not_persisted() {
    let temp = TempDir::new().unwrap();
    let path = temp.path().join("state.db");
    let core = Core::open(&path, now_ms()).unwrap();
    start(&core, "free-text-session");
    let body = question_input(
        "free-text-session",
        json!([native_question("Describe", false)]),
    );
    let wait = core.interactive(&body, 60).unwrap();
    let id = pending_id(&core, "free-text-session");
    let private_answer = "PUBLIC_FREE_TEXT_RESPONSE_NOT_STORED";
    core.resolve_decision(
        &id,
        input(json!({"action":"answer","answers":[{"text":private_answer}]})),
    )
    .unwrap();
    assert_eq!(
        wait.receive().await["hookSpecificOutput"]["updatedInput"]["answers"]["Describe"],
        private_answer
    );
    assert!(!persisted_decisions(&path).contains(private_answer));
    assert!(!database_text(&path).contains(private_answer));
}

#[tokio::test]
async fn drop_session_end_and_timeout_cancel_without_authorizing() {
    let temp = TempDir::new().unwrap();
    let core = Core::open(&temp.path().join("state.db"), now_ms()).unwrap();
    start(&core, "drop-session");
    let wait = core
        .interactive(
            &question_input("drop-session", json!([native_question("Choose", false)])),
            60,
        )
        .unwrap();
    let id = pending_id(&core, "drop-session");
    drop(wait);
    assert!(core
        .resolve_decision(&id, input(json!({"action":"allow"})))
        .is_err());
    assert_eq!(
        core.snapshot(now_ms()).unwrap().decisions[0].status,
        "expired"
    );

    start(&core, "terminal-session");
    let wait = core
        .interactive(
            &question_input(
                "terminal-session",
                json!([native_question("Choose", false)]),
            ),
            60,
        )
        .unwrap();
    let id = pending_id(&core, "terminal-session");
    core.resolve_decision(&id, input(json!({"action":"terminal"})))
        .unwrap();
    assert_eq!(wait.receive().await["answer"], Value::Null);

    start(&core, "end-session");
    let wait = core
        .interactive(
            &question_input("end-session", json!([native_question("Choose", false)])),
            60,
        )
        .unwrap();
    let end = json!({
        "hook_event_name":"SessionEnd",
        "session_id":"end-session",
        "cwd":"/public/project"
    });
    core.hook("SessionEnd", &end.to_string().into_bytes(), now_ms())
        .unwrap();
    assert_eq!(wait.receive().await["answer"], Value::Null);

    start(&core, "timeout-session");
    let wait = core
        .interactive(
            &question_input("timeout-session", json!([native_question("Choose", false)])),
            1,
        )
        .unwrap();
    assert_eq!(
        wait.receive().await,
        json!({"answer":null,"reason":"timeout"})
    );
    let id = core
        .snapshot(now_ms())
        .unwrap()
        .decisions
        .into_iter()
        .find(|d| d.session_id == "timeout-session")
        .unwrap()
        .id;
    assert!(core
        .resolve_decision(&id, input(json!({"action":"allow"})))
        .is_err());
}

#[tokio::test]
async fn matching_post_tool_use_cancels_native_question() {
    let temp = TempDir::new().unwrap();
    let core = Core::open(&temp.path().join("state.db"), now_ms()).unwrap();
    start(&core, "post-tool-session");
    let questions = json!([native_question("Choose", false)]);
    let wait = core
        .interactive(&question_input("post-tool-session", questions.clone()), 60)
        .unwrap();
    let id = pending_id(&core, "post-tool-session");
    let completed = json!({
        "hook_event_name":"PostToolUse",
        "session_id":"post-tool-session",
        "cwd":"/public/project",
        "tool_name":"AskUserQuestion",
        "tool_use_id":"ask-public-1",
        "tool_input":{"questions":questions},
    });
    core.hook("PostToolUse", &completed.to_string().into_bytes(), now_ms())
        .unwrap();
    assert_eq!(
        wait.receive().await,
        json!({"answer":null,"reason":"scribe_unavailable"})
    );
    assert!(core
        .resolve_decision(
            &id,
            input(json!({"action":"answer","answers":[{"options":[0]}]}))
        )
        .is_err());
}
