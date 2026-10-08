use scribe_core::{Core, LocalServer, SessionState, StateEvent};
use serde_json::{json, Value};
use std::{
    fs,
    path::PathBuf,
    time::{Duration, Instant},
};
use tempfile::TempDir;
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpStream,
};

const HOOK_KEY: &str = "publicIndependentHookKey0123456789012345";
const TOKEN: &str = "publicTestToken01234567890123456789";
const EVENTS: &[&str] = &[
    "SessionStart",
    "UserPromptSubmit",
    "PreToolUse",
    "PostToolUse",
    "PostToolUseFailure",
    "PermissionRequest",
    "Notification",
    "SubagentStart",
    "SubagentStop",
    "Stop",
    "SessionEnd",
];

fn payload(event: &str) -> Value {
    json!({"hook_event_name":event,"session_id":"public-session","cwd":"/public/project"})
}

fn apply(core: &Core, input: Value, at: u64) {
    let event = input["hook_event_name"].as_str().unwrap();
    core.hook(event, &serde_json::to_vec(&input).unwrap(), at)
        .unwrap();
}

#[test]
fn quoted_headers_escaped_secret_values_and_lowercase_env_never_enter_state_or_storage() {
    for (text, marker) in [
        (
            r#"{"Authorization":"Bearer PUBLIC_JSON_AUTH"}"#,
            "PUBLIC_JSON_AUTH",
        ),
        (
            r#"pwsh -Command 'Invoke-RestMethod -Headers @{"Authorization"="Bearer PUBLIC_JSON_AUTH"}'"#,
            "PUBLIC_JSON_AUTH",
        ),
        (r#"token="head\"PUBLIC_TOKEN_TAIL""#, "PUBLIC_TOKEN_TAIL"),
        (
            r#"printf 'database_url=PUBLIC_ENV_VALUE\n' > .env"#,
            "PUBLIC_ENV_VALUE",
        ),
        (
            r#"_database_url='head''PUBLIC_ENV_VALUE'"#,
            "PUBLIC_ENV_VALUE",
        ),
        (
            r#"{\"Authorization\":\"Bearer PUBLIC_ESCAPED_AUTH\"}"#,
            "PUBLIC_ESCAPED_AUTH",
        ),
        (r#"token="PUBLIC_UNTERMINATED"#, "PUBLIC_UNTERMINATED"),
    ] {
        let temp = TempDir::new().unwrap();
        let path = temp.path().join("state.db");
        let core = Core::open(&path, 0).unwrap();
        let mut input = payload("PreToolUse");
        input["tool_name"] = json!("Bash");
        input["tool_input"] = json!({"command":text});
        apply(&core, input, 0);
        core.report("public-session", text, 1).unwrap();
        let snapshot = serde_json::to_string(&core.snapshot(1).unwrap()).unwrap();
        let stored = String::from_utf8_lossy(&fs::read(path).unwrap()).into_owned();
        assert!(
            !snapshot.contains(marker),
            "State leaked synthetic marker {marker}"
        );
        assert!(
            !stored.contains(marker),
            "Storage leaked synthetic marker {marker}"
        );
    }
}

#[test]
fn credentials_with_shell_escapes_and_concatenation_never_leave_value_tails() {
    for text in [
        r#"Invoke-RestMethod -Headers @{"Authorization"="Bearer head`"PUBLIC_CREDENTIAL_TAIL"}"#,
        r#"curl -H "Authorization: Bearer head"'PUBLIC_CREDENTIAL_TAIL' https://example.invalid"#,
        r#"curl -H 'Authorization: Bearer head'"PUBLIC_CREDENTIAL_TAIL""#,
        r#"Authorization: Bearer head`"PUBLIC_CREDENTIAL_TAIL"#,
        r#"{"password":"head"'PUBLIC_CREDENTIAL_TAIL'}"#,
        r#"{"apiKey":"head`"PUBLIC_CREDENTIAL_TAIL"}"#,
        r#"{\"password\":\"head\"'PUBLIC_CREDENTIAL_TAIL'}"#,
        r#"{\\\"apiKey\\\":\\\"head\\\"'PUBLIC_CREDENTIAL_TAIL'}"#,
        "deploy --token PUBLIC_CREDENTIAL_TAIL",
        "Authorization: head\nPUBLIC_CREDENTIAL_TAIL",
    ] {
        let temp = TempDir::new().unwrap();
        let path = temp.path().join("state.db");
        let core = Core::open(&path, 0).unwrap();
        let mut input = payload("PreToolUse");
        input["tool_name"] = json!("Bash");
        input["tool_input"] = json!({"command":text});
        apply(&core, input, 0);
        let hook = serde_json::to_string(&core.snapshot(0).unwrap()).unwrap();
        assert!(!hook.contains("PUBLIC_CREDENTIAL_TAIL"));
        core.report("public-session", text, 1).unwrap();
        let report = serde_json::to_string(&core.snapshot(1).unwrap()).unwrap();
        assert!(!report.contains("PUBLIC_CREDENTIAL_TAIL"));
        assert!(
            !String::from_utf8_lossy(&fs::read(path).unwrap()).contains("PUBLIC_CREDENTIAL_TAIL")
        );
    }
}

#[test]
fn paths_next_to_shell_operators_are_shortened_in_state_and_storage() {
    for text in [
        "cat</private/PUBLIC_PARENT/project/file.rs",
        "cp /tmp/file >/private/PUBLIC_PARENT/project/file.rs",
        "type<C:\\private\\PUBLIC_PARENT\\project\\file.rs",
        "echo hi>>/private/PUBLIC_PARENT/project/file.rs",
        "cat(/private/PUBLIC_PARENT/project/file.rs)",
        "cat<\\\\server\\PUBLIC_PARENT\\project\\file.rs",
        "cc -I/private/PUBLIC_PARENT/project/file.rs",
        "cc -L/private/PUBLIC_PARENT/project/file.rs",
        "cc -isystem/private/PUBLIC_PARENT/project/file.rs",
        "cc -oC:\\private\\PUBLIC_PARENT\\project\\file.rs",
        "cc @/private/PUBLIC_PARENT/project/file.rs",
    ] {
        let temp = TempDir::new().unwrap();
        let path = temp.path().join("state.db");
        let core = Core::open(&path, 0).unwrap();
        let mut input = payload("PreToolUse");
        input["tool_name"] = json!("Bash");
        input["tool_input"] = json!({"command":text});
        apply(&core, input, 0);
        let hook = serde_json::to_string(&core.snapshot(0).unwrap()).unwrap();
        assert!(!hook.contains("PUBLIC_PARENT"));
        assert!(hook.contains("project/file.rs"));
        core.report("public-session", text, 1).unwrap();
        assert!(!serde_json::to_string(&core.snapshot(1).unwrap())
            .unwrap()
            .contains("PUBLIC_PARENT"));
        assert!(!String::from_utf8_lossy(&fs::read(path).unwrap()).contains("PUBLIC_PARENT"));
    }
}

#[test]
fn retention_removes_old_steps_from_live_and_archived_sessions() {
    const DAY: u64 = 86_400_000;
    let temp = TempDir::new().unwrap();
    let path = temp.path().join("state.db");
    let core = Core::open(&path, 0).unwrap();
    apply(&core, payload("SessionStart"), 0);
    core.report("public-session", "PUBLIC_OLD_STEP", 1).unwrap();
    let mut archived = payload("SessionStart");
    archived["session_id"] = json!("archived");
    apply(&core, archived, 0);
    core.report("archived", "PUBLIC_ARCHIVED_STEP", 1).unwrap();
    let mut end = payload("SessionEnd");
    end["session_id"] = json!("archived");
    apply(&core, end, 13 * DAY);
    apply(&core, payload("UserPromptSubmit"), 13 * DAY);
    apply(&core, payload("UserPromptSubmit"), 15 * DAY);
    core.report("public-session", "PUBLIC_RECENT_STEP", 15 * DAY + 1)
        .unwrap();
    let snapshot = core.snapshot(15 * DAY + 1).unwrap();
    assert_eq!(snapshot.sessions.len(), 1);
    assert_eq!(
        snapshot.sessions[0]
            .steps
            .iter()
            .map(|s| s.at)
            .collect::<Vec<_>>(),
        vec![13 * DAY, 15 * DAY, 15 * DAY + 1]
    );
    let rows = rusqlite::Connection::open(&path).unwrap();
    assert_eq!(
        rows.query_row("SELECT count(*) FROM sessions", [], |r| r.get::<_, i64>(0))
            .unwrap(),
        2
    );
    for marker in ["PUBLIC_OLD_STEP", "PUBLIC_ARCHIVED_STEP"] {
        assert!(!String::from_utf8_lossy(&fs::read(&path).unwrap()).contains(marker));
        assert!(!serde_json::to_string(&snapshot).unwrap().contains(marker));
    }
    let restored = Core::open(&path, 15 * DAY + 1).unwrap();
    assert_eq!(
        restored.snapshot(15 * DAY + 1).unwrap().sessions[0]
            .steps
            .len(),
        3
    );
    assert!(core.snapshot(30 * DAY + 2).unwrap().sessions.is_empty());
    assert_eq!(
        rows.query_row("SELECT count(*) FROM sessions", [], |r| r.get::<_, i64>(0))
            .unwrap(),
        0
    );
    assert!(!String::from_utf8_lossy(&fs::read(path).unwrap()).contains("PUBLIC_RECENT_STEP"));
}

#[test]
fn failed_retention_setting_rolls_back_history_and_policy() {
    const DAY: u64 = 86_400_000;
    let temp = TempDir::new().unwrap();
    let path = temp.path().join("state.db");
    let core = Core::open(&path, 0).unwrap();
    core.set_retention_days(14, 0).unwrap();
    apply(&core, payload("SessionStart"), 13 * DAY);
    let before = serde_json::to_value(core.snapshot(15 * DAY).unwrap()).unwrap();
    let db = rusqlite::Connection::open(&path).unwrap();
    db.execute_batch("CREATE TRIGGER refuse_policy BEFORE INSERT ON settings WHEN NEW.key='retention_days' BEGIN SELECT RAISE(FAIL, 'public test failure'); END;").unwrap();
    assert!(core.set_retention_days(1, 15 * DAY).is_err());
    assert_eq!(
        serde_json::to_value(core.snapshot(15 * DAY).unwrap()).unwrap(),
        before
    );
    assert_eq!(
        db.query_row(
            "SELECT value FROM settings WHERE key='retention_days'",
            [],
            |r| r.get::<_, u16>(0)
        )
        .unwrap(),
        14
    );
    assert_eq!(
        db.query_row("SELECT count(*) FROM sessions", [], |r| r.get::<_, i64>(0))
            .unwrap(),
        1
    );
    db.execute_batch("DROP TRIGGER refuse_policy;").unwrap();
    core.set_retention_days(1, 15 * DAY).unwrap();
    assert!(core.snapshot(15 * DAY).unwrap().sessions.is_empty());
    assert_eq!(
        db.query_row(
            "SELECT value FROM settings WHERE key='retention_days'",
            [],
            |r| r.get::<_, u16>(0)
        )
        .unwrap(),
        1
    );
}

#[tokio::test]
async fn idle_server_prunes_storage_without_hooks_or_ui_connections() {
    let temp = TempDir::new().unwrap();
    let path = temp.path().join("state.db");
    let old = scribe_core::now_ms() - 15 * 86_400_000;
    let core = Core::open(&path, old).unwrap();
    apply(&core, payload("SessionStart"), old);
    core.report("public-session", "PUBLIC_IDLE_METADATA", old + 1)
        .unwrap();
    let db = rusqlite::Connection::open(&path).unwrap();
    let server = LocalServer::start(core.clone(), 0, TOKEN.into(), HOOK_KEY.into())
        .await
        .unwrap();
    tokio::time::timeout(Duration::from_secs(3), async {
        loop {
            if matches!(
                db.query_row("SELECT count(*) FROM sessions", [], |r| r.get::<_, i64>(0)),
                Ok(0)
            ) {
                break;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .unwrap();
    assert!(!String::from_utf8_lossy(&fs::read(path).unwrap()).contains("PUBLIC_IDLE_METADATA"));
    assert!(core
        .snapshot(scribe_core::now_ms())
        .unwrap()
        .sessions
        .is_empty());
    server.stop().await.unwrap();
}

#[test]
fn spaced_and_multiline_env_values_are_omitted_before_persistence() {
    for text in [
        "printf 'GREETING=hello PUBLIC_ENV_TAIL\\n' > .env",
        "GREETING=hello PUBLIC_ENV_TAIL",
        "export greeting=hello PUBLIC_ENV_TAIL # comment",
        "printf 'GREETING=hello\nPUBLIC_ENV_TAIL\n' > .env.local",
        "cat > .env <<'EOF'\nGREETING=hello PUBLIC_ENV_TAIL\nEOF",
        "GREETING='hello\nPUBLIC_ENV_TAIL'",
        "GREETING=hello; PUBLIC_ENV_TAIL",
        "printf 'GREETING\\x3dhello PUBLIC_ENV_TAIL\\n' > .env",
        "printf '%s%s%s' GREETING = PUBLIC_ENV_TAIL > .env.local",
        "echo PUBLIC_ENV_TAIL | Set-Content .ENV",
        "echo PUBLIC_ENV_TAIL > config/.env.example",
    ] {
        let temp = TempDir::new().unwrap();
        let path = temp.path().join("state.db");
        let core = Core::open(&path, 0).unwrap();
        let mut input = payload("PreToolUse");
        input["tool_name"] = json!("Bash");
        input["tool_input"] = json!({"command":text});
        apply(&core, input, 0);
        let hook_state = serde_json::to_string(&core.snapshot(0).unwrap()).unwrap();
        assert!(hook_state.contains("Bash"));
        assert!(!hook_state.contains("PUBLIC_ENV_TAIL"));
        core.report("public-session", text, 1).unwrap();
        let report_state = serde_json::to_string(&core.snapshot(1).unwrap()).unwrap();
        assert!(!report_state.contains("PUBLIC_ENV_TAIL"));
        assert!(!String::from_utf8_lossy(&fs::read(path).unwrap()).contains("PUBLIC_ENV_TAIL"));
    }
}

#[test]
fn completed_visibility_changes_recover_history_and_preserve_live_state() {
    let temp = TempDir::new().unwrap();
    let path = temp.path().join("state.db");
    let core = Core::open(&path, 0).unwrap();
    let mut end = payload("SessionEnd");
    end["session_id"] = json!("old-done");
    apply(&core, end, 0);
    let at = 600_001;
    apply(&core, payload("SessionStart"), at);
    let mut agent = payload("SubagentStart");
    agent["agent_id"] = json!("agent-one");
    apply(&core, agent.clone(), at);
    assert_eq!(core.snapshot(at).unwrap().sessions.len(), 1);
    core.set_completed_minutes(60, at).unwrap();
    assert_eq!(core.snapshot(at).unwrap().sessions.len(), 2);
    core.set_completed_minutes(1, at).unwrap();
    assert_eq!(core.snapshot(at).unwrap().sessions.len(), 1);
    core.set_completed_minutes(60, at).unwrap();
    assert_eq!(core.snapshot(at).unwrap().sessions.len(), 2);
    agent["agent_id"] = json!("agent-two");
    apply(&core, agent, at);
    let before = core.snapshot(at).unwrap();
    assert_eq!(before.sessions[0].state, SessionState::Divisao);
    assert_eq!(before.sessions[0].action, "2 subagentes");
    let restored = Core::open(&path, at).unwrap();
    assert_eq!(restored.snapshot(at).unwrap().sessions.len(), 2);
    restored.set_completed_minutes(60, at).unwrap();
    assert_eq!(
        restored.snapshot(at).unwrap().sessions[0].state,
        SessionState::Ampulheta
    );
    let locked = rusqlite::Connection::open(&path).unwrap();
    locked.execute_batch("BEGIN IMMEDIATE").unwrap();
    assert!(core.set_completed_minutes(1, at).is_err());
    assert_eq!(
        serde_json::to_value(core.snapshot(at).unwrap()).unwrap(),
        serde_json::to_value(before).unwrap()
    );
    locked.execute_batch("ROLLBACK").unwrap();
    core.set_completed_minutes(1, at).unwrap();
    assert_eq!(
        Core::open(&path, at)
            .unwrap()
            .snapshot(at)
            .unwrap()
            .sessions
            .len(),
        1
    );
}

#[test]
fn failure_form_survives_silence_until_another_event() {
    let temp = TempDir::new().unwrap();
    let core = Core::open(&temp.path().join("state.db"), 0).unwrap();
    apply(&core, payload("PostToolUseFailure"), 0);
    let failed = core.snapshot(0).unwrap().sessions.remove(0);
    for at in [600_000, 3_600_000] {
        let quiet = core.snapshot(at).unwrap().sessions.remove(0);
        assert_eq!(quiet.state, SessionState::Mancha);
        assert_eq!(quiet.action, failed.action);
    }
    apply(&core, payload("UserPromptSubmit"), 3_600_001);
    assert_eq!(
        core.snapshot(3_600_001).unwrap().sessions[0].state,
        SessionState::Orbita
    );
    assert_eq!(
        core.snapshot(4_200_001).unwrap().sessions[0].state,
        SessionState::Ampulheta
    );
}

#[test]
fn restart_loads_visible_live_sessions_before_retained_completed_history() {
    let temp = TempDir::new().unwrap();
    let path = temp.path().join("state.db");
    let at = 600_001 * 257;
    {
        let core = Core::open(&path, 0).unwrap();
        apply(&core, payload("SessionStart"), 0);
        for n in 1..=256 {
            let mut end = payload("SessionEnd");
            end["session_id"] = json!(format!("completed-{n}"));
            apply(&core, end, 600_001 * n);
        }
        assert_eq!(core.snapshot(at).unwrap().sessions.len(), 1);
    }
    let restored = Core::open(&path, at).unwrap();
    assert_eq!(restored.snapshot(at).unwrap().sessions.len(), 1);
    assert_eq!(
        restored.snapshot(at).unwrap().sessions[0].id,
        "public-session"
    );
}

#[test]
fn resumed_and_active_sessions_follow_current_cwd_without_losing_steps() {
    let temp = TempDir::new().unwrap();
    let core = Core::open(&temp.path().join("state.db"), 0).unwrap();
    apply(&core, payload("SessionStart"), 0);
    let mut resumed = payload("SessionStart");
    resumed["cwd"] = json!("/public/new-project");
    resumed["source"] = json!("resume");
    apply(&core, resumed, 1);
    let session = core.snapshot(1).unwrap().sessions.remove(0);
    assert_eq!(session.project, "new-project");
    assert_eq!(session.origin.as_deref(), Some("resume"));
    assert_eq!(session.steps.len(), 2);
    let mut event = payload("UserPromptSubmit");
    event["cwd"] = json!("/public/another-project");
    apply(&core, event, 2);
    assert_eq!(
        core.snapshot(2).unwrap().sessions[0].project,
        "another-project"
    );
}

#[test]
fn session_restart_resets_agents_and_completed_sessions_do_not_exhaust_capacity() {
    let temp = TempDir::new().unwrap();
    let core = Core::open(&temp.path().join("state.db"), 0).unwrap();
    let mut start = payload("SubagentStart");
    start["agent_id"] = json!("public-agent-1");
    apply(&core, start.clone(), 0);
    apply(&core, payload("SessionStart"), 10_000);
    assert_eq!(
        core.snapshot(11_499).unwrap().sessions[0].state,
        SessionState::Respingo
    );
    start["agent_id"] = json!("public-agent-2");
    apply(&core, start, 12_000);
    assert_eq!(
        core.snapshot(12_000).unwrap().sessions[0].action,
        "1 subagentes"
    );
    apply(&core, payload("SessionEnd"), 0);
    for n in 0..256 {
        let mut end = payload("SessionEnd");
        end["session_id"] = json!(format!("completed-{n}"));
        apply(&core, end, 600_000);
    }
    apply(&core, payload("SessionStart"), 1_200_000);
    assert_eq!(core.snapshot(1_200_000).unwrap().sessions.len(), 1);
    let mut late = payload("PreToolUse");
    late["session_id"] = json!("completed-0");
    apply(&core, late, 1_200_001);
    assert_eq!(core.snapshot(1_200_001).unwrap().sessions.len(), 1);
    core.set_completed_minutes(60, 1_200_001).unwrap();
    let expanded = core.snapshot(1_200_001).unwrap();
    assert_eq!(expanded.sessions.len(), 256);
    assert!(expanded.sessions.iter().any(|s| s.id == "public-session"));
    core.set_completed_minutes(1, 1_200_001).unwrap();
    assert_eq!(core.snapshot(1_200_001).unwrap().sessions.len(), 1);
}

#[test]
fn concurrent_commits_database_failure_and_capacity_are_bounded() {
    let temp = TempDir::new().unwrap();
    let path = temp.path().join("state.db");
    let core = Core::open(&path, 0).unwrap();
    apply(&core, payload("SessionStart"), 0);
    std::thread::scope(|scope| {
        for n in 0..32 {
            let core = core.clone();
            scope.spawn(move || {
                core.report("public-session", &format!("PUBLIC {n}"), 1)
                    .unwrap()
            });
        }
    });
    assert_eq!(core.snapshot(1).unwrap().sessions[0].steps.len(), 20);
    let before = serde_json::to_value(core.snapshot(1).unwrap()).unwrap();
    let locked = rusqlite::Connection::open(&path).unwrap();
    locked.execute_batch("BEGIN IMMEDIATE").unwrap();
    let mut changes = core.subscribe();
    assert!(core.report("public-session", "MUST NOT COMMIT", 2).is_err());
    assert_eq!(
        serde_json::to_value(core.snapshot(1).unwrap()).unwrap(),
        before
    );
    assert!(changes.try_recv().is_err());
    locked.execute_batch("ROLLBACK").unwrap();
    core.report("public-session", "RECOVERED", 2).unwrap();
    for n in 0..256 {
        let mut start = payload("SubagentStart");
        start["agent_id"] = json!(format!("agent-{n}"));
        apply(&core, start, 3);
    }
    let mut extra = payload("SubagentStart");
    extra["agent_id"] = json!("extra-agent");
    assert!(core
        .hook("SubagentStart", &serde_json::to_vec(&extra).unwrap(), 4)
        .is_err());
    assert_eq!(
        core.snapshot(4).unwrap().sessions[0].action,
        "256 subagentes"
    );
    assert!(core.set_retention_days(0, 4).is_err());
    assert!(core.set_retention_days(366, 4).is_err());
    assert!(core.set_completed_minutes(0, 0).is_err());
    assert!(core.set_completed_minutes(1441, 0).is_err());
}

#[test]
fn storage_is_restricted_to_the_current_os_user() {
    let temp = TempDir::new().unwrap();
    let directory = temp.path().join("private");
    let file = directory.join("state.db");
    let _core = Core::open(&file, 0).unwrap();
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        assert_eq!(
            fs::metadata(&directory).unwrap().permissions().mode() & 0o777,
            0o700
        );
        assert_eq!(
            fs::metadata(&file).unwrap().permissions().mode() & 0o777,
            0o600
        );
    }
    #[cfg(windows)]
    {
        let output = std::process::Command::new("powershell.exe").args(["-NoProfile", "-NonInteractive", "-Command",
            "$ErrorActionPreference='Stop'; try {$sid=[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value; $a=Get-Acl -LiteralPath $env:SCRIBE_TEST_PRIVATE_FILE; $rules=@($a.Access); $same=($rules[0].IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value -eq $sid); @{protected=$a.AreAccessRulesProtected; count=$rules.Count; currentUser=$same} | ConvertTo-Json -Compress; if (!$a.AreAccessRulesProtected -or $rules.Count -ne 1 -or !$same) {exit 1}} catch {$_.Exception.GetType().Name; $_.InvocationInfo.MyCommand.Name; exit 2}"])
            .env_remove("PSModulePath")
            .env("SCRIBE_TEST_PRIVATE_FILE", &file).output().unwrap();
        assert!(
            output.status.success(),
            "Private file ACL must grant only the current user: {}",
            String::from_utf8_lossy(&output.stdout)
        );
    }
}

#[test]
fn state_mapping_quiet_timeout_completed_visibility_and_steps() {
    let temp = TempDir::new().unwrap();
    let core = Core::open(&temp.path().join("state.db"), 0).unwrap();
    let mut updates = core.subscribe();
    apply(&core, payload("SessionStart"), 0);
    assert_eq!(
        core.snapshot(1499).unwrap().sessions[0].state,
        SessionState::Respingo
    );
    assert_eq!(
        core.snapshot(1500).unwrap().sessions[0].state,
        SessionState::Gota
    );
    for (event, fields, state) in [
        ("UserPromptSubmit", json!({}), SessionState::Orbita),
        (
            "PreToolUse",
            json!({"tool_name":"Write","tool_input":{"file_path":"/public/project/file.rs","content":"PUBLIC_CONTENT"}}),
            SessionState::Pena,
        ),
        (
            "PreToolUse",
            json!({"tool_name":"Bash","tool_input":{"command":"echo PUBLIC"}}),
            SessionState::Orbita,
        ),
        (
            "PostToolUseFailure",
            json!({"tool_name":"Bash"}),
            SessionState::Mancha,
        ),
        (
            "PermissionRequest",
            json!({"tool_name":"Bash"}),
            SessionState::Interrogacao,
        ),
        (
            "Notification",
            json!({"notification_type":"idle_prompt"}),
            SessionState::Ampulheta,
        ),
        (
            "SubagentStart",
            json!({"agent_id":"public-agent"}),
            SessionState::Divisao,
        ),
        (
            "SubagentStop",
            json!({"agent_id":"public-agent"}),
            SessionState::Orbita,
        ),
        (
            "PostToolUse",
            json!({"tool_name":"Read"}),
            SessionState::Orbita,
        ),
        ("Stop", json!({}), SessionState::Gota),
    ] {
        let mut input = payload(event);
        input
            .as_object_mut()
            .unwrap()
            .extend(fields.as_object().unwrap().clone());
        apply(&core, input, 2000);
        assert_eq!(
            core.snapshot(2000).unwrap().sessions[0].state,
            state,
            "{event}"
        );
    }
    assert_eq!(
        core.snapshot(602_000).unwrap().sessions[0].state,
        SessionState::Ampulheta
    );
    for i in 0..30 {
        core.report("public-session", &format!("PUBLIC STEP {i}"), 3000 + i)
            .unwrap();
    }
    let session = &core.snapshot(3030).unwrap().sessions[0];
    assert_eq!(session.steps.len(), 20);
    assert!(session.steps[0].summary.ends_with("10"));
    assert!(matches!(updates.try_recv(), Ok(StateEvent::Session(_))));
    apply(&core, payload("SessionEnd"), 4000);
    assert_eq!(
        core.snapshot(603_999).unwrap().sessions[0].state,
        SessionState::Selo
    );
    assert!(core.snapshot(604_000).unwrap().sessions.is_empty());
    apply(&core, payload("PreToolUse"), 4050);
    assert_eq!(
        core.snapshot(4050).unwrap().sessions[0].state,
        SessionState::Selo
    );
}

#[test]
fn persistence_sanitization_retention_restart_and_clear() {
    let temp = TempDir::new().unwrap();
    let path = temp.path().join("state.db");
    {
        let core = Core::open(&path, 0).unwrap();
        core.set_retention_days(365, 0).unwrap();
        core.set_completed_minutes(2, 0).unwrap();
        let mut input = payload("PreToolUse");
        input["tool_name"] = json!("Bash");
        input["tool_input"] = json!({"command":"SECRET_VAR=PUBLIC_CREDENTIAL echo PUBLIC_TARGET; token=PUBLIC_TOKEN_VALUE",
            "env":{"ANY":"PUBLIC_ENV_VALUE"},"content":"PUBLIC_FILE_CONTENT"});
        input["prompt"] = json!("PUBLIC_PROMPT");
        input["transcript_path"] = json!("/private/PUBLIC_TRANSCRIPT");
        input["tool_response"] = json!("PUBLIC_OUTPUT");
        apply(&core, input, 0);
        core.report(
            "public-session",
            "Authorization: Bearer PUBLIC_BEARER_VALUE",
            1,
        )
        .unwrap();
        let stored = String::from_utf8_lossy(&fs::read(&path).unwrap()).into_owned();
        for sensitive in [
            "PUBLIC_CREDENTIAL",
            "PUBLIC_TOKEN_VALUE",
            "PUBLIC_ENV_VALUE",
            "PUBLIC_FILE_CONTENT",
            "PUBLIC_PROMPT",
            "PUBLIC_TRANSCRIPT",
            "PUBLIC_OUTPUT",
            "PUBLIC_BEARER_VALUE",
        ] {
            assert!(!stored.contains(sensitive), "Database leaked {sensitive}");
        }
        // Following shell arguments are ambiguous with spaced dotenv values.
        assert!(!stored.contains("PUBLIC_TARGET"));
    }
    let core = Core::open(&path, 30 * 86_400_000).unwrap();
    assert_eq!(
        core.snapshot(2).unwrap().sessions[0].state,
        SessionState::Ampulheta
    );
    apply(&core, payload("SessionEnd"), 3);
    assert!(core.snapshot(120_003).unwrap().sessions.is_empty());
    core.set_retention_days(1, 2 * 86_400_000).unwrap();
    assert!(core.snapshot(2 * 86_400_000).unwrap().sessions.is_empty());
    apply(&core, payload("SessionStart"), 2 * 86_400_000);
    core.clear_history().unwrap();
    assert!(core.snapshot(2 * 86_400_000).unwrap().sessions.is_empty());
    drop(core);
    assert!(Core::open(&path, 2 * 86_400_000)
        .unwrap()
        .snapshot(2 * 86_400_000)
        .unwrap()
        .sessions
        .is_empty());
}

#[test]
fn rejected_inputs_do_not_change_state_and_public_real_fixtures_have_contracts() {
    let temp = TempDir::new().unwrap();
    let core = Core::open(&temp.path().join("state.db"), 0).unwrap();
    for body in [b"null".as_slice(), b"[]", b"{}", b"invalid",
        br#"{"hook_event_name":"Stop","session_id":"public","cwd":"/public"}"#,
        br#"{"hook_event_name":"SessionStart","session_id":true,"cwd":"/public"}"#,
        br#"{"hook_event_name":"SessionStart","session_id":"sk-ant-PUBLIC123456789","cwd":"/public"}"#] {
        assert!(core.hook("SessionStart", body, 0).is_err());
    }
    assert!(core.snapshot(0).unwrap().sessions.is_empty());
    assert!(core.report("unknown", "PUBLIC", 0).is_err());
    let fixture_root = std::env::var_os("SCRIBE_TEST_FIXTURES_ROOT")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/hooks"));
    let mut total = 0;
    for event in EVENTS {
        let files: Vec<_> = fs::read_dir(fixture_root.join(event))
            .unwrap()
            .map(|e| e.unwrap().path())
            .filter(|p| p.extension().is_some_and(|e| e == "json"))
            .collect();
        assert!(files.len() >= 2, "real evidence missing: {event}");
        for path in files {
            let isolated = TempDir::new().unwrap();
            let fixture_core = Core::open(&isolated.path().join("state.db"), 0).unwrap();
            let bytes = fs::read(path).unwrap();
            let input: Value = serde_json::from_slice(&bytes).unwrap();
            fixture_core.hook(event, &bytes, 1).unwrap();
            let expected = match *event {
                "SessionStart" => SessionState::Respingo,
                "PreToolUse"
                    if matches!(
                        input["tool_name"].as_str(),
                        Some("Write" | "Edit" | "NotebookEdit")
                    ) =>
                {
                    SessionState::Pena
                }
                "PostToolUseFailure" => SessionState::Mancha,
                "PermissionRequest" => SessionState::Interrogacao,
                "Notification"
                    if matches!(
                        input["notification_type"].as_str(),
                        Some("idle_prompt" | "permission_prompt")
                    ) =>
                {
                    SessionState::Ampulheta
                }
                "SubagentStart" => SessionState::Divisao,
                "Stop" | "Notification" => SessionState::Gota,
                "SessionEnd" => SessionState::Selo,
                _ => SessionState::Orbita,
            };
            assert_eq!(
                fixture_core.snapshot(1).unwrap().sessions[0].state,
                expected,
                "{event}"
            );
            total += 1;
        }
    }
    assert_eq!(total, 46, "Use only the committed public Phase 0 fixtures");
}

struct Reply {
    code: u16,
    headers: String,
    body: String,
}

async fn request(
    port: u16,
    token: &str,
    method: &str,
    path: &str,
    extra: &str,
    body: &str,
) -> Reply {
    let mut extra = extra.to_owned();
    if method == "POST"
        && path.starts_with("/v1/hooks/")
        && token == TOKEN
        && !extra.to_ascii_lowercase().contains("x-scribe-nonce:")
    {
        let nonce = format!("{:032x}", rand::random::<u128>());
        let challenge = raw_request(
            port,
            "invalid",
            "GET",
            &format!("/v1/hooks/challenge/{nonce}"),
            "",
            "",
        )
        .await;
        assert_eq!(challenge.code, 204, "test hook challenge must succeed");
        let proof = scribe_hook_protocol::sign(
            HOOK_KEY,
            &[
                b"request",
                nonce.as_bytes(),
                path.trim_start_matches("/v1/hooks/").as_bytes(),
                body.as_bytes(),
            ],
        );
        extra.push_str(&format!(
            "x-scribe-nonce: {nonce}\r\nx-scribe-proof: {proof}\r\n"
        ));
    }
    raw_request(port, token, method, path, &extra, body).await
}

async fn raw_request(
    port: u16,
    token: &str,
    method: &str,
    path: &str,
    extra: &str,
    body: &str,
) -> Reply {
    let mut socket = TcpStream::connect(("127.0.0.1", port)).await.unwrap();
    let data = format!("{method} {path} HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nAuthorization: Bearer {token}\r\nContent-Type: application/json\r\nAccept: application/json, text/event-stream\r\nConnection: close\r\nContent-Length: {}\r\n{extra}\r\n{body}", body.len());
    socket.write_all(data.as_bytes()).await.unwrap();
    let mut bytes = vec![];
    tokio::time::timeout(Duration::from_secs(3), socket.read_to_end(&mut bytes))
        .await
        .unwrap()
        .unwrap();
    let text = String::from_utf8(bytes).unwrap();
    let (headers, body) = text.split_once("\r\n\r\n").unwrap();
    Reply {
        code: headers.split_whitespace().nth(1).unwrap().parse().unwrap(),
        headers: headers.into(),
        body: body.into(),
    }
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn http_boundaries_auth_body_rate_mcp_and_protected_decision_route() {
    let temp = TempDir::new().unwrap();
    let core = Core::open(&temp.path().join("state.db"), scribe_core::now_ms()).unwrap();
    let server = LocalServer::start(core.clone(), 0, TOKEN.into(), HOOK_KEY.into())
        .await
        .unwrap();
    let port = server.port();
    for extra in [
        "Origin: https://malicious.invalid\r\n",
        "Origin:\r\n",
        "Host: malicious.invalid\r\n",
        "Host: localhost:1\r\n",
        "Authorization: Bearer duplicate\r\n",
    ] {
        let reply = request(port, TOKEN, "GET", "/v1/health", extra, "").await;
        assert!(matches!(reply.code, 401 | 403 | 400));
        assert!(!reply
            .headers
            .to_lowercase()
            .contains("access-control-allow-origin"));
    }
    assert_eq!(
        request(port, "wrong", "GET", "/v1/health", "", "")
            .await
            .code,
        401
    );
    assert_eq!(
        request(port, TOKEN, "GET", "/v1/state", "", "").await.code,
        403
    );
    assert_eq!(
        request(
            port,
            TOKEN,
            "POST",
            "/v1/decisions/public",
            "",
            "{\"action\":\"allow\"}"
        )
        .await
        .code,
        403
    );
    let oversized = "x".repeat(1024 * 1024 + 1);
    assert_eq!(
        request(
            port,
            TOKEN,
            "POST",
            "/v1/hooks/SessionStart",
            "",
            &oversized
        )
        .await
        .code,
        413
    );
    assert_eq!(
        request(port, TOKEN, "POST", "/v1/hooks/SessionStart", "", "null")
            .await
            .code,
        400
    );
    let body = payload("SessionStart").to_string();
    assert_eq!(
        request(port, TOKEN, "POST", "/v1/hooks/SessionStart", "", &body)
            .await
            .code,
        204
    );
    let ui = format!("X-Scribe-UI: {}\r\n", server.ui_token());
    let reply = request(port, TOKEN, "GET", "/v1/state", &ui, "").await;
    assert_eq!(reply.code, 200);
    assert!(reply.body.contains("public-session"));
    assert!(!reply.body.contains(TOKEN));
    assert!(!reply.body.contains(server.ui_token()));
    let initialize = json!({"jsonrpc":"2.0","id":1,"method":"initialize","params":{
        "protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"public-test","version":"1"}}}).to_string();
    assert_eq!(
        request(port, TOKEN, "POST", "/mcp", "", &initialize)
            .await
            .code,
        200
    );
    let tools = request(
        port,
        TOKEN,
        "POST",
        "/mcp",
        "MCP-Protocol-Version: 2025-11-25\r\n",
        "{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"tools/list\"}",
    )
    .await;
    assert!(tools.body.contains("scribe_report"));
    assert!(tools.body.contains("scribe_ask"));
    let listing: Value = serde_json::from_str(&tools.body).unwrap();
    let listed = listing["result"]["tools"].as_array().unwrap();
    assert_eq!(listed.len(), 2);
    let question_schema =
        &listed.iter().find(|t| t["name"] == "scribe_ask").unwrap()["inputSchema"];
    assert_eq!(question_schema["properties"]["options"]["minItems"], 2);
    assert_eq!(question_schema["properties"]["options"]["maxItems"], 4);
    assert!(question_schema.to_string().contains("\"maxLength\":40"));
    let report =
        json!({"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"scribe_report",
        "arguments":{"session_id":"public-session","text":"PUBLIC MILESTONE"}}})
        .to_string();
    let result = request(
        port,
        TOKEN,
        "POST",
        "/mcp",
        "MCP-Protocol-Version: 2025-11-25\r\n",
        &report,
    )
    .await;
    assert!(result.body.contains("ok"), "report dispatch failed");
    assert_eq!(
        core.snapshot(scribe_core::now_ms()).unwrap().sessions[0].action,
        "PUBLIC MILESTONE"
    );
    let ask = json!({"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"scribe_ask",
        "arguments":{"session_id":"public-session","question":"PUBLIC QUESTION","options":["YES","NO"]}}}).to_string();
    let asking = tokio::spawn(async move {
        request(
            port,
            TOKEN,
            "POST",
            "/mcp",
            "MCP-Protocol-Version: 2025-11-25\r\n",
            &ask,
        )
        .await
    });
    let pending = tokio::time::timeout(Duration::from_secs(2), async {
        loop {
            if let Some(decision) = core
                .snapshot(scribe_core::now_ms())
                .unwrap()
                .decisions
                .first()
                .cloned()
            {
                break decision;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .unwrap();
    let result = request(
        port,
        TOKEN,
        "POST",
        &format!("/v1/decisions/{}", pending.id),
        &format!("{ui}Content-Type: application/json\r\n"),
        "{\"option\":1}",
    )
    .await;
    assert_eq!(result.code, 204);
    assert!(asking.await.unwrap().body.contains("NO"));
    for (name, arguments) in [
        (
            "scribe_report",
            json!({"session_id":"public-session","text":"x".repeat(141)}),
        ),
        (
            "scribe_report",
            json!({"session_id":"public-session","text":"MUST NOT COMMIT","allow":true}),
        ),
        (
            "scribe_report",
            json!({"session_id":"unknown","text":"MUST NOT COMMIT"}),
        ),
        (
            "scribe_ask",
            json!({"session_id":"public-session","question":"x".repeat(201),"options":["A","B"]}),
        ),
        (
            "scribe_ask",
            json!({"session_id":"public-session","question":"PUBLIC","options":["x".repeat(41),"B"]}),
        ),
        (
            "scribe_ask",
            json!({"session_id":"public-session","question":"PUBLIC","options":["A"]}),
        ),
        (
            "scribe_ask",
            json!({"session_id":"public-session","question":"PUBLIC","options":["A","B","C","D","E"]}),
        ),
    ] {
        let call = json!({"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":name,"arguments":arguments}}).to_string();
        let result = request(
            port,
            TOKEN,
            "POST",
            "/mcp",
            "MCP-Protocol-Version: 2025-11-25\r\n",
            &call,
        )
        .await;
        let rpc: Value = serde_json::from_str(&result.body).unwrap();
        assert!(
            rpc.get("error").is_some() || rpc["result"]["isError"] == true,
            "Invalid MCP arguments must fail"
        );
        assert_eq!(
            core.snapshot(scribe_core::now_ms()).unwrap().sessions[0].action,
            "PUBLIC MILESTONE"
        );
    }
    let mut limited = false;
    for _ in 0..55 {
        if request(port, TOKEN, "GET", "/v1/health", "", "").await.code == 429 {
            limited = true;
            break;
        }
    }
    assert!(limited);
    server.stop().await.unwrap();
    assert!(TcpStream::connect(("127.0.0.1", port)).await.is_err());
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn stream_starts_with_snapshot_and_emits_sanitized_delta() {
    let temp = TempDir::new().unwrap();
    let core = Core::open(&temp.path().join("state.db"), 0).unwrap();
    let server = LocalServer::start(core.clone(), 0, TOKEN.into(), HOOK_KEY.into())
        .await
        .unwrap();
    let mut socket = TcpStream::connect(("127.0.0.1", server.port()))
        .await
        .unwrap();
    socket.write_all(format!("GET /v1/events HTTP/1.1\r\nHost: 127.0.0.1:{}\r\nAuthorization: Bearer {TOKEN}\r\nX-Scribe-UI: {}\r\nAccept: text/event-stream\r\n\r\n", server.port(), server.ui_token()).as_bytes()).await.unwrap();
    let mut buffer = [0u8; 8192];
    let length = tokio::time::timeout(Duration::from_secs(2), socket.read(&mut buffer))
        .await
        .unwrap()
        .unwrap();
    assert!(String::from_utf8_lossy(&buffer[..length]).contains("snapshot"));
    apply(&core, payload("SessionStart"), scribe_core::now_ms());
    let mut seen = String::new();
    tokio::time::timeout(Duration::from_secs(2), async {
        while !seen.contains("public-session") {
            let n = socket.read(&mut buffer).await.unwrap();
            assert!(n > 0);
            seen.push_str(&String::from_utf8_lossy(&buffer[..n]));
        }
    })
    .await
    .unwrap();
    assert!(seen.contains("session"));
    drop(socket);
    server.stop().await.unwrap();
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn real_release_helper_reaches_the_production_server_with_silent_output() {
    let temp = TempDir::new().unwrap();
    let core = Core::open(&temp.path().join("state.db"), 0).unwrap();
    let server = LocalServer::start(core.clone(), 0, TOKEN.into(), HOOK_KEY.into())
        .await
        .unwrap();
    let connection = temp.path().join("connection.json");
    fs::write(
        &connection,
        json!({"port":server.port(),"token":TOKEN,"hook_key":HOOK_KEY}).to_string(),
    )
    .unwrap();
    let executable = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../hook-client/target/release")
        .join(if cfg!(windows) {
            "scribe-hook.exe"
        } else {
            "scribe-hook"
        });
    assert!(
        executable.is_file(),
        "Build the release hook client before core integration tests"
    );
    let start = Instant::now();
    let output = tokio::task::spawn_blocking(move || {
        use std::{
            io::Write,
            process::{Command, Stdio},
        };
        let mut child = Command::new(executable)
            .args(["--hook", "SessionStart"])
            .env("SCRIBE_CONNECTION_FILE", connection)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .unwrap();
        child
            .stdin
            .take()
            .unwrap()
            .write_all(payload("SessionStart").to_string().as_bytes())
            .unwrap();
        child.wait_with_output().unwrap()
    })
    .await
    .unwrap();
    assert!(output.status.success());
    assert!(output.stdout.is_empty() && output.stderr.is_empty());
    assert_eq!(
        core.snapshot(scribe_core::now_ms()).unwrap().sessions.len(),
        1
    );
    assert!(start.elapsed() < Duration::from_secs(1));
    server.stop().await.unwrap();
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn http_latency_port_collision_drop_and_incomplete_bodies_are_bounded() {
    let temp = TempDir::new().unwrap();
    let core = Core::open(&temp.path().join("state.db"), 0).unwrap();
    assert!(
        LocalServer::start(core.clone(), 0, "short".into(), HOOK_KEY.into())
            .await
            .is_err()
    );
    let server = LocalServer::start(core.clone(), 0, TOKEN.into(), HOOK_KEY.into())
        .await
        .unwrap();
    let port = server.port();
    assert!(
        LocalServer::start(core.clone(), port, TOKEN.into(), HOOK_KEY.into())
            .await
            .is_err()
    );
    let mut samples = vec![];
    for _ in 0..32 {
        let started = Instant::now();
        let reply = request(
            port,
            TOKEN,
            "POST",
            "/v1/hooks/SessionStart",
            "",
            &payload("SessionStart").to_string(),
        )
        .await;
        assert_eq!(reply.code, 204);
        assert_eq!(
            core.snapshot(scribe_core::now_ms()).unwrap().sessions.len(),
            1
        );
        samples.push(started.elapsed());
    }
    samples.sort();
    let p95 = samples[30];
    eprintln!(
        "phase2 HTTP event-to-committed-state p95={}ms samples=32",
        p95.as_millis()
    );
    assert!(p95 < Duration::from_millis(200));
    let mut socket = TcpStream::connect(("127.0.0.1", port)).await.unwrap();
    socket.write_all(format!("POST /v1/hooks/SessionStart HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nAuthorization: Bearer {TOKEN}\r\nContent-Length: 100\r\n\r\nx").as_bytes()).await.unwrap();
    let mut buffer = [0u8; 1024];
    let read = tokio::time::timeout(Duration::from_secs(2), socket.read(&mut buffer))
        .await
        .unwrap()
        .unwrap();
    assert!(String::from_utf8_lossy(&buffer[..read]).starts_with("HTTP/1.1 408"));
    drop(socket);
    drop(server);
    let restarted = tokio::time::timeout(Duration::from_secs(1), async {
        loop {
            if let Ok(restarted) =
                LocalServer::start(core.clone(), port, TOKEN.into(), HOOK_KEY.into()).await
            {
                break restarted;
            }
            tokio::task::yield_now().await;
        }
    })
    .await
    .unwrap();
    restarted.stop().await.unwrap();
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn native_hooks_authenticate_both_peers_and_reject_replay() {
    use scribe_hook_protocol::{sign, verify};
    let temp = TempDir::new().unwrap();
    let core = Core::open(&temp.path().join("state.db"), scribe_core::now_ms()).unwrap();
    let server = LocalServer::start(core.clone(), 0, TOKEN.into(), HOOK_KEY.into())
        .await
        .unwrap();
    let port = server.port();
    let nonce = "0123456789abcdef0123456789abcdef";
    let path = format!("/v1/hooks/challenge/{nonce}");
    let challenge = request(port, "invalid", "GET", &path, "", "").await;
    assert_eq!(challenge.code, 204);
    let proof = challenge
        .headers
        .lines()
        .find_map(|h| h.strip_prefix("x-scribe-proof: "))
        .unwrap();
    assert!(verify(HOOK_KEY, &[b"challenge", nonce.as_bytes()], proof));
    assert!(!verify(TOKEN, &[b"challenge", nonce.as_bytes()], proof));
    let body =
        r#"{"hook_event_name":"SessionStart","session_id":"native-auth","cwd":"/public/project"}"#;
    let proof = sign(
        HOOK_KEY,
        &[
            b"request",
            nonce.as_bytes(),
            b"SessionStart",
            body.as_bytes(),
        ],
    );
    let extra = format!("x-scribe-nonce: {nonce}\r\nx-scribe-proof: {proof}\r\n");
    let reply = request(
        port,
        "invalid",
        "POST",
        "/v1/hooks/SessionStart",
        &extra,
        body,
    )
    .await;
    assert_eq!(reply.code, 204);
    let proof = reply
        .headers
        .lines()
        .find_map(|h| h.strip_prefix("x-scribe-proof: "))
        .unwrap();
    assert!(verify(
        HOOK_KEY,
        &[
            b"response",
            nonce.as_bytes(),
            b"SessionStart",
            b"204",
            reply.body.as_bytes()
        ],
        proof
    ));
    assert_eq!(
        request(
            port,
            "invalid",
            "POST",
            "/v1/hooks/SessionStart",
            &extra,
            body
        )
        .await
        .code,
        401
    );
    assert_eq!(
        request(port, "invalid", "GET", &path, "", "").await.code,
        204
    );
    let wrong = sign(
        TOKEN,
        &[
            b"request",
            nonce.as_bytes(),
            b"SessionStart",
            body.as_bytes(),
        ],
    );
    let extra = format!("x-scribe-nonce: {nonce}\r\nx-scribe-proof: {wrong}\r\n");
    assert_eq!(
        request(
            port,
            "invalid",
            "POST",
            "/v1/hooks/SessionStart",
            &extra,
            body
        )
        .await
        .code,
        401
    );
    assert_eq!(
        core.snapshot(scribe_core::now_ms()).unwrap().sessions.len(),
        1
    );
    assert!(LocalServer::start(core, 0, TOKEN.into(), TOKEN.into())
        .await
        .is_err());
    server.stop().await.unwrap();
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn bearer_only_hooks_are_rejected_and_challenge_flood_does_not_spend_auth_quota() {
    let temp = TempDir::new().unwrap();
    let core = Core::open(&temp.path().join("state.db"), scribe_core::now_ms()).unwrap();
    let server = LocalServer::start(core.clone(), 0, TOKEN.into(), HOOK_KEY.into())
        .await
        .unwrap();
    let port = server.port();

    let bare_hook = raw_request(
        port,
        TOKEN,
        "POST",
        "/v1/hooks/PermissionRequest",
        "",
        &json!({
            "hook_event_name":"PermissionRequest",
            "session_id":"bearer-only",
            "cwd":"/public/project",
            "tool_name":"Bash",
            "tool_input":{"command":"echo must-not-create-card"}
        })
        .to_string(),
    )
    .await;
    assert_eq!(bare_hook.code, 401);
    let snapshot = core.snapshot(scribe_core::now_ms()).unwrap();
    assert!(snapshot.sessions.is_empty());
    assert!(snapshot.decisions.is_empty());

    core.hook(
        "SessionStart",
        payload("SessionStart").to_string().as_bytes(),
        scribe_core::now_ms(),
    )
    .unwrap();
    let pending = core
        .permission(
            &serde_json::to_vec(&json!({
                "hook_event_name":"PermissionRequest", "session_id":"public-session",
                "cwd":"/public/project", "tool_name":"Bash", "tool_use_id":"public-call",
                "tool_input":{"command":"echo public"}
            }))
            .unwrap(),
            120,
        )
        .unwrap();
    let decision_id = core.snapshot(scribe_core::now_ms()).unwrap().decisions[0]
        .id
        .clone();
    assert_eq!(
        raw_request(
            port,
            TOKEN,
            "POST",
            "/v1/hooks/PostToolUse",
            "",
            &json!({"hook_event_name":"PostToolUse", "session_id":"public-session",
        "cwd":"/public/project", "tool_name":"Bash", "tool_use_id":"public-call",
        "tool_input":{"command":"echo public"}})
            .to_string()
        )
        .await
        .code,
        401
    );
    assert_eq!(
        core.snapshot(scribe_core::now_ms())
            .unwrap()
            .decisions
            .iter()
            .find(|d| d.id == decision_id)
            .unwrap()
            .status,
        "pending"
    );
    drop(pending);

    for index in 0..60 {
        let nonce = format!("{index:032x}");
        let challenge = request(
            port,
            "invalid",
            "GET",
            &format!("/v1/hooks/challenge/{nonce}"),
            "",
            "",
        )
        .await;
        assert_eq!(challenge.code, 204);
    }
    for index in 100..160 {
        let nonce = format!("{index:032x}");
        assert_eq!(
            request(
                port,
                TOKEN,
                "POST",
                "/v1/hooks/SessionStart",
                &format!("x-scribe-nonce: {nonce}\r\n"),
                &payload("SessionStart").to_string(),
            )
            .await
            .code,
            401
        );
    }

    assert_eq!(
        request(port, TOKEN, "GET", "/v1/health", "", "").await.code,
        200
    );
    let initialize = json!({"jsonrpc":"2.0","id":1,"method":"initialize","params":{
        "protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"challenge-flood-test","version":"1"}}}).to_string();
    assert_eq!(
        request(port, TOKEN, "POST", "/mcp", "", &initialize)
            .await
            .code,
        200
    );
    server.stop().await.unwrap();
}
