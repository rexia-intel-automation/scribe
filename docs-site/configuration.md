# Configuration

## Published beta.1

The Windows `v0.1.0-beta.1` app uses plugin `0.1.0` and its local HTTP connection. Its original setup script is compatible only with the plugin source from the same beta tag, with the beta app open. The current marketplace branch is plugin `0.1.1` over stdio; it cannot pair with the beta.1 app/helper. Do not mix these versions or run the current repository script against beta.1. The app's `0.1.0` version string does not distinguish beta.1 from the stdio candidate.

## Stdio candidate

The candidate app/helper `0.1.0` and plugin `0.1.1` stdio combination is not published or accepted yet. Its setup instructions will require checksums, the `BUILD-METADATA.txt` source SHA and an updated native Claude Code CLI. The candidate script updates the marketplace/plugin and verifies that plugin `0.1.1` is enabled in user scope, including its folder version when reported, before configuration. Do not use these instructions with beta.1.

Launch the paired app once to create its connection file before configuring the stdio plugin; the app may close during configuration. With the app closed, `/mcp` should still show a connected server. A tool call that needs the app reports it unavailable; reopen the app and repeat the call in the same Claude Code session. These are expected test results, with human acceptance still pending.

Scribe settings include language, theme, global shortcut, notifications, history retention, and the local connection port. Use the app's Settings screen to change them. Native desktop notifications remain under review and are not part of published beta.1.

Do not paste `%APPDATA%\com.rexia.scribe` into tickets or chat. Managed Claude Code policies such as `disableAllHooks` or `allowManagedHooksOnly` can prevent user-installed hooks from running; ask your administrator to check organization policy rather than changing managed settings yourself.
