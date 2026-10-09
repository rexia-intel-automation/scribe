#![cfg(windows)]

use rusqlite::Connection;
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

fn reader_snapshot(path: &Path) -> Connection {
    let reader = Connection::open(path).unwrap();
    let mode: String = reader
        .query_row("PRAGMA journal_mode", [], |row| row.get(0))
        .unwrap();
    assert_eq!(mode, "wal", "Core should use WAL for normal writes");
    reader.execute_batch("BEGIN DEFERRED;").unwrap();
    let _: i64 = reader
        .query_row("SELECT COUNT(*) FROM sessions", [], |row| row.get(0))
        .unwrap();
    reader
}

fn database_bytes(path: &Path) -> Vec<u8> {
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

fn contains(bytes: &[u8], marker: &str) -> bool {
    bytes
        .windows(marker.len())
        .any(|window| window == marker.as_bytes())
}

fn policy(path: &Path, key: &str) -> u16 {
    let db = Connection::open(path).unwrap();
    let value = db
        .query_row("SELECT value FROM settings WHERE key=?1", [key], |row| {
            row.get(0)
        })
        .unwrap();
    drop(db);
    value
}

#[tokio::test]
async fn reader_blocks_clear_before_database_or_pending_state_changes() {
    let temp = TempDir::new().unwrap();
    let path = temp.path().join("state.db");
    let at = now_ms();
    let core = Core::open(&path, at).unwrap();
    core.set_policies(14, 10, at).unwrap();
    start(&core, "clear-session", at);
    let session_marker = "SCRIBE_WAL_CLEAR_SESSION_6A17";
    let decision_marker = "SCRIBE_WAL_CLEAR_DECISION_91C2";
    core.report("clear-session", session_marker, at + 1)
        .unwrap();
    let wait = core
        .question(
            "clear-session",
            decision_marker,
            &["Option A".into(), "Option B".into()],
            60,
        )
        .unwrap();
    let before = database_bytes(&path);
    assert!(contains(&before, session_marker));
    assert!(contains(&before, decision_marker));

    let reader = reader_snapshot(&path);
    assert!(core.clear_history().is_err());
    let unchanged = core.snapshot(at + 2).unwrap();
    assert_eq!(unchanged.sessions.len(), 1);
    assert_eq!(unchanged.decisions.len(), 1);
    assert_eq!(unchanged.decisions[0].status, "pending");
    assert_eq!(policy(&path, "retention_days"), 14);
    assert_eq!(policy(&path, "completed_minutes"), 10);
    let blocked = database_bytes(&path);
    assert!(contains(&blocked, session_marker));
    assert!(contains(&blocked, decision_marker));

    drop(reader);
    core.clear_history().unwrap();
    assert_eq!(wait.receive().await["reason"], "scribe_unavailable");
    assert!(core.snapshot(at + 3).unwrap().sessions.is_empty());
    assert!(core.snapshot(at + 3).unwrap().decisions.is_empty());
    let cleared = database_bytes(&path);
    assert!(!contains(&cleared, session_marker));
    assert!(!contains(&cleared, decision_marker));
    drop(core);

    let reopened = Core::open(&path, at + 4).unwrap();
    let snapshot = reopened.snapshot(at + 4).unwrap();
    assert!(snapshot.sessions.is_empty());
    assert!(snapshot.decisions.is_empty());
    assert!(!contains(&database_bytes(&path), session_marker));
    assert!(!contains(&database_bytes(&path), decision_marker));
}

#[test]
fn reader_blocks_retention_and_retry_physically_prunes_old_rows() {
    let temp = TempDir::new().unwrap();
    let path = temp.path().join("state.db");
    let now = now_ms();
    let core = Core::open(&path, now).unwrap();
    core.set_policies(14, 10, now).unwrap();
    let marker = "SCRIBE_WAL_RETENTION_OLD_4F8B";
    let old_at = now.saturating_sub(3 * DAY_MS);
    start(&core, "old-session", old_at);
    core.report("old-session", marker, old_at + 1).unwrap();
    assert_eq!(policy(&path, "retention_days"), 14);
    assert!(contains(&database_bytes(&path), marker));

    let reader = reader_snapshot(&path);
    assert!(core.set_retention_days(1, now).is_err());
    let unchanged = core.snapshot(now).unwrap();
    assert_eq!(unchanged.sessions.len(), 1);
    assert_eq!(unchanged.sessions[0].id, "old-session");
    assert_eq!(policy(&path, "retention_days"), 14);
    assert!(contains(&database_bytes(&path), marker));

    drop(reader);
    core.set_retention_days(1, now).unwrap();
    assert!(core.snapshot(now).unwrap().sessions.is_empty());
    assert_eq!(policy(&path, "retention_days"), 1);
    assert!(!contains(&database_bytes(&path), marker));
}

#[test]
fn reader_blocks_visibility_and_combined_policy_updates_until_retry() {
    let temp = TempDir::new().unwrap();
    let path = temp.path().join("state.db");
    let now = now_ms();
    let core = Core::open(&path, now).unwrap();
    core.set_policies(14, 10, now).unwrap();
    let marker = "SCRIBE_WAL_COMBINED_OLD_2D61";
    let old_at = now.saturating_sub(3 * DAY_MS);
    start(&core, "old-session", old_at);
    core.report("old-session", marker, old_at + 1).unwrap();
    let visibility_reader = reader_snapshot(&path);
    core.set_completed_minutes(30, now).unwrap();
    assert_eq!(policy(&path, "completed_minutes"), 30);
    assert_eq!(policy(&path, "retention_days"), 14);
    assert_eq!(core.snapshot(now).unwrap().sessions.len(), 1);
    assert!(contains(&database_bytes(&path), marker));
    drop(visibility_reader);

    let combined_reader = reader_snapshot(&path);
    assert!(core.set_policies(1, 60, now).is_err());
    assert_eq!(policy(&path, "completed_minutes"), 30);
    assert_eq!(policy(&path, "retention_days"), 14);
    assert_eq!(core.snapshot(now).unwrap().sessions.len(), 1);
    assert!(contains(&database_bytes(&path), marker));
    drop(combined_reader);

    core.set_policies(1, 60, now).unwrap();
    assert_eq!(policy(&path, "completed_minutes"), 60);
    assert_eq!(policy(&path, "retention_days"), 1);
    assert!(core.snapshot(now).unwrap().sessions.is_empty());
    assert!(!contains(&database_bytes(&path), marker));
}
