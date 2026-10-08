# Scribe

Local desktop companion for Claude Code sessions and human decisions.

[Português brasileiro](README.pt-BR.md)

**Release status:** `v0.1.0-beta.1` is the last published Windows beta. The
current MCP stdio candidate is still under validation; it has not been published
or accepted as a release. Interactive native questions and plan approval still
need a fresh Claude Code session test. See
[decision verification](docs/fase-4.md) for evidence and remaining limits.

The candidate plugin is `0.1.1` and requires helper capability
`attested-stdio-v1`. The published beta.1 plugin uses HTTP/Bearer and is
incompatible. The candidate app/helper still report package version `0.1.0`,
which is also used by beta.1, so the numeric version alone does not identify a
compatible build. Keep the app, helper, configuration script, plugin source,
and checksums from the same candidate package/revision; record the
`source_sha` from `BUILD-METADATA.txt`. The setup script checks the helper
capability, but that check does not prove the desktop app is running or validate
an MCP tool call. If the app is upgraded first, the old plugin can report “MCP
server failed” after HTTP 401; install plugin 0.1.1 and rerun configuration.

This repository is the `rexia-scribe` marketplace; its configuration-only plugin
is in `plugins/scribe`. The installer includes the Rust hook client, so Scribe
does not require a separate Node installation.

Production app and helper use the OS account profile and ignore environment
overrides. On Linux, the connection lives in `~/.config/com.rexia.scribe` and
history in `~/.local/share/com.rexia.scribe`, using the account database's home.
Users with custom `XDG_CONFIG_HOME` or `XDG_DATA_HOME` will see a new profile at
these fixed paths. Existing data is neither imported nor deleted; preserve it
before upgrading.

## Windows candidate test

There is no published download for the MCP stdio candidate yet. When IT provides
the candidate package, use its matching files together:

- `Scribe_0.1.0_x64-setup.exe` (app and helper)
- `configure-claude-plugin.ps1`
- `SHA256SUMS.txt` and `BUILD-METADATA.txt`
- `teste-equipe-ti.md` (test checklist)
- plugin `scribe` version `0.1.1` from that same candidate revision

The previously published
[v0.1.0-beta.1 release](https://github.com/rexia-intel-automation/scribe/releases/tag/v0.1.0-beta.1)
is retained for historical reference only. Its app/helper and HTTP/Bearer
plugin are incompatible with the stdio candidate; do not use that download for
this test. Before testing, the marketplace source used by the configuration
script must provide plugin `0.1.1`: the script reuses an existing
`rexia-scribe` marketplace or, if none exists, installs from the public
repository's default branch. The candidate script refreshes an existing
marketplace, updates the plugin and verifies that plugin `0.1.1` is enabled for
the user before configuring it. An outdated or mismatched plugin causes setup
to fail. The candidate remains pending CI and an external interactive test.

Verify the downloaded installer and script against their entries in
`SHA256SUMS.txt` before running them. In PowerShell:

```powershell
$setup = Get-ChildItem .\Scribe_*_x64-setup.exe
Get-FileHash $setup.FullName -Algorithm SHA256
Get-FileHash .\configure-claude-plugin.ps1 -Algorithm SHA256
Get-Content .\SHA256SUMS.txt
Get-Content .\BUILD-METADATA.txt
```

Compare each `Get-FileHash` value with the SHA-256 entry for that exact filename.
Confirm the `source_sha` in `BUILD-METADATA.txt` and that the installer, helper,
script and plugin all belong to the same candidate revision. Stop and ask IT if
an entry is missing or a hash differs. Do not run the files until the hashes
match.

Install the setup executable for the current user. Open **Scribe** from the
Windows Start menu shortcut once so it creates its private connection file;
you may close Scribe before configuring Claude Code. Use a normal,
non-elevated PowerShell 5.1 or 7 window. The official native Claude Code
installation must provide `claude.exe` on `PATH`; npm command shims are not
supported. Run the setup script from the candidate package directory:

```powershell
powershell.exe -NoProfile -File .\configure-claude-plugin.ps1
```

For PowerShell 7, use:

```powershell
pwsh -NoProfile -File .\configure-claude-plugin.ps1
```

The script takes no parameters. It requires the native `claude.exe` to be on
`PATH`, the installed `scribe-hook.exe`, and a current Scribe connection file.
It configures the plugin for your user; it does not require you to copy or paste
a token. The plugin launches the configured helper over stdio; the installed
helper must be from the matching candidate build and support `--mcp`.
Configuration does not make an HTTP health request, and Scribe need not remain
open. If the script reports that the MCP helper key or capability is missing,
install the matching app/helper candidate before configuring the plugin. If it
reports a failure, record its stage and exit status for IT. It withholds Claude
CLI output.

The MCP plugin no longer stores or sends the connection Bearer token through
Claude Code `userConfig`. Any token saved by an older plugin configuration is
unused by this candidate; the connection file remains private to Scribe. The
script uses the official CLI and does not directly edit or clean Claude Code's
configuration files. Update the
app/helper and plugin together; use `source_sha` and the capability check to
identify compatibility because app/helper package version `0.1.0` does not
distinguish the candidate from beta.1.

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
with `claude` so it loads the hooks. With Scribe closed, `/mcp` should still list
the `scribe` server and its tools; a tool call that needs the app should report
that Scribe is unavailable. Reopen Scribe and retry in that same Claude session;
the call should recover without restarting Claude Code. The `claude -p`
non-interactive mode is not the test path for interactive AskUserQuestion
prompts. Follow the
[IT test guide](docs/teste-equipe-ti.md), also included as the downloaded
`teste-equipe-ti.md`, and record failures without including
tokens, secrets, or the contents of `%APPDATA%\com.rexia.scribe`.

### Update and uninstall

Close Scribe from its tray menu and run the candidate installer to update. The
previous beta upgrade test preserved history and credentials; the candidate
update still needs its own validation. Uninstall through **Settings →
Apps → Scribe**; this removes the app while keeping its profile in
`%APPDATA%\com.rexia.scribe`. To remove personal history too, close the app and
remove that profile explicitly. Reinstalling after removing `connection.json`
creates new credentials: run the configuration script again. After updating
Scribe, run the configuration script again to refresh the helper path stored by
the plugin.

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
