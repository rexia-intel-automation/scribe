# Configuration

In the published Windows beta, the setup script configures the plugin for the current user. Run the native `claude.exe` from PowerShell with the Scribe app open. The script uses the app’s existing connection and does not ask you to copy a token. It does not edit `settings.json` directly or generate a new app token.

After configuration, close Claude Code and start a fresh interactive session. Scribe settings include language, theme, global shortcut, notifications, history retention, and the local connection port. Use the app’s Settings screen to change them.

Native desktop notifications are still under review and are not part of the published beta. A notification preference in the settings does not mean that this beta delivers desktop notifications.

Do not paste the contents of `%APPDATA%\com.rexia.scribe` into tickets or chat. Managed Claude Code policies such as `disableAllHooks` or `allowManagedHooksOnly` can prevent user-installed hooks from running; ask your administrator to check organization policy rather than changing managed settings yourself.
