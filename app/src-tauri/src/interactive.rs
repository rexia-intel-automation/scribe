//! Native Claude questions and plans: display the complete safe input, echo it
//! only after an explicit answer, and keep original transport data in memory.
use crate::{decisions::DecisionInput, sanitize, Result};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct NativeOption {
    pub label: String,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NativeQuestion {
    pub question: String,
    pub header: String,
    pub options: Vec<NativeOption>,
    #[serde(default)]
    pub multi_select: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct NativeAnswer {
    #[serde(default)]
    pub options: Vec<usize>,
    pub text: Option<String>,
}

fn visible(text: &str, limit: usize, multiline: bool) -> bool {
    let controls = if multiline {
        text.replace(['\n', '\r', '\t'], "")
    } else {
        text.to_owned()
    };
    !text.trim().is_empty()
        && text.chars().count() <= limit
        && !sanitize::ambiguous_text(&controls)
        && sanitize::redact(text) == text
}

pub(crate) fn questions(input: &Value) -> Result<Vec<NativeQuestion>> {
    let object = input.as_object().ok_or("Invalid question input")?;
    if object.len() != 1 || !object.contains_key("questions") {
        return Err("Unsupported question fields".into());
    }
    let questions: Vec<NativeQuestion> = serde_json::from_value(input["questions"].clone())?;
    if !(1..=4).contains(&questions.len()) || serde_json::to_vec(input)?.len() > 5000 {
        return Err("Question input exceeds display limit".into());
    }
    for (index, question) in questions.iter().enumerate() {
        if !visible(&question.question, 200, false)
            || !visible(&question.header, 40, false)
            || !(2..=4).contains(&question.options.len())
            || questions[..index]
                .iter()
                .any(|q| q.question.trim() == question.question.trim())
        {
            return Err("Question cannot be displayed unambiguously".into());
        }
        for (index, option) in question.options.iter().enumerate() {
            if !visible(&option.label, 40, false)
                || option.label.contains(',')
                || !visible(&option.description, 400, false)
                || question.options[..index]
                    .iter()
                    .any(|o| o.label.trim() == option.label.trim())
            {
                return Err("Options cannot be displayed unambiguously".into());
            }
        }
    }
    // Each free answer can contain 200 four-byte Unicode scalars. This also
    // bounds four selected 40-character labels, their commas and JSON escapes;
    // control characters are rejected by visible(). Reserve every answer now
    // so the card cannot offer a valid choice that exceeds the transport limit.
    let mut updated = input.clone();
    updated["answers"] = Value::Object(
        questions
            .iter()
            .map(|q| (q.question.clone(), Value::String("\u{20000}".repeat(200))))
            .collect(),
    );
    if serde_json::to_vec(&allow_response(updated))?.len() > 8192 {
        return Err("Question answers exceed transport limit".into());
    }
    Ok(questions)
}

fn allow_response(updated: Value) -> Value {
    json!({"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow","updatedInput":updated}})
}

pub(crate) fn plan(input: &Value) -> Result<(&str, &str)> {
    let object = input.as_object().ok_or("Invalid plan input")?;
    if object
        .keys()
        .any(|key| !["plan", "planFilePath", "allowedPrompts"].contains(&key.as_str()))
        || object
            .get("allowedPrompts")
            .is_some_and(|v| v.as_array().is_none_or(|a| !a.is_empty()))
        || serde_json::to_vec(input)?.len() > 6000
    {
        return Err("Unsupported or oversized plan input".into());
    }
    let plan = input["plan"].as_str().ok_or("Missing plan content")?;
    let path = input["planFilePath"].as_str().ok_or("Missing plan path")?;
    if !visible(plan, 6000, true) || !visible(path, 1024, false) {
        return Err("Plan cannot be displayed unambiguously".into());
    }
    Ok((plan, path))
}

pub(crate) fn answer(kind: &str, original: &Value, input: &DecisionInput) -> Result<Value> {
    if input.option.is_some() {
        return Err("Invalid native decision".into());
    }
    if input.action.as_deref() == Some("deny") && input.answers.is_none() {
        let message = input
            .message
            .as_deref()
            .unwrap_or("Negado pelo usuário no Scribe");
        if !visible(message, 200, true) {
            return Err("Invalid native denial feedback".into());
        }
        return Ok(
            json!({"hookSpecificOutput":{"hookEventName":"PreToolUse", "permissionDecision":"deny", "permissionDecisionReason":message}}),
        );
    }
    if input.message.is_some() {
        return Err("Invalid native answer message".into());
    }
    let mut updated = original.clone();
    match kind {
        "plan" if input.action.as_deref() == Some("allow") && input.answers.is_none() => {
            plan(original)?;
        }
        "nativeQuestion" if input.action.as_deref() == Some("answer") => {
            let questions = questions(original)?;
            let answers = input.answers.as_ref().ok_or("Missing answers")?;
            if questions.len() != answers.len() {
                return Err("Every question requires an answer".into());
            }
            let mut result = serde_json::Map::new();
            for (question, answer) in questions.iter().zip(answers) {
                let text = if let Some(text) = &answer.text {
                    if !answer.options.is_empty() || !visible(text, 200, false) {
                        return Err("Invalid free answer".into());
                    }
                    text.to_owned()
                } else {
                    if answer.options.is_empty()
                        || !question.multi_select && answer.options.len() != 1
                        || answer.options.len() > question.options.len()
                    {
                        return Err("Invalid selected answers".into());
                    }
                    let mut labels = Vec::new();
                    for (index, option) in answer.options.iter().enumerate() {
                        if answer.options[..index].contains(option) {
                            return Err("Duplicate selected answer".into());
                        }
                        labels.push(
                            question
                                .options
                                .get(*option)
                                .ok_or("Unknown option")?
                                .label
                                .clone(),
                        );
                    }
                    labels.join(",")
                };
                result.insert(question.question.clone(), Value::String(text));
            }
            updated["answers"] = Value::Object(result);
        }
        _ => return Err("Invalid native choice".into()),
    }
    let response = allow_response(updated);
    if serde_json::to_vec(&response)?.len() > 8192 {
        return Err("Answer exceeds transport limit".into());
    }
    Ok(response)
}
