use scribe_core::Core;
use serde_json::json;
use tempfile::TempDir;

const DAY: u64 = 86_400_000;
fn hook(core: &Core, id: &str, event: &str, at: u64) {
    core.hook(
        event,
        &serde_json::to_vec(&json!({
            "hook_event_name": event, "session_id": id, "cwd": "/public/project"
        }))
        .unwrap(),
        at,
    )
    .unwrap();
}

#[test]
fn combined_policy_failure_rolls_back_both_settings_cleanup_and_memory() {
    let temp = TempDir::new().unwrap();
    let path = temp.path().join("state.db");
    let at = 20 * DAY;
    let core = Core::open(&path, at).unwrap();
    hook(&core, "live", "SessionStart", at - 2 * DAY);
    hook(&core, "live", "Stop", at);
    hook(&core, "completed", "SessionStart", at - 21 * 60_000);
    hook(&core, "completed", "SessionEnd", at - 20 * 60_000);
    let db = rusqlite::Connection::open(&path).unwrap();
    db.execute_batch(
        "PRAGMA journal_mode=TRUNCATE;
        CREATE TRIGGER fail_second BEFORE INSERT ON settings
        WHEN NEW.key='completed_minutes' BEGIN SELECT RAISE(ABORT, 'PUBLIC_FAILURE'); END;",
    )
    .unwrap();
    assert!(core.set_policies(1, 30, at).is_err());
    let before = core.snapshot(at).unwrap();
    assert_eq!(before.sessions.len(), 1);
    assert_eq!(before.sessions[0].steps.len(), 2);
    assert_eq!(
        db.query_row("SELECT COUNT(*) FROM settings", [], |r| r.get::<_, u32>(0))
            .unwrap(),
        0
    );
    db.execute_batch("DROP TRIGGER fail_second").unwrap();
    core.set_policies(1, 30, at).unwrap();
    let after = core.snapshot(at).unwrap();
    assert_eq!(after.sessions.len(), 2);
    assert_eq!(
        after
            .sessions
            .iter()
            .find(|s| s.id == "live")
            .unwrap()
            .steps
            .len(),
        1
    );
    assert_eq!(
        db.query_row(
            "SELECT value FROM settings WHERE key='retention_days'",
            [],
            |r| r.get::<_, u16>(0)
        )
        .unwrap(),
        1
    );
    drop(core);
    let reopened = Core::open(&path, at).unwrap();
    assert_eq!(reopened.snapshot(at).unwrap().sessions.len(), 2);
}

#[test]
fn combined_policy_rejects_invalid_values_without_creating_settings() {
    let temp = TempDir::new().unwrap();
    let path = temp.path().join("state.db");
    let core = Core::open(&path, 0).unwrap();
    for (days, minutes) in [(0, 10), (366, 10), (14, 0), (14, 1441)] {
        assert!(core.set_policies(days, minutes, 0).is_err());
    }
    let db = rusqlite::Connection::open(path).unwrap();
    assert_eq!(
        db.query_row("SELECT COUNT(*) FROM settings", [], |r| r.get::<_, u32>(0))
            .unwrap(),
        0
    );
}
