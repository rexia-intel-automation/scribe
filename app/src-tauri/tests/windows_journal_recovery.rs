#![cfg(windows)]

use rusqlite::Connection;
use std::{
    fs,
    process::{Command, Stdio},
    thread,
    time::{Duration, Instant},
};
use tempfile::TempDir;

const TEST_NAME: &str = "windows_journal_recovery_recovers_hot_truncate_journal";
const CHILD_DATABASE: &str = "SCRIBE_TEST_JOURNAL_RECOVERY_CHILD_DATABASE";
const JOURNAL_MAGIC: [u8; 8] = [0xd9, 0xd5, 0x05, 0xf9, 0x20, 0xa1, 0x63, 0xd7];

#[test]
fn windows_journal_recovery_recovers_hot_truncate_journal() {
    if let Some(path) = std::env::var_os(CHILD_DATABASE) {
        leave_hot_journal(path.as_ref());
        unreachable!("the crash child exits without running destructors");
    }

    let temp = TempDir::new().unwrap();
    let path = temp.path().join("state.db");
    let core = scribe_core::Core::open(&path, 0).unwrap();
    core.set_retention_days(14, 0).unwrap();
    drop(core);

    let mut child = Command::new(std::env::current_exe().unwrap())
        .args(["--exact", TEST_NAME, "--nocapture"])
        .env(CHILD_DATABASE, &path)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .unwrap();
    let deadline = Instant::now() + Duration::from_secs(10);
    let status = loop {
        if let Some(status) = child.try_wait().unwrap() {
            break status;
        }
        if Instant::now() >= deadline {
            child.kill().unwrap();
            let _ = child.wait();
            panic!("journal crash child exceeded the 10-second deadline and was killed");
        }
        thread::sleep(Duration::from_millis(10));
    };
    assert_eq!(status.code(), Some(83), "crash child status: {status}");

    let journal_path = path.with_file_name(format!(
        "{}-journal",
        path.file_name().unwrap().to_string_lossy()
    ));
    let journal = fs::read(&journal_path).expect("crash child must leave a journal");
    assert!(journal.len() > 512, "hot journal must exceed 512 bytes");
    assert_eq!(&journal[..8], &JOURNAL_MAGIC, "journal header magic");

    let recovered = scribe_core::Core::open(&path, 0).unwrap();
    assert!(recovered.snapshot(0).unwrap().decisions.is_empty());
    drop(recovered);

    let remaining_journal_len = match fs::metadata(&journal_path) {
        Ok(metadata) => metadata.len(),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => 0,
        Err(error) => panic!("cannot inspect the recovered journal: {error}"),
    };
    assert_eq!(
        remaining_journal_len, 0,
        "recovery should clear the journal"
    );

    let db = Connection::open(&path).unwrap();
    let retention_days: u16 = db
        .query_row(
            "SELECT value FROM settings WHERE key='retention_days'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    let decisions: i64 = db
        .query_row("SELECT COUNT(*) FROM decisions", [], |row| row.get(0))
        .unwrap();
    let integrity: String = db
        .query_row("PRAGMA integrity_check", [], |row| row.get(0))
        .unwrap();
    assert_eq!(retention_days, 14);
    assert_eq!(decisions, 0);
    assert_eq!(integrity, "ok");
}

fn leave_hot_journal(path: &std::ffi::OsStr) {
    let db = Connection::open(path).unwrap();
    db.execute_batch(
        "PRAGMA journal_mode=TRUNCATE;
         PRAGMA synchronous=FULL;
         PRAGMA secure_delete=ON;
         PRAGMA cache_size=1;
         PRAGMA cache_spill=ON;
         BEGIN IMMEDIATE;
         UPDATE settings SET value=30 WHERE key='retention_days';",
    )
    .unwrap();
    db.execute(
        "INSERT INTO decisions(id, created_at, data) VALUES(?1, 0, ?2)",
        rusqlite::params![
            "crash-child-invalid-public-decision",
            "x".repeat(384 * 1024)
        ],
    )
    .unwrap();
    std::process::exit(83);
}
