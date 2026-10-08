# Scribe

Local desktop companion for Claude Code sessions and human decisions.

[Português brasileiro](README.pt-BR.md)

**Testing status:** `v0.1.0-beta.1` is a Windows beta for evaluation by the IT
team. It is not a final release. Native questions and plan approval still need
testing in a fresh interactive Claude Code session. See
[decision verification](docs/fase-4.md) for evidence and remaining limits.

This repository is the `rexia-scribe` marketplace; its configuration-only plugin
is in `plugins/scribe`. The installer includes the Rust hook client, so Scribe
does not require a separate Node installation.

## Windows beta test

When the prerelease is published, download these assets from the
[v0.1.0-beta.1 release page](https://github.com/rexia-intel-automation/scribe/releases/tag/v0.1.0-beta.1):

- `Scribe_*_x64-setup.exe`
- `configure-claude-plugin.ps1`
- `SHA256SUMS`
- `teste-equipe-ti.md` (test checklist)

Verify the downloaded executable and script against
the matching filenames in `SHA256SUMS` before running them. In PowerShell:

```powershell
$setup = Get-ChildItem .\Scribe_*_x64-setup.exe
Get-FileHash $setup.FullName -Algorithm SHA256
Get-FileHash .\configure-claude-plugin.ps1 -Algorithm SHA256
Get-Content .\SHA256SUMS
```

Compare each `Get-FileHash` value with the SHA-256 entry for that exact filename.
Stop and ask IT if an entry is missing or a hash differs. Do not run the files
until the hashes match.

Install the setup executable for the current user. Open **Scribe** from the
Windows Start menu shortcut and leave it
running. In a normal, non-elevated PowerShell 5.1 or 7 window, run the setup
script from the directory where you downloaded it:

```powershell
powershell.exe -NoProfile -File .\configure-claude-plugin.ps1
```

For PowerShell 7, use:

```powershell
pwsh -NoProfile -File .\configure-claude-plugin.ps1
```

The script takes no parameters. It requires the native `claude.exe` to be on
`PATH` and the Scribe app to be open. It configures the plugin for your user; it
does not require you to copy or paste a token. If the script reports a failure,
record its stage and exit status for IT. It deliberately withholds Claude CLI
output.

The script is unsigned. `Restricted` blocks scripts; `RemoteSigned` can block
this downloaded file. Only after IT approves the file and its SHA-256, IT can
authorize this file-specific unblock and a `RemoteSigned` child process:

```powershell
Unblock-File -LiteralPath .\configure-claude-plugin.ps1
powershell.exe -NoProfile -ExecutionPolicy RemoteSigned -File .\configure-claude-plugin.ps1
```

The flag affects that process, without changing the machine/user policy.
`MachinePolicy`/`UserPolicy` take precedence; follow IT’s managed policy.
See Microsoft’s [execution policies](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_execution_policies?view=powershell-5.1)
and [Unblock-File](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.utility/unblock-file).

After setup, close Claude Code sessions and start a fresh interactive session
with `claude` so it loads the hooks. The `claude -p` non-interactive mode is not
the test path for interactive AskUserQuestion prompts. Follow the
[IT test guide](docs/teste-equipe-ti.md), also included as the downloaded
`teste-equipe-ti.md`, and record failures without including
tokens, secrets, or the contents of `%APPDATA%\com.rexia.scribe`.

### Update and uninstall

Close Scribe from its tray menu and run the newer setup to update. The verified
upgrade preserved the history and credentials. Uninstall through **Settings →
Apps → Scribe**; this removes the app while keeping its profile in
`%APPDATA%\com.rexia.scribe`. To remove personal history too, close the app and
remove that profile explicitly. Reinstalling after removing `connection.json`
creates new credentials: run the configuration script again.

### Troubleshooting

- The installer is unsigned; SmartScreen or corporate antivirus may block it.
  Record the exact message and follow IT’s policy.

- If a command contains `=` (for example, `x=y`) or looks like it contains a
  secret, Scribe may redact it and route the decision to the Claude Code
  terminal. This is the privacy fallback; answer there rather than treating it
  as a failed permission card.
- If a prompt or tool requires interactive input, use a foreground `claude`
  session rather than `claude -p`.
- Managed settings such as `disableAllHooks` or `allowManagedHooksOnly` can
  prevent the user-installed plugin hooks from running. Ask IT to check the
  organization’s policy; do not change managed settings yourself.
- If a long path or command is routed to the terminal instead of being shown in
  an interactive card, continue in the Claude Code terminal. Do not approve an
  action in the window when Scribe does not offer that choice.
- If plugin setup reports `Filename too long`, keep the checkout/cache path
  short and ask IT to check the organization’s Git long-path configuration. The
  setup script does not change Git settings.

The v0.1 beta remains a focused session companion. The v0.3 direction for
cross-agent collaboration is recorded in the [product plan](docs/plano-v0.1.md)
and remains future work, not a v0.1 capability.

MIT © 2026 RexIA Tecnologia e Automação Digital LTDA.

Independent open-source project by RexIA. Not affiliated with Anthropic.
Claude and Claude Code are trademarks of Anthropic, cited only to describe
compatibility.
