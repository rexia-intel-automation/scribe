use regex::Regex;
use serde_json::Value;
use std::sync::LazyLock;

static SECRETS: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)\b(?:sk-[a-z0-9_-]{8,}|gh[pousr]_[a-z0-9_]{8,}|github_pat_[a-z0-9_]{8,}|xox[a-z]-[a-z0-9-]{8,}|AKIA[A-Z0-9]{16}|eyJ[a-z0-9_-]+\.[a-z0-9_-]+\.[a-z0-9_-]+)\b").unwrap()
});
static ASSIGNMENTS: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"(?is)(\b[a-z0-9_-]*(?:password|passwd|token|secret|api[_-]?key|access[_-]?key)[\\"'`]*\s*(?:[:=]|\s)\s*).*"#).unwrap()
});
static ENV_ASSIGNMENTS: LazyLock<Regex> = LazyLock::new(|| {
    // Without interpreting the shell, spaces/newlines/quotes cannot distinguish
    // a dotenv value from following arguments. Omit the ambiguous remainder.
    Regex::new(r"(?s)(\b[A-Za-z_][A-Za-z0-9_]*\s*=\s*).*").unwrap()
});
static AUTHORIZATION: LazyLock<Regex> = LazyLock::new(|| {
    // Quotes, escapes and shell concatenation never delimit a safe remainder.
    Regex::new(r"(?is)(\bauthorization\b).*").unwrap()
});
static QUOTED_PATH: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"(?P<quote>["'])(?P<path>(?:/|[A-Za-z]:[\\/]|\\\\)[^"'\r\n]+)["']"#).unwrap()
});
static INLINE_PATH: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"(?P<prefix>^|[\s=<>|&;(\[\{,])(?P<path>(?:/|[A-Za-z]:[\\/]|\\\\)[^\s"';|&<>]+)"#)
        .unwrap()
});

pub(crate) fn redact(text: &str) -> String {
    // A dotenv write can construct/encode '=' or expand variables. Recognizing
    // literal assignments alone cannot safely summarize commands targeting it.
    if text.to_ascii_lowercase().contains(".env") {
        return "••••".into();
    }
    let text = SECRETS.replace_all(text, "••••");
    let text = ASSIGNMENTS.replace_all(&text, "${1}••••");
    let text = ENV_ASSIGNMENTS.replace_all(&text, "${1}••••");
    AUTHORIZATION.replace_all(&text, "${1}: ••••").into_owned()
}

pub(crate) fn shorten_path(text: &str) -> String {
    let path = redact(text).replace('\\', "/");
    let parts: Vec<_> = path.split('/').filter(|s| !s.is_empty()).collect();
    let absolute = path.starts_with('/') || path.as_bytes().get(1) == Some(&b':');
    if absolute && parts.len() > 2 {
        format!("…/{}", parts[parts.len() - 2..].join("/"))
    } else {
        path
    }
}

pub(crate) fn summary(text: &str, limit: usize) -> String {
    let safe = redact(text);
    let safe = QUOTED_PATH.replace_all(&safe, |c: &regex::Captures| {
        format!("{}{}{}", &c["quote"], shorten_path(&c["path"]), &c["quote"])
    });
    let safe = INLINE_PATH.replace_all(&safe, |c: &regex::Captures| {
        format!("{}{}", &c["prefix"], shorten_path(&c["path"]))
    });
    let single_line: String = safe
        .chars()
        .map(|c| if c.is_control() { ' ' } else { c })
        .collect();
    let mut result: String = single_line.chars().take(limit).collect();
    if single_line.chars().count() > limit {
        result.push('…');
    }
    result
}

pub(crate) fn target(input: &Value) -> String {
    for key in ["file_path", "path"] {
        if let Some(path) = input.get(key).and_then(Value::as_str) {
            return summary(&shorten_path(path), 160);
        }
    }
    for key in ["command", "url", "pattern"] {
        if let Some(text) = input.get(key).and_then(Value::as_str) {
            return summary(text, 160);
        }
    }
    String::new()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn redacts_before_truncating_and_never_extracts_content_or_env() {
        for secret in [
            "sk-ant-PUBLIC123456789",
            "ghp_PUBLIC123456789",
            "xoxb-PUBLIC123456789",
            "AKIAABCDEFGHIJKLMNOP",
            "eyJhbGciOiJIUzI1NiJ9.eyJwdWJsaWMiOnRydWV9.signature",
        ] {
            assert!(!summary(&format!("read {secret}"), 200).contains(secret));
        }
        for text in [
            "password=PUBLIC_SECRET",
            "'token': 'PUBLIC_SECRET'",
            "FOO=PUBLIC_SECRET command",
            "Authorization: Bearer PUBLIC_SECRET",
            "\"API_KEY\":\"PUBLIC_SECRET\"",
        ] {
            assert!(!redact(text).contains("PUBLIC_SECRET"));
        }
        assert_eq!(
            target(
                &serde_json::json!({"content":"PUBLIC_SECRET", "env":{"SECRET":"PUBLIC_SECRET"}})
            ),
            ""
        );
        assert_eq!(
            shorten_path("C:\\Users\\public\\project\\file.rs"),
            "…/project/file.rs"
        );
        assert_eq!(
            summary("read '/private/user/project/file name.rs'", 100),
            "read '…/project/file name.rs'"
        );
        assert_eq!(
            summary("read C:\\Users\\public\\project\\file.rs", 100),
            "read …/project/file.rs"
        );
        assert_eq!(
            summary("https://example.invalid/path/file.rs", 100),
            "https://example.invalid/path/file.rs"
        );
        assert_eq!(summary("abc\nxyz", 5), "abc x…");
    }
}
