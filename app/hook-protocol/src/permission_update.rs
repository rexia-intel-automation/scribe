//! Recognize complete documented updates. Never create or broaden a rule.
use regex::Regex;
use serde_json::Value;
use std::sync::LazyLock;

fn text(value: &Value, limit: usize) -> bool {
    static FORMAT: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\p{Cf}").unwrap());
    value.as_str().is_some_and(|s| {
        !s.trim().is_empty()
            && s.len() <= limit
            && !s.chars().any(char::is_control)
            && !FORMAT.is_match(s)
    })
}

pub fn valid_permission_update(value: &Value) -> bool {
    let Some(object) = value.as_object() else {
        return false;
    };
    if !serde_json::to_vec(value).is_ok_and(|v| v.len() <= 2048)
        || !matches!(
            value["destination"].as_str(),
            Some("session" | "localSettings" | "projectSettings" | "userSettings")
        )
    {
        return false;
    }
    let fields: &[&str] = match value["type"].as_str() {
        Some("addRules" | "replaceRules" | "removeRules") => {
            if !matches!(value["behavior"].as_str(), Some("allow" | "deny" | "ask")) {
                return false;
            }
            let Some(rules) = value["rules"].as_array() else {
                return false;
            };
            if !(1..=8).contains(&rules.len())
                || !rules.iter().all(|rule| {
                    rule.as_object().is_some_and(|r| {
                        text(&rule["toolName"], 128)
                            && r.keys()
                                .all(|k| matches!(k.as_str(), "toolName" | "ruleContent"))
                            && r.get("ruleContent").is_none_or(|v| text(v, 1024))
                    })
                })
            {
                return false;
            }
            &["type", "rules", "behavior", "destination"]
        }
        Some("setMode") => {
            if !matches!(
                value["mode"].as_str(),
                Some(
                    "default"
                        | "auto"
                        | "acceptEdits"
                        | "dontAsk"
                        | "bypassPermissions"
                        | "plan"
                        | "manual"
                )
            ) {
                return false;
            }
            &["type", "mode", "destination"]
        }
        Some("addDirectories" | "removeDirectories") => {
            let Some(directories) = value["directories"].as_array() else {
                return false;
            };
            if !(1..=8).contains(&directories.len()) || !directories.iter().all(|v| text(v, 1024)) {
                return false;
            }
            &["type", "directories", "destination"]
        }
        _ => return false,
    };
    object.len() == fields.len() && object.keys().all(|k| fields.contains(&k.as_str()))
}
