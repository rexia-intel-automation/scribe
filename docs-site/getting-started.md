# Getting started

After installing the Windows beta and configuring the plugin:

1. Close existing Claude Code sessions and start a new interactive session with `claude`.
2. Keep Scribe open. Start work in more than one project to see sessions appear.
3. When a permission card appears, inspect the visible target before choosing **Allow once** or **Deny**. Hidden or ambiguous targets must be answered in the terminal.
4. Complete the test checklist from the beta release. Record the Claude Code and Windows versions and the exact step that failed.

The user-level plugin configuration is separate from app installation. Re-running the setup script reuses the existing app connection; do not copy connection tokens into reports. `claude -p` is not the acceptance path for interactive AskUserQuestion prompts.
