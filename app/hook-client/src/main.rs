#![cfg_attr(all(windows, not(debug_assertions)), windows_subsystem = "windows")]

use directories::BaseDirs;
use serde::Deserialize;
use serde_json::Value;
use std::{fs, io::Read, path::PathBuf, process::Command, sync::mpsc, time::Duration};

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
const BODY_LIMIT: u64 = 1024 * 1024;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Connection {
    port: u16,
    token: String,
    #[serde(default)]
    app_path: Option<PathBuf>,
}

fn config_path() -> Option<PathBuf> {
    // This non-secret path override isolates integration tests and portable installs.
    if let Some(path) = std::env::var_os("SCRIBE_CONNECTION_FILE") {
        let path = PathBuf::from(path);
        return path.is_absolute().then_some(path);
    }
    Some(
        BaseDirs::new()?
            .config_dir()
            .join("com.rexia.scribe/connection.json"),
    )
}

fn connection() -> Option<Connection> {
    let path = config_path()?;
    if fs::metadata(&path).ok()?.len() > 8192 {
        return None;
    }
    let config: Connection = serde_json::from_slice(&fs::read(path).ok()?).ok()?;
    if config.port < 1024
        || config.token.len() < 32
        || config.token.len() > 128
        || !config
            .token
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || c == b'-' || c == b'_')
    {
        return None;
    }
    Some(config)
}

fn input() -> Option<Vec<u8>> {
    let (sender, receiver) = mpsc::channel();
    std::thread::spawn(move || {
        let mut bytes = Vec::new();
        let result = std::io::stdin()
            .take(BODY_LIMIT + 1)
            .read_to_end(&mut bytes);
        let _ = sender.send(result.ok().map(|_| bytes));
    });
    let bytes = receiver.recv_timeout(Duration::from_millis(250)).ok()??;
    (bytes.len() as u64 <= BODY_LIMIT).then_some(bytes)
}

fn valid_event(event: &str, bytes: &[u8]) -> bool {
    if !EVENTS.contains(&event) {
        return false;
    }
    let Ok(value) = serde_json::from_slice::<Value>(bytes) else {
        return false;
    };
    value.get("hook_event_name").and_then(Value::as_str) == Some(event)
        && value
            .get("session_id")
            .and_then(Value::as_str)
            .is_some_and(|s| !s.is_empty() && s.len() <= 256)
        && value.get("cwd").and_then(Value::as_str).is_some()
}

fn observe(event: &str, config: Connection, bytes: Vec<u8>) {
    if !valid_event(event, &bytes) {
        return;
    }
    let agent = ureq::Agent::config_builder()
        .timeout_global(Some(Duration::from_millis(250)))
        .max_redirects(0)
        .proxy(None)
        .build()
        .new_agent();
    // In Phase 1 this is an observer only: it never returns a permission decision.
    // The bounded, verified decision protocol is added at the Phase 4 gate.
    let _ = agent
        .post(format!("http://127.0.0.1:{}/v1/hooks/{event}", config.port))
        .header("Authorization", format!("Bearer {}", config.token))
        .header("Content-Type", "application/json")
        .send(bytes);
}

fn open(config: Option<Connection>) -> bool {
    let Some(path) = config.and_then(|c| c.app_path) else {
        return false;
    };
    if !path.is_absolute() || !path.is_file() {
        return false;
    }
    let mut command = Command::new(path);
    command.arg("--show");
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    command.spawn().is_ok()
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if args == ["--open"] {
        if !open(connection()) {
            std::process::exit(1);
        }
        return;
    }
    if args.len() != 2 || args[0] != "--hook" {
        return;
    }
    let Some(config) = connection() else {
        return;
    };
    let Some(bytes) = input() else {
        return;
    };
    observe(&args[1], config, bytes);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_invalid_or_mismatched_hook_payloads() {
        assert!(valid_event(
            "SessionStart",
            br#"{"hook_event_name":"SessionStart","session_id":"public","cwd":"/public"}"#
        ));
        for body in [
            b"{}".as_slice(),
            b"null",
            b"invalid",
            br#"{"hook_event_name":"Stop","session_id":"public","cwd":"/public"}"#,
            br#"{"hook_event_name":"SessionStart","session_id":42,"cwd":"/public"}"#,
        ] {
            assert!(!valid_event("SessionStart", body));
        }
        assert!(!valid_event("Unknown", b"{}"));
    }
}
