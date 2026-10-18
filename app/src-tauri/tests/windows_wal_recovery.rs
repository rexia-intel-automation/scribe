#![cfg(windows)]

use rusqlite::Connection;
use scribe_core::{now_ms, Core, DecisionInput};
use serde_json::json;
use std::{
    fs,
    path::Path,
    process::{Command, Stdio},
    thread,
    time::{Duration, Instant},
};
use tempfile::TempDir;

const TEST_NAME: &str = "windows_wal_recovery_recovers_committed_session_and_answer";
const CHILD_DATABASE: &str = "SCRIBE_TEST_WAL_RECOVERY_CHILD_DATABASE";
const REPORT_MARKER: &str = "SCRIBE_PUBLIC_WAL_RECOVERY_MARKER_73A6";
const WAL_MAGIC_0: [u8; 4] = [0x37, 0x7f, 0x06, 0x82];
const WAL_MAGIC_1: [u8; 4] = [0x37, 0x7f, 0x06, 0x83];

#[test]
fn windows_wal_recovery_recovers_committed_session_and_answer() {
    if let Some(path) = std::env::var_os(CHILD_DATABASE) {
        leave_committed_wal(path.as_ref());
        unreachable!("the crash child exits without running destructors");
    }

    let temp = TempDir::new().unwrap();
    let path = temp.path().join("state.db");
    let initial = Core::open(&path, now_ms()).unwrap();
    initial.set_policies(14, 10, now_ms()).unwrap();
    drop(initial);

    let mut child = Command::new(std::env::current_exe().unwrap())
        .args(["--exact", TEST_NAME, "--nocapture"])
        .env(CHILD_DATABASE, &path)
        .env_remove("PSModulePath")
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
            panic!("WAL crash child exceeded the 10-second deadline and was killed");
        }
        thread::sleep(Duration::from_millis(10));
    };
    assert!(
        status.code() == Some(83),
        "crash child must exit with status 83"
    );

    let wal_path = sidecar(&path, "-wal");
    let shm_path = sidecar(&path, "-shm");
    let wal = fs::read(&wal_path).expect("crash child must leave a WAL file");
    assert!(wal.len() > 32, "WAL must contain a header and frames");
    assert!(
        wal.starts_with(&WAL_MAGIC_0) || wal.starts_with(&WAL_MAGIC_1),
        "WAL must have a valid SQLite header"
    );
    assert!(contains(&wal, REPORT_MARKER));
    assert!(contains(&database_bytes(&path), REPORT_MARKER));
    assert!(shm_path.exists(), "crash child must leave the WAL index");
    assert_private_storage_acl(temp.path());

    let recovered_at = now_ms();
    let recovered = Core::open(&path, recovered_at).unwrap();
    let snapshot = recovered.snapshot(recovered_at).unwrap();
    assert!(snapshot.sessions.len() == 1, "one session should recover");
    assert!(
        snapshot.sessions[0].id == "public-wal-recovery",
        "the public synthetic session should recover"
    );
    assert!(snapshot.decisions.len() == 1, "one decision should recover");
    assert!(
        snapshot.decisions[0].kind == "question",
        "question kind should recover"
    );
    assert!(
        snapshot.decisions[0].status == "answered",
        "answered status should recover"
    );
    assert!(
        snapshot.decisions[0].question.as_deref() == Some("Choose a public option?"),
        "public question text should recover"
    );
    assert!(
        snapshot.decisions[0].options.len() == 2
            && snapshot.decisions[0].options[0] == "Public option A"
            && snapshot.decisions[0].options[1] == "Public option B",
        "public options should recover"
    );
    assert!(
        snapshot.decisions[0].resolved_at.is_some(),
        "answer timestamp should recover"
    );

    let db = Connection::open(&path).unwrap();
    let retention_days: u16 = db
        .query_row(
            "SELECT value FROM settings WHERE key='retention_days'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    let completed_minutes: u16 = db
        .query_row(
            "SELECT value FROM settings WHERE key='completed_minutes'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    let session_json: String = db
        .query_row(
            "SELECT data FROM sessions WHERE id='public-wal-recovery'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    let session_data: serde_json::Value = serde_json::from_str(&session_json).unwrap();
    let persisted_action = session_data["action"].as_str().unwrap();
    let persisted_decision: String = db
        .query_row(
            "SELECT data FROM decisions WHERE id=?1",
            [&snapshot.decisions[0].id],
            |row| row.get(0),
        )
        .unwrap();
    let decision_data: serde_json::Value = serde_json::from_str(&persisted_decision).unwrap();
    let integrity: String = db
        .query_row("PRAGMA integrity_check", [], |row| row.get(0))
        .unwrap();

    assert!(retention_days == 14, "retention policy should recover");
    assert!(completed_minutes == 10, "visibility policy should recover");
    assert!(
        persisted_action == REPORT_MARKER,
        "persisted report should recover"
    );
    assert!(
        decision_data["status"] == "answered",
        "stored answer status should recover"
    );
    assert!(
        decision_data["options"][0] == "Public option A"
            && decision_data["options"][1] == "Public option B",
        "stored public options should recover"
    );
    assert!(
        integrity == "ok",
        "recovered database should pass integrity check"
    );
}

fn leave_committed_wal(path: &std::ffi::OsStr) {
    let path = Path::new(path);
    let at = now_ms();
    let core = Core::open(path, at).unwrap();
    let session_id = "public-wal-recovery";
    core.hook(
        "SessionStart",
        &serde_json::to_vec(&json!({
            "hook_event_name": "SessionStart",
            "session_id": session_id,
            "cwd": "/public/project",
        }))
        .unwrap(),
        at,
    )
    .unwrap();
    core.report(session_id, REPORT_MARKER, at + 1).unwrap();
    let wait = core
        .question(
            session_id,
            "Choose a public option?",
            &["Public option A".into(), "Public option B".into()],
            600,
        )
        .unwrap();
    let question_id = core
        .snapshot(now_ms())
        .unwrap()
        .decisions
        .into_iter()
        .find(|decision| decision.kind == "question")
        .unwrap()
        .id;
    core.resolve_decision(
        &question_id,
        DecisionInput {
            action: None,
            option: Some(0),
            message: None,
            answers: None,
        },
    )
    .unwrap();
    let _keep_wait_live = wait;
    std::process::exit(83);
}

fn sidecar(path: &Path, suffix: &str) -> std::path::PathBuf {
    path.with_file_name(format!(
        "{}{}",
        path.file_name().unwrap().to_string_lossy(),
        suffix
    ))
}

fn database_bytes(path: &Path) -> Vec<u8> {
    let mut bytes = Vec::new();
    for suffix in ["", "-journal", "-wal", "-shm"] {
        let candidate = sidecar(path, suffix);
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

fn assert_private_storage_acl(directory: &Path) {
    let output = Command::new("powershell.exe")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "$ErrorActionPreference='Stop'; try { \
             $sid=[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value; \
             $base=$env:SCRIBE_TEST_WAL_ACL_DIRECTORY; \
             $paths=@($base, (Join-Path $base 'state.db'), \
             (Join-Path $base 'state.db-wal'), (Join-Path $base 'state.db-shm')); \
             for ($i=0; $i -lt $paths.Count; $i++) { \
             $acl=Get-Acl -LiteralPath $paths[$i]; $rules=@($acl.Access); \
             if ($rules.Count -ne 1) {exit 1}; $rule=$rules[0]; \
             if ($rule.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value -ne $sid) {exit 1}; \
             if ($rule.AccessControlType -ne [System.Security.AccessControl.AccessControlType]::Allow) {exit 1}; \
             if ($rule.FileSystemRights -ne [System.Security.AccessControl.FileSystemRights]::FullControl) {exit 1}; \
             if ($i -lt 2 -and !$acl.AreAccessRulesProtected) {exit 1}; \
             if ($i -ge 2 -and !$acl.AreAccessRulesProtected -and !$rule.IsInherited) {exit 1} \
             }; 'acl_ok'; exit 0 \
             } catch {'acl_query_failed'; exit 2}",
        ])
        .env_remove("PSModulePath")
        .env("SCRIBE_TEST_WAL_ACL_DIRECTORY", directory)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "temporary WAL storage ACL check failed"
    );
    assert!(
        String::from_utf8(output.stdout).unwrap().trim() == "acl_ok",
        "temporary storage ACL check should complete"
    );
}
