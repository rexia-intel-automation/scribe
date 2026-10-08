# How Scribe works

The Scribe plugin registers Claude Code hooks. A small native Rust client sends supported, sanitized event data to the local Scribe app. The app updates a session list and presents human decisions in its desktop window. When the user chooses an action, the local response returns through the hook or supported question flow.

The app does not run a model, use an AI API key, or provide remote session control. The documented design keeps its service on loopback and does not send telemetry. For security boundaries and known limitations, see [Security](/security).

The plugin and desktop app are separate installation steps in the Windows beta. A new Claude Code session is required after plugin setup so it loads the hooks.
