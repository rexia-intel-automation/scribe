# Architecture

```text
Claude Code hooks
       │ local native client
       ▼
Scribe local service ── sanitized state ──► desktop window
       ▲                                      │
       └──────────── human decision ──────────┘
```

The plugin declares hook handlers that launch the native client. The client communicates with the Scribe desktop app through a loopback service. The app stores sanitized session metadata locally and presents activity and decisions. The local service authenticates its routes; the hook protocol also verifies the peer before sending content.

Permission responses depend on an explicit user gesture. Unsupported or redacted targets return to the terminal, and failures or timeouts do not create an approval. These are implementation descriptions, not a substitute for reviewing the source or the current release evidence.

See [How it works](/how-it-works) for the user flow and [Security](/security) for boundaries and limitations.
