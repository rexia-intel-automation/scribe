# Scribe

Local desktop companion for Claude Code sessions and human decisions.

[Português brasileiro](README.pt-BR.md)

**Release status:** `v0.1.0-beta.1` is the last published Windows beta. The
current MCP stdio candidate is still under validation; it has not been published
or accepted as a release. Interactive native questions and plan approval still
need a fresh Claude Code session test. See
[decision verification](https://github.com/rexia-intel-automation/scribe/blob/main/docs/fase-4.md) for evidence and remaining limits.

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

On Windows, history uses `%LOCALAPPDATA%\com.rexia.scribe\history`; connection
and preferences stay in `%APPDATA%\com.rexia.scribe`. The upgrade migrates old
history before opening SQLite. Incoming history that conflicts with an existing
local history is preserved separately for IT; Scribe keeps using the local copy
and displays a notice. Cleanup failures after verified publication also display
a notice while local history stays usable. Changes during copying or invalid
migration metadata preserve the data and stop storage until IT resolves them.
History is per machine. In VDI/RDS environments that discard local storage at
logoff, history is lost when that storage is discarded; confirm your IT policy.
Old backups and corporate Roaming server copies are not deleted by Scribe.

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
[IT test guide](https://github.com/rexia-intel-automation/scribe/blob/main/docs/teste-equipe-ti.md), also included as the downloaded
`teste-equipe-ti.md`, and record failures without including
tokens, secrets, or the contents of either Scribe data folder.

## macOS and Linux candidate setup

The stdio candidate packages are not published yet. These instructions describe
the expected candidate package layout and are not evidence of a completed clean
install; the published beta.1 is Windows-only and incompatible with plugin
0.1.1. Use only a future paired package whose app, helper, plugin, checksums,
and `BUILD-METADATA.txt` `source_sha` match. Follow your organization's policy
for unsigned software. Do not disable Gatekeeper or other security controls.

On macOS, verify the DMG with `shasum -a 256 -c SHA256SUMS.txt`, open it in
Finder, and copy `Scribe.app` to Applications. Launch Scribe from Applications
once to create its private connection. The helper path for the system
Applications folder is `/Applications/Scribe.app/Contents/MacOS/scribe-hook`.
If macOS blocks the unsigned app, stop and follow your organization's process
for approved software; this guide does not bypass Gatekeeper.

For a Debian/Ubuntu package, verify it with `sha256sum -c SHA256SUMS.txt`,
install the matching `.deb`, and locate the helper from the installed package.
For the 0.1.0 candidate on Debian/Ubuntu:

```sh
sudo apt install ./Scribe_0.1.0_amd64.deb
dpkg -L scribe | grep '/scribe-hook$'
```

Launch Scribe from the desktop application menu once to create its private
connection. Use the absolute helper path printed by `dpkg -L` as
`SCRIBE_HELPER` below.

On macOS, set `SCRIBE_HELPER` to the path above. On Debian/Ubuntu, set it to
the exact path printed by `dpkg -L`:

```sh
SCRIBE_HELPER='/absolute/path/to/scribe-hook'
test -x "$SCRIBE_HELPER"
```

For an AppImage on Ubuntu 22.04, install the host FUSE and EGL libraries first:

```sh
sudo apt-get update
sudo apt-get install -y libfuse2 libegl1
```

Other distributions require their corresponding FUSE 2 and EGL packages.
AppImage relies on the host's graphics libraries; see the
[AppImage graphics-library exclusions](https://docs.appimage.org/introduction/concepts.html#build-on-old-systems-run-on-newer-systems).

Then verify its checksum, make it executable, and extract it into a
new, empty permanent directory owned by your account. The helper must remain there so
Claude Code can start it when Scribe is closed. Do not configure a helper path
under a temporary AppImage mount:

```sh
chmod +x ./Scribe*.AppImage
mkdir -p "$HOME/.local/opt/scribe-candidate"
cd "$HOME/.local/opt/scribe-candidate"
/absolute/path/to/Scribe.AppImage --appimage-extract
mv squashfs-root appimage-root
find "$HOME/.local/opt/scribe-candidate/appimage-root" -name scribe-hook -print
```

Open the original AppImage from your file manager once to create the private
connection. Keep the extracted directory in place for the helper path.

Use the absolute path printed by `find` as `SCRIBE_HELPER`. Type 2 AppImages
support `--appimage-extract`, which creates `squashfs-root` in the current
directory; see the [official AppImage extraction guide](https://docs.appimage.org/user-guide/run-appimages.html#extract-the-contents-of-an-appimage).

Set it to the path returned by `find` and confirm it is executable:

```sh
SCRIBE_HELPER="$(find "$HOME/.local/opt/scribe-candidate/appimage-root" -name scribe-hook -print -quit)"
test -x "$SCRIBE_HELPER"
```

After installing and opening the app once, install the paired plugin for your
user with the native Claude Code CLI. First check that the helper exits
successfully and reports the candidate capability:

```sh
"$SCRIBE_HELPER" --mcp-check
```

Continue only when the JSON reports `name` `scribe-hook`, `version` `0.1.0`,
and `mcp_transport` `attested-stdio-v1`. This checks the helper build and its
ability to start; it does not prove that the desktop app is running or validate
a live MCP call.

Check whether the named marketplace is already registered:

```sh
claude plugin marketplace list --json
```

If it lists `rexia-scribe`, update that marketplace, install its Scribe plugin,
and update the user-scope plugin. These are the argument forms used by the
Windows candidate setup script:

```sh
claude plugin marketplace update rexia-scribe
claude plugin install scribe@rexia-scribe --scope user --config "client_path=$SCRIBE_HELPER"
claude plugin update scribe@rexia-scribe --scope user
```

When `rexia-scribe` is absent, skip the marketplace update and use:

```sh
claude plugin install scribe --marketplace rexia-intel-automation/scribe --scope user --config "client_path=$SCRIBE_HELPER"
claude plugin update scribe@rexia-scribe --scope user
```

Before configuring or restarting Claude Code, check `claude plugin list --json`.
It must report exactly one user-scope `scribe@rexia-scribe` plugin with version
`0.1.1` and `enabled: true` (and `folderVersion: 0.1.1` when that field is
reported). Stop if the entry is missing, disabled, duplicated, or a different
version.

Set or refresh the helper path using the native CLI's `--values-stdin` form.
Python 3 is required only here to JSON-encode the path safely, including spaces
and backslashes:

```sh
printf '%s\n' "$SCRIBE_HELPER" | python3 -c 'import json,sys; print(json.dumps({"client_path": sys.stdin.read().rstrip("\n")}))' | claude plugin configure scribe@rexia-scribe --values-stdin
```

The plugin stores only the helper path; the helper reads the connection from
the current OS account's private Scribe profile. Do not copy the Scribe token.
Restart Claude Code after configuration. CLI setup on macOS and Linux, clean
package installation, and visual app behavior remain unvalidated; a fresh
interactive session and visual checks are separate manual acceptance steps.

For an AppImage update, close Scribe and all Claude Code sessions first. Verify
the paired new AppImage, extract it into a new empty permanent directory, launch
the updated AppImage once, and set `SCRIBE_HELPER` to the helper inside that new
extraction. Repeat the helper check, marketplace/plugin version check, and
`plugin configure` step above before restarting Claude Code. Keep the old
extraction until the new helper path is configured; then it can be removed.

## Windows update and uninstall

Close Scribe from its tray menu and run the candidate installer to update. The
previous beta upgrade test preserved history and credentials; the candidate
update still needs its own validation. Uninstall through **Settings →
Apps → Scribe**; this removes the app while keeping configuration in
`%APPDATA%\com.rexia.scribe` and local history in
`%LOCALAPPDATA%\com.rexia.scribe`. To remove personal data too, close Scribe and
all Claude Code sessions, then explicitly remove **both** folders. This includes
local migration receipts and preserved Roaming conflict or cleanup copies.
Older corporate backups and server copies require your IT team's retention
procedure; deleting these folders does not erase those copies or disk remnants.
Reinstalling after removing `connection.json`
creates new credentials: run the configuration script again. After updating
Scribe, run the configuration script again to refresh the helper path stored by
the plugin.

## Windows troubleshooting

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
cross-agent collaboration is recorded in the [product plan](https://github.com/rexia-intel-automation/scribe/blob/main/docs/plano-v0.1.md)
and remains future work, not a v0.1 capability.

MIT © 2026 RexIA Tecnologia e Automação Digital LTDA.

Independent open-source project by RexIA. Not affiliated with Anthropic.
Claude and Claude Code are trademarks of Anthropic, cited only to describe
compatibility.
