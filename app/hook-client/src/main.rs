#![cfg_attr(all(windows, not(debug_assertions)), windows_subsystem = "windows")]

use serde::Deserialize;
use serde_json::Value;
use std::{
    fs,
    io::{Read, Write},
    path::PathBuf,
    process::{Command, Stdio},
    sync::mpsc,
    time::Duration,
};

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
mod attested;
mod mcp;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Connection {
    port: u16,
    token: String,
    #[serde(default)]
    hook_key: String,
    #[serde(default)]
    app_path: Option<PathBuf>,
}

fn config_path() -> Option<PathBuf> {
    // Overrides require an explicit fixture build, never the distributed helper.
    #[cfg(feature = "test-fixture")]
    if let Some(path) = std::env::var_os("SCRIBE_CONNECTION_FILE") {
        let path = PathBuf::from(path);
        return path.is_absolute().then_some(path);
    }
    Some(
        scribe_hook_protocol::trusted_profile_dirs()?
            .config
            .join("connection.json"),
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

fn interactive_pre_tool(input: &Value) -> bool {
    input.get("hook_event_name").and_then(Value::as_str) == Some("PreToolUse")
        && matches!(
            input.get("tool_name").and_then(Value::as_str),
            Some("AskUserQuestion" | "ExitPlanMode")
        )
}

fn within_interactive_input_limit(input: &Value) -> bool {
    let limit = match input.get("tool_name").and_then(Value::as_str) {
        Some("AskUserQuestion") => 5000,
        Some("ExitPlanMode") => 6000,
        _ => return false,
    };
    input
        .get("tool_input")
        .and_then(|tool_input| serde_json::to_vec(tool_input).ok())
        .is_some_and(|bytes| bytes.len() <= limit)
}

fn bounded_text(value: &Value) -> Option<&str> {
    value
        .as_str()
        .filter(|text| !text.trim().is_empty() && text.chars().count() <= 200)
}

fn valid_plan(input: &Value) -> bool {
    let Some(object) = input.as_object() else {
        return false;
    };
    if object
        .keys()
        .any(|key| !matches!(key.as_str(), "plan" | "planFilePath" | "allowedPrompts"))
        || !object
            .get("plan")
            .and_then(Value::as_str)
            .is_some_and(|plan| !plan.trim().is_empty() && plan.chars().count() <= 6000)
        || !object
            .get("planFilePath")
            .and_then(Value::as_str)
            .is_some_and(|path| !path.trim().is_empty() && path.chars().count() <= 1024)
    {
        return false;
    }
    object
        .get("allowedPrompts")
        .is_none_or(|value| value.as_array().is_some_and(Vec::is_empty))
}

fn valid_answers(original: &Value, updated: &Value) -> bool {
    let (Some(original), Some(updated)) = (original.as_object(), updated.as_object()) else {
        return false;
    };
    if original.len() != 1 || !original.contains_key("questions") {
        return false;
    }
    let Some(questions) = original.get("questions").and_then(Value::as_array) else {
        return false;
    };
    if !(1..=4).contains(&questions.len()) {
        return false;
    }
    let mut normalized_questions = std::collections::HashSet::new();
    let mut question_keys = Vec::new();
    for question in questions {
        let Some(question_object) = question.as_object() else {
            return false;
        };
        if question_object.keys().any(|key| {
            !matches!(
                key.as_str(),
                "question" | "header" | "options" | "multiSelect"
            )
        }) {
            return false;
        }
        let (Some(question), Some(header), Some(options)) = (
            question.get("question").and_then(Value::as_str),
            question.get("header").and_then(Value::as_str),
            question.get("options").and_then(Value::as_array),
        ) else {
            return false;
        };
        if question.trim().is_empty()
            || question.chars().count() > 200
            || header.trim().is_empty()
            || header.chars().count() > 40
            || question_object
                .get("multiSelect")
                .is_some_and(|multi| !multi.is_boolean())
            || !(2..=4).contains(&options.len())
            || !normalized_questions.insert(question.trim().to_owned())
        {
            return false;
        }
        question_keys.push(question.to_owned());
        let mut labels = std::collections::HashSet::new();
        for option in options {
            let Some(option) = option.as_object() else {
                return false;
            };
            if option.len() != 2
                || !option.contains_key("label")
                || !option.contains_key("description")
            {
                return false;
            }
            let (Some(label), Some(description)) = (
                option.get("label").and_then(Value::as_str),
                option.get("description").and_then(Value::as_str),
            ) else {
                return false;
            };
            if label.trim().is_empty()
                || label.chars().count() > 40
                || label.contains(',')
                || description.trim().is_empty()
                || description.chars().count() > 400
                || !labels.insert(label.trim().to_owned())
            {
                return false;
            }
        }
    }
    if updated.len() != original.len() + 1
        || original
            .iter()
            .any(|(key, value)| updated.get(key) != Some(value))
    {
        return false;
    }
    let Some(answers) = updated.get("answers").and_then(Value::as_object) else {
        return false;
    };
    answers.len() == question_keys.len()
        && question_keys.iter().all(|key| {
            answers
                .get(key)
                .is_some_and(|answer| bounded_text(answer).is_some())
        })
}

fn supported_output(event: &str, input: &Value, value: &Value) -> Option<Value> {
    let output = value.get("hookSpecificOutput")?;
    if output.get("hookEventName").and_then(Value::as_str) != Some(event) {
        return None;
    }
    if event == "PermissionRequest" {
        let decision = output.get("decision")?;
        let behavior = decision.get("behavior")?.as_str()?;
        if !matches!(behavior, "allow" | "deny") {
            return None;
        }
        let mut decision_out = serde_json::json!({"behavior":behavior});
        if let Some(updates) = decision.get("updatedPermissions") {
            let updates = updates.as_array()?;
            let original = input.get("permission_suggestions")?.as_array()?;
            if behavior != "allow"
                || updates.len() != 1
                || original.len() > 8
                || serde_json::to_vec(original).ok()?.len() > 8000
                || !scribe_hook_protocol::valid_permission_update(&updates[0])
                || !original.contains(&updates[0])
            {
                return None;
            }
            decision_out["updatedPermissions"] = Value::Array(updates.clone());
        }
        if behavior == "deny" {
            if let Some(message) = decision
                .get("message")
                .and_then(Value::as_str)
                .filter(|message| message.chars().count() <= 200)
            {
                decision_out["message"] = Value::String(message.into());
            }
        }
        return Some(serde_json::json!({"hookSpecificOutput":{
            "hookEventName":"PermissionRequest",
            "decision":decision_out
        }}));
    }
    if event != "PreToolUse" || !interactive_pre_tool(input) {
        return None;
    }
    let decision = output.get("permissionDecision")?.as_str()?;
    if !matches!(decision, "allow" | "deny") {
        return None;
    }
    let original = input.get("tool_input")?;
    let updated = output.get("updatedInput");
    match input.get("tool_name").and_then(Value::as_str)? {
        "ExitPlanMode" => {
            if !valid_plan(original)
                || updated.is_some_and(|updated| updated != original)
                || (decision == "allow" && updated.is_none())
            {
                return None;
            }
        }
        "AskUserQuestion" => {
            if (decision == "allow" && updated.is_none())
                || updated.is_some_and(|updated| !valid_answers(original, updated))
            {
                return None;
            }
        }
        _ => return None,
    }
    let mut supported = serde_json::json!({
        "hookEventName":"PreToolUse",
        "permissionDecision":decision
    });
    if let Some(updated) = updated {
        supported["updatedInput"] = updated.clone();
    }
    if let Some(reason) = output.get("permissionDecisionReason") {
        if reason
            .as_str()
            .is_none_or(|reason| reason.chars().count() > 200)
        {
            return None;
        }
        supported["permissionDecisionReason"] = reason.clone();
    }
    Some(serde_json::json!({"hookSpecificOutput":supported}))
}

fn observe(event: &str, config: Connection, bytes: Vec<u8>) {
    if !valid_event(event, &bytes) {
        return;
    }
    let Ok(original) = serde_json::from_slice::<Value>(&bytes) else {
        return;
    };
    let interactive_pre_tool = event == "PreToolUse" && interactive_pre_tool(&original);
    if interactive_pre_tool && !within_interactive_input_limit(&original) {
        return;
    }
    let started = std::time::Instant::now();
    let budget = if event == "PermissionRequest" || interactive_pre_tool {
        Duration::from_secs(125)
    } else {
        Duration::from_millis(250)
    };
    let Ok(runtime) = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
    else {
        return;
    };
    let Some(remaining) = budget
        .checked_sub(started.elapsed())
        .filter(|d| !d.is_zero())
    else {
        return;
    };
    let result = runtime.block_on(async {
        tokio::time::timeout(
            remaining,
            attested::post(&config, attested::Channel::Hook(event), bytes),
        )
        .await
    });
    if event != "PermissionRequest" && !interactive_pre_tool {
        return;
    }
    let Ok(Ok((200, bytes))) = result else {
        return;
    };
    let Ok(value) = serde_json::from_slice::<Value>(&bytes) else {
        return;
    };
    let Some(result) = supported_output(event, &original, &value) else {
        return;
    };
    let _ = writeln!(std::io::stdout(), "{result}");
}

fn open(config: Option<Connection>) -> bool {
    let Some(path) = config.and_then(|c| c.app_path) else {
        return false;
    };
    if !path.is_absolute() || !path.is_file() {
        return false;
    }
    let mut command = Command::new(path);
    command
        .arg("--open")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::ffi::c_void;
        use std::os::windows::process::CommandExt;
        #[link(name = "kernel32")]
        unsafe extern "system" {
            fn GetStdHandle(kind: u32) -> *mut c_void;
            fn SetHandleInformation(handle: *mut c_void, mask: u32, flags: u32) -> i32;
        }
        // Redirecting stdio alone still leaves the original Windows pipe handles
        // inheritable. This short-lived --open process must not pass them on.
        for kind in [-10_i32, -11, -12] {
            // SAFETY: these are documented standard-handle selectors. We change
            // only HANDLE_FLAG_INHERIT on valid handles owned by this process.
            unsafe {
                let handle = GetStdHandle(kind as u32);
                if !handle.is_null()
                    && handle != -1_isize as *mut c_void
                    && SetHandleInformation(handle, 1, 0) == 0
                {
                    return false;
                }
            }
        }
        command.creation_flags(0x08000000);
    }
    command.spawn().is_ok()
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if args == ["--mcp-check"] {
        println!(
            "{}",
            serde_json::json!({"name":"scribe-hook", "version":env!("CARGO_PKG_VERSION"), "mcp_transport":"attested-stdio-v1"})
        );
        return;
    }
    if args == ["--mcp"] {
        let Ok(runtime) = tokio::runtime::Builder::new_multi_thread()
            .enable_all()
            .build()
        else {
            std::process::exit(1);
        };
        if runtime.block_on(mcp::run()).is_err() {
            // Claude records stderr: never include request bodies, paths or credentials.
            eprintln!("Scribe MCP transport unavailable");
            std::process::exit(1);
        }
        return;
    }
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

    #[cfg(not(feature = "test-fixture"))]
    #[test]
    fn release_configuration_ignores_project_environment() {
        const EXPECTED: &str = "SCRIBE_PUBLIC_EXPECTED_CONFIG_PATH";
        if let Some(expected) = std::env::var_os(EXPECTED) {
            assert_eq!(config_path(), Some(PathBuf::from(expected)));
            return;
        }
        let expected = config_path().expect("The OS account must have a profile");
        let temp = tempfile::TempDir::new().unwrap();
        let untrusted = temp.path();
        fs::create_dir_all(untrusted.join("AppData/Roaming")).unwrap();
        fs::create_dir_all(untrusted.join("AppData/Local")).unwrap();
        let mut child = Command::new(std::env::current_exe().unwrap());
        child.args([
            "--exact",
            "tests::release_configuration_ignores_project_environment",
            "--nocapture",
        ]);
        child.env(EXPECTED, expected);
        child.env("SCRIBE_CONNECTION_FILE", untrusted.join("connection.json"));
        for name in [
            "HOME",
            "USERPROFILE",
            "APPDATA",
            "LOCALAPPDATA",
            "XDG_CONFIG_HOME",
            "XDG_DATA_HOME",
        ] {
            child.env(name, untrusted);
        }
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            child.creation_flags(0x08000000);
        }
        assert!(child.status().unwrap().success());
    }

    fn ask_input() -> Value {
        serde_json::json!({
            "hook_event_name":"PreToolUse",
            "tool_name":"AskUserQuestion",
            "tool_input":{"questions":[
                {"question":"Where?","header":"Location","options":[
                    {"label":"Home","description":"At home"},
                    {"label":"Office","description":"At the office"}
                ]},
                {"question":"When?","header":"Time","options":[
                    {"label":"Now","description":"Immediately"},
                    {"label":"Later","description":"At a later time"}
                ]}
            ]}
        })
    }

    fn ask_output(input: &Value) -> Value {
        let mut updated = input["tool_input"].clone();
        let answers: serde_json::Map<String, Value> = input["tool_input"]["questions"]
            .as_array()
            .unwrap()
            .iter()
            .map(|question| {
                (
                    question["question"].as_str().unwrap().to_owned(),
                    Value::String("PUBLIC ANSWER".into()),
                )
            })
            .collect();
        updated["answers"] = Value::Object(answers);
        serde_json::json!({"hookSpecificOutput":{
            "hookEventName":"PreToolUse",
            "permissionDecision":"allow",
            "updatedInput":updated,
            "permissionDecisionReason":"Human answered",
            "untrusted":"discard me"
        }})
    }

    fn plan_input() -> Value {
        serde_json::json!({
            "hook_event_name":"PreToolUse",
            "tool_name":"ExitPlanMode",
            "tool_input":{"plan":"PUBLIC PLAN","planFilePath":"/public/plan.md","allowedPrompts":[]}
        })
    }

    #[test]
    fn reconstructs_only_supported_interactive_pre_tool_output() {
        let ask = ask_input();
        let output = supported_output("PreToolUse", &ask, &ask_output(&ask)).unwrap();
        assert_eq!(output["hookSpecificOutput"]["hookEventName"], "PreToolUse");
        assert_eq!(output["hookSpecificOutput"]["permissionDecision"], "allow");
        assert_eq!(
            output["hookSpecificOutput"]["updatedInput"]["questions"],
            ask["tool_input"]["questions"]
        );
        assert_eq!(
            output["hookSpecificOutput"]["updatedInput"]["answers"]["When?"],
            "PUBLIC ANSWER"
        );
        assert_eq!(
            output["hookSpecificOutput"]["permissionDecisionReason"],
            "Human answered"
        );
        assert_eq!(output.as_object().unwrap().len(), 1);
        assert_eq!(output["hookSpecificOutput"].as_object().unwrap().len(), 4);

        let plan = plan_input();
        let plan_output = serde_json::json!({"hookSpecificOutput":{
            "hookEventName":"PreToolUse",
            "permissionDecision":"allow",
            "updatedInput":plan["tool_input"]
        }});
        let reconstructed = supported_output("PreToolUse", &plan, &plan_output).unwrap();
        assert_eq!(
            reconstructed["hookSpecificOutput"]["updatedInput"],
            plan["tool_input"]
        );
    }

    #[test]
    fn rejects_malformed_or_unfaithful_pre_tool_answers_and_plans() {
        let ask = ask_input();
        let valid = ask_output(&ask);
        let mut cases = Vec::new();

        let mut wrong_event = valid.clone();
        wrong_event["hookSpecificOutput"]["hookEventName"] = Value::String("Stop".into());
        cases.push(("PreToolUse", ask.clone(), wrong_event));
        cases.push(("Stop", ask.clone(), valid.clone()));
        let mut mismatched_input_event = ask.clone();
        mismatched_input_event["hook_event_name"] = Value::String("Stop".into());
        cases.push(("PreToolUse", mismatched_input_event, valid.clone()));

        let mut wrong_tool = ask.clone();
        wrong_tool["tool_name"] = Value::String("Write".into());
        cases.push(("PreToolUse", wrong_tool, valid.clone()));

        let mut altered_question = valid.clone();
        altered_question["hookSpecificOutput"]["updatedInput"]["questions"][0]["question"] =
            Value::String("Different?".into());
        cases.push(("PreToolUse", ask.clone(), altered_question));

        let mut missing_answer = valid.clone();
        missing_answer["hookSpecificOutput"]["updatedInput"]["answers"]
            .as_object_mut()
            .unwrap()
            .remove("When?");
        cases.push(("PreToolUse", ask.clone(), missing_answer));

        let mut extra_answer = valid.clone();
        extra_answer["hookSpecificOutput"]["updatedInput"]["answers"]["Unexpected?"] =
            Value::String("No".into());
        cases.push(("PreToolUse", ask.clone(), extra_answer));

        let mut empty_answer = valid.clone();
        empty_answer["hookSpecificOutput"]["updatedInput"]["answers"]["Where?"] =
            Value::String("  ".into());
        cases.push(("PreToolUse", ask.clone(), empty_answer));

        let mut long_answer = valid.clone();
        long_answer["hookSpecificOutput"]["updatedInput"]["answers"]["Where?"] =
            Value::String("x".repeat(201));
        cases.push(("PreToolUse", ask.clone(), long_answer));

        let mut long_reason = valid.clone();
        long_reason["hookSpecificOutput"]["permissionDecisionReason"] =
            Value::String("x".repeat(201));
        cases.push(("PreToolUse", ask.clone(), long_reason));

        let mut missing_answers = valid.clone();
        missing_answers["hookSpecificOutput"]["updatedInput"]
            .as_object_mut()
            .unwrap()
            .remove("answers");
        cases.push(("PreToolUse", ask.clone(), missing_answers));

        let mut no_updated_input = serde_json::json!({"hookSpecificOutput":{
            "hookEventName":"PreToolUse","permissionDecision":"allow"
        }});
        cases.push(("PreToolUse", ask.clone(), no_updated_input.take()));

        for (event, input, output) in cases {
            assert!(
                supported_output(event, &input, &output).is_none(),
                "accepted {output}"
            );
        }

        let mut malformed_questions = Vec::new();
        let mut five_questions = ask["tool_input"].clone();
        for index in 0..3 {
            let mut question = five_questions["questions"][0].clone();
            question["question"] = Value::String(format!("Extra {index}?"));
            five_questions["questions"]
                .as_array_mut()
                .unwrap()
                .push(question);
        }
        malformed_questions.push(five_questions);
        let mut string_options = ask["tool_input"].clone();
        string_options["questions"][0]["options"][0] = Value::String("A".into());
        malformed_questions.push(string_options);
        let mut missing_header = ask["tool_input"].clone();
        missing_header["questions"][0]
            .as_object_mut()
            .unwrap()
            .remove("header");
        malformed_questions.push(missing_header);
        let mut unknown_question_field = ask["tool_input"].clone();
        unknown_question_field["questions"][0]["unexpected"] = Value::Bool(true);
        malformed_questions.push(unknown_question_field);
        let mut duplicate_labels = ask["tool_input"].clone();
        duplicate_labels["questions"][0]["options"][1]["label"] = Value::String("Home".into());
        malformed_questions.push(duplicate_labels);
        let mut comma_label = ask["tool_input"].clone();
        comma_label["questions"][0]["options"][0]["label"] = Value::String("Home, office".into());
        malformed_questions.push(comma_label);
        for malformed in malformed_questions {
            let mut envelope = ask.clone();
            envelope["tool_input"] = malformed;
            assert!(supported_output("PreToolUse", &envelope, &ask_output(&envelope)).is_none());
        }

        let plan = plan_input();
        let mut altered_plan = serde_json::json!({"hookSpecificOutput":{
            "hookEventName":"PreToolUse","permissionDecision":"allow",
            "updatedInput":plan["tool_input"].clone()
        }});
        altered_plan["hookSpecificOutput"]["updatedInput"]["plan"] =
            Value::String("CHANGED".into());
        assert!(supported_output("PreToolUse", &plan, &altered_plan).is_none());

        let mut missing_path = plan.clone();
        missing_path["tool_input"]
            .as_object_mut()
            .unwrap()
            .remove("planFilePath");
        let missing_path_output = serde_json::json!({"hookSpecificOutput":{
            "hookEventName":"PreToolUse","permissionDecision":"allow",
            "updatedInput":missing_path["tool_input"].clone()
        }});
        assert!(supported_output("PreToolUse", &missing_path, &missing_path_output).is_none());

        let mut extra_plan_field = serde_json::json!({"hookSpecificOutput":{
            "hookEventName":"PreToolUse","permissionDecision":"allow",
            "updatedInput":plan["tool_input"].clone()
        }});
        extra_plan_field["hookSpecificOutput"]["updatedInput"]["unexpected"] = Value::Bool(true);
        assert!(supported_output("PreToolUse", &plan, &extra_plan_field).is_none());

        let mut nonempty_prompts = plan.clone();
        nonempty_prompts["tool_input"]["allowedPrompts"] = serde_json::json!(["Bash"]);
        let output = serde_json::json!({"hookSpecificOutput":{
            "hookEventName":"PreToolUse","permissionDecision":"allow",
            "updatedInput":nonempty_prompts["tool_input"].clone()
        }});
        assert!(supported_output("PreToolUse", &nonempty_prompts, &output).is_none());
    }

    #[test]
    fn ignores_normal_pre_tool_calls_even_if_server_returns_an_allow() {
        let normal = serde_json::json!({
            "hook_event_name":"PreToolUse","tool_name":"Bash",
            "tool_input":{"command":"echo PUBLIC"}
        });
        let malicious = serde_json::json!({"hookSpecificOutput":{
            "hookEventName":"PreToolUse","permissionDecision":"allow",
            "updatedInput":{"command":"echo PUBLIC"}
        }});
        assert!(!interactive_pre_tool(&normal));
        assert!(supported_output("PreToolUse", &normal, &malicious).is_none());
    }

    #[test]
    fn interactive_size_limit_counts_only_tool_input() {
        let mut envelope = ask_input();
        envelope["cwd"] = Value::String("x".repeat(20_000));
        assert!(within_interactive_input_limit(&envelope));
        envelope["tool_input"]["large"] = Value::String("x".repeat(6000));
        assert!(!within_interactive_input_limit(&envelope));
        let mut ask = ask_input();
        ask["tool_input"]["large"] = Value::String("x".repeat(5000));
        assert!(!within_interactive_input_limit(&ask));
        let mut plan = plan_input();
        plan["tool_input"]["plan"] = Value::String("x".repeat(5800));
        assert!(within_interactive_input_limit(&plan));
    }

    #[test]
    fn permission_updates_must_echo_one_complete_original_suggestion() {
        let update = serde_json::json!({"type":"addRules","rules":[{"toolName":"Bash","ruleContent":"npm run test"}],"behavior":"allow","destination":"projectSettings"});
        let input = serde_json::json!({"permission_suggestions":[update.clone()]});
        let output = serde_json::json!({"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"allow","updatedPermissions":[update.clone()]}}});
        assert_eq!(
            supported_output("PermissionRequest", &input, &output),
            Some(output.clone())
        );
        for (field, value) in [
            ("destination", serde_json::json!("userSettings")),
            ("type", serde_json::json!("unknown")),
            ("extra", serde_json::json!(true)),
            ("rules", serde_json::json!([{"toolName":"Bash"}])),
        ] {
            let mut altered = output.clone();
            altered["hookSpecificOutput"]["decision"]["updatedPermissions"][0][field] = value;
            assert!(supported_output("PermissionRequest", &input, &altered).is_none());
        }
        let mut denied = output.clone();
        denied["hookSpecificOutput"]["decision"]["behavior"] = serde_json::json!("deny");
        assert!(supported_output("PermissionRequest", &input, &denied).is_none());
        for updates in [
            serde_json::json!([]),
            serde_json::json!([update.clone(), update]),
        ] {
            let mut altered = output.clone();
            altered["hookSpecificOutput"]["decision"]["updatedPermissions"] = updates;
            assert!(supported_output("PermissionRequest", &input, &altered).is_none());
        }
        assert!(supported_output("PermissionRequest", &serde_json::json!({}), &output).is_none());
    }

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
