use rusqlite::Connection;
use scribe_core::Core;
use serde_json::{json, Value};
use tempfile::tempdir;

fn hook(core: &Core, event: &str, title: Option<&str>, at: u64) {
    let mut body = json!({
        "hook_event_name": event,
        "session_id": "session-1",
        "cwd": "C:/work/project",
    });
    if let Some(title) = title {
        body["session_title"] = json!(title);
    }
    core.hook(event, body.to_string().as_bytes(), at).unwrap();
}

fn title(core: &Core) -> Option<String> {
    core.snapshot(1_000)
        .unwrap()
        .sessions
        .into_iter()
        .find(|session| session.id == "session-1")
        .unwrap()
        .title
}

#[test]
fn custom_title_renames_persists_and_loads_legacy_sessions() {
    let dir = tempdir().unwrap();
    let db = dir.path().join("sessions.sqlite");
    let core = Core::open(&db, 100).unwrap();
    hook(&core, "SessionStart", Some("Initial title"), 100);
    hook(&core, "UserPromptSubmit", Some("Renamed session"), 200);
    assert_eq!(title(&core).as_deref(), Some("Renamed session"));
    hook(&core, "UserPromptSubmit", None, 300);
    assert_eq!(title(&core).as_deref(), Some("Renamed session"));
    drop(core);

    let core = Core::open(&db, 400).unwrap();
    assert_eq!(title(&core).as_deref(), Some("Renamed session"));
    drop(core);

    let connection = Connection::open(&db).unwrap();
    let data: String = connection
        .query_row(
            "SELECT data FROM sessions WHERE id='session-1'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    let mut legacy: Value = serde_json::from_str(&data).unwrap();
    legacy.as_object_mut().unwrap().remove("title");
    connection
        .execute(
            "UPDATE sessions SET data=?1 WHERE id='session-1'",
            [legacy.to_string()],
        )
        .unwrap();
    drop(connection);

    let core = Core::open(&db, 500).unwrap();
    assert_eq!(title(&core), None);
    hook(&core, "UserPromptSubmit", Some("New title"), 600);
    assert_eq!(title(&core).as_deref(), Some("New title"));
}

#[test]
fn title_redacts_secrets_rejects_controls_and_allows_explicit_clear() {
    let dir = tempdir().unwrap();
    let core = Core::open(&dir.path().join("sessions.sqlite"), 100).unwrap();
    hook(
        &core,
        "SessionStart",
        Some("Release sk-ant-PUBLIC123456789"),
        100,
    );
    let saved = title(&core).unwrap();
    assert!(!saved.contains("sk-ant-PUBLIC123456789"));
    assert!(saved.chars().count() <= 80);

    hook(&core, "UserPromptSubmit", Some(&"x".repeat(100)), 150);
    let limited = title(&core).unwrap();
    assert!(limited.chars().count() <= 80);

    hook(&core, "UserPromptSubmit", Some("bad\u{202e}title"), 200);
    assert_eq!(title(&core).as_deref(), Some(limited.as_str()));
    hook(&core, "UserPromptSubmit", Some("     "), 300);
    assert_eq!(title(&core), None);
}
