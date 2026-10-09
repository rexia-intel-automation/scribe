use scribe_core::{now_ms, Core};
use serde_json::json;
use std::{fs, path::Path};
use tempfile::TempDir;

const DAY_MS: u64 = 86_400_000;

fn start(core: &Core, session_id: &str, at: u64) {
    let body = json!({
        "hook_event_name": "SessionStart",
        "session_id": session_id,
        "cwd": "/public/project",
    });
    core.hook("SessionStart", body.to_string().as_bytes(), at)
        .unwrap();
}

fn report(core: &Core, session_id: &str, marker: &str, at: u64) {
    core.report(session_id, marker, at).unwrap();
}

fn files_for_database(path: &Path) -> Vec<u8> {
    let mut bytes = Vec::new();
    for suffix in ["", "-journal", "-wal", "-shm"] {
        let candidate = path.with_file_name(format!(
            "{}{}",
            path.file_name().unwrap().to_string_lossy(),
            suffix
        ));
        if candidate.exists() {
            bytes.extend(fs::read(candidate).unwrap());
        }
    }
    bytes
}

fn contains_marker(bytes: &[u8], marker: &str) -> bool {
    bytes
        .windows(marker.len())
        .any(|window| window == marker.as_bytes())
}

#[tokio::test]
async fn clear_history_removes_session_and_decision_bytes() {
    let temp = TempDir::new().unwrap();
    let path = temp.path().join("state.db");
    let core = Core::open(&path, now_ms()).unwrap();
    start(&core, "clear-session", now_ms());

    let session_marker = "SCRIBE_CLEAR_SESSION_MARKER_7B43A9";
    let decision_marker = "SCRIBE_CLEAR_DECISION_MARKER_19D6F2";
    report(&core, "clear-session", session_marker, now_ms());
    let wait = core
        .question(
            "clear-session",
            decision_marker,
            &["Option A".into(), "Option B".into()],
            60,
        )
        .unwrap();

    let before = files_for_database(&path);
    assert!(contains_marker(&before, session_marker));
    assert!(contains_marker(&before, decision_marker));

    core.clear_history().unwrap();
    let response = wait.receive().await;
    assert_eq!(response["reason"], "scribe_unavailable");

    let after = files_for_database(&path);
    assert!(!contains_marker(&after, session_marker));
    assert!(!contains_marker(&after, decision_marker));
    assert!(core.snapshot(now_ms()).unwrap().sessions.is_empty());
    assert!(core.snapshot(now_ms()).unwrap().decisions.is_empty());
}

#[test]
fn retention_prunes_old_session_and_decision_bytes_but_keeps_current_session() {
    let temp = TempDir::new().unwrap();
    let path = temp.path().join("state.db");
    let now = now_ms();
    let core = Core::open(&path, now).unwrap();

    let old_session_marker = "SCRIBE_RETENTION_OLD_SESSION_53C7A1";
    let decision_marker = "SCRIBE_RETENTION_OLD_DECISION_8A2E41";
    let current_session_marker = "SCRIBE_RETENTION_CURRENT_SESSION_0D9B64";
    let old_at = now.saturating_sub(3 * DAY_MS);
    start(&core, "expired-session", old_at);
    report(&core, "expired-session", old_session_marker, old_at + 1);
    start(&core, "active-session", now);
    drop(
        core.question(
            "active-session",
            decision_marker,
            &["Option A".into(), "Option B".into()],
            60,
        )
        .unwrap(),
    );

    let future = now.saturating_add(3 * DAY_MS);
    start(&core, "active-session", future);
    report(&core, "active-session", current_session_marker, future);

    let before = files_for_database(&path);
    for marker in [old_session_marker, decision_marker, current_session_marker] {
        assert!(contains_marker(&before, marker));
    }

    core.set_retention_days(1, future).unwrap();
    let live_files = files_for_database(&path);
    for marker in [old_session_marker, decision_marker] {
        assert!(!contains_marker(&live_files, marker));
    }
    assert!(contains_marker(&live_files, current_session_marker));
    drop(core);

    let after = files_for_database(&path);
    for marker in [old_session_marker, decision_marker] {
        assert!(!contains_marker(&after, marker));
    }
    assert!(contains_marker(&after, current_session_marker));

    let reopened = Core::open(&path, future).unwrap();
    let snapshot = reopened.snapshot(future).unwrap();
    assert_eq!(snapshot.sessions.len(), 1);
    assert_eq!(snapshot.sessions[0].id, "active-session");
    assert!(snapshot.decisions.is_empty());
}

#[test]
fn failed_clear_rolls_back_deletions_and_leaves_later_writes_durable() {
    let temp = TempDir::new().unwrap();
    let path = temp.path().join("state.db");
    let core = Core::open(&path, now_ms()).unwrap();
    start(&core, "clear-failure-session", now_ms());
    let waiting = core
        .question(
            "clear-failure-session",
            "public question",
            &["Option A".into(), "Option B".into()],
            60,
        )
        .unwrap();
    let db = rusqlite::Connection::open(&path).unwrap();
    #[cfg(windows)]
    db.execute_batch("PRAGMA journal_mode=WAL;").unwrap();
    db.execute_batch(
        "CREATE TRIGGER fail_clear_decisions BEFORE DELETE ON decisions
         BEGIN SELECT RAISE(ABORT, 'PUBLIC_CLEAR_FAILURE'); END;",
    )
    .unwrap();
    drop(db);

    assert!(core.clear_history().is_err());
    let unchanged = core.snapshot(now_ms()).unwrap();
    assert_eq!(unchanged.sessions.len(), 1);
    assert_eq!(unchanged.decisions.len(), 1);
    drop(waiting);
    report(
        &core,
        "clear-failure-session",
        "after failed clear",
        now_ms(),
    );
    drop(core);

    let db = rusqlite::Connection::open(&path).unwrap();
    let saved_action: String = db
        .query_row(
            "SELECT json_extract(data, '$.action') FROM sessions WHERE id=?1",
            ["clear-failure-session"],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(saved_action, "after failed clear");
    drop(db);
    let reopened = Core::open(&path, now_ms()).unwrap();
    let snapshot = reopened.snapshot(now_ms()).unwrap();
    assert_eq!(snapshot.sessions.len(), 1);
    assert_eq!(snapshot.decisions.len(), 1);
}
