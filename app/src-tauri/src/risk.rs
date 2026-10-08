//! User patterns add literal warnings; they cannot replace built-in policy.
use crate::Result;
use std::collections::HashSet;

pub(crate) fn validate(patterns: &[String]) -> Result<Vec<String>> {
    if patterns.len() > 32 || patterns.iter().map(String::len).sum::<usize>() > 2048 {
        return Err("Invalid risk patterns".into());
    }
    let mut seen = HashSet::new();
    let mut normalized = Vec::new();
    for pattern in patterns {
        if pattern.len() > 128
            || pattern.trim().is_empty()
            || crate::sanitize::ambiguous_text(pattern)
        {
            return Err("Invalid risk pattern".into());
        }
        let pattern = pattern.trim().to_lowercase();
        if !seen.insert(pattern.clone()) {
            return Err("Duplicate risk pattern".into());
        }
        normalized.push(pattern);
    }
    Ok(normalized)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn bounds_controls_and_duplicates_are_rejected_before_publish() {
        for patterns in [
            vec!["".into()],
            vec![" ".into()],
            vec!["x".repeat(129)],
            vec!["x\n".into()],
            vec!["x\u{202e}".into()],
            vec!["Foo".into(), "foo".into()],
            (0..33).map(|n| n.to_string()).collect(),
            (0..17)
                .map(|n| format!("{n:03}{}", "x".repeat(125)))
                .collect(),
        ] {
            assert!(validate(&patterns).is_err(), "{patterns:?}");
        }
        assert!(validate(&[]).unwrap().is_empty());
        assert_eq!(
            validate(&[" Restart-Service ".into()]).unwrap(),
            ["restart-service"]
        );
        assert!(validate(&["é".repeat(65)]).is_err());
    }
}
