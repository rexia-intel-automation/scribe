# Security and privacy

Scribe is designed to keep its service on `127.0.0.1` and its event flow on the same computer. The app does not call an AI model or send telemetry. The plugin sends only the event data needed to update session state and show supported decisions; displayed targets are sanitized, and ambiguous or hidden content must be handled in the Claude Code terminal.

## Decision safety

Permission cards require a human action. Risky requests require a separate confirmation after a delay. Expiration, disconnection, and failure do not mean approval. Native question and plan flows are limited to supported inputs; a fresh interactive Claude Code test is still pending for acceptance.

## Data and limits

Scribe stores sanitized session metadata locally, with 14 days as the default retention period. It does not store raw hook envelopes or full tool results. The security boundary does not protect against malware running as the same operating-system user, administrators, or a compromised host process. Scribe does not replace Claude Code permission rules, organization policy, or sandboxing.

The installer is unsigned. A checksum detects a mismatch against a trusted checksum source but does not, by itself, prove who created a file. Follow your organization’s policy.

This page summarizes documented design and tests; it is not a claim of independent security certification or final release acceptance. See the repository’s [security policy](https://github.com/rexia-intel-automation/scribe/blob/main/SECURITY.md) to report a vulnerability.
