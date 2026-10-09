# Installation

## Published beta.1: Windows evaluation only

`v0.1.0-beta.1` is an unsigned Windows prerelease for IT evaluation, not an accepted final release. It pairs the app and native helper with plugin `0.1.0`, which uses the local HTTP connection. The current marketplace branch is plugin `0.1.1` over stdio and is incompatible with beta.1. The app still reports version `0.1.0`, so that number alone cannot identify the pairing.

Beta.1 has not been revalidated with Claude Code `2.1.294` and does not include the recent MCP fixes. Pinning the source below prevents mixing plugin versions; it does not prove that this beta's MCP tools work with the current client. The new paired package remains under validation.

The [beta release page](https://github.com/rexia-intel-automation/scribe/releases/tag/v0.1.0-beta.1) retains its original setup executable, script, checksums, and test checklist. Use only that release's files and a plugin source pinned to the same tag. The original script does not pin a revision when registering a new marketplace; running it alone can fetch the incompatible plugin from the current branch.

Verify each downloaded file against the release's `SHA256SUMS` before use. The installer is unsigned; follow your organization's policy if Windows or security software warns you. The original setup script requires native `claude.exe` on `PATH`; npm `.cmd` shims are not supported.

### Pin the plugin on a new machine

Before installing the executable or running the script, run `claude plugin marketplace list --json`. If `rexia-scribe` is already registered with a different `ref` or no `ref`, do not install the beta, run the script, or change that registration. If you already use the candidate app/helper or plugin `0.1.1`, preserve that installation. This procedure is for a new machine or an existing beta.1 pairing whose source is already pinned to the matching tag.

If the marketplace does not exist, register the beta.1 tag:

```powershell
claude plugin marketplace add "https://github.com/rexia-intel-automation/scribe.git#v0.1.0-beta.1" --scope user
claude plugin marketplace list --json
```

Check for `name: rexia-scribe` and `ref: v0.1.0-beta.1` in the listing. The `#<ref>` suffix is Claude Code's [documented pinning mechanism](https://code.claude.com/docs/en/plugins/host-marketplace#host-your-marketplace). Registering this source and validating its `0.1.0` manifest were checked in a separate profile; this does not replace a complete test with the app and real sessions.

Once the matching source is registered, install the beta.1 executable for the current user, launch Scribe from the Start menu, and keep it open. Run the original script downloaded from that release:

```powershell
powershell.exe -NoProfile -File .\configure-claude-plugin.ps1
```

PowerShell 7 uses `pwsh -NoProfile -File .\configure-claude-plugin.ps1`. Close Claude Code and start a fresh interactive session after setup. The script withholds Claude CLI output; if it fails, record the stage and exit code without sharing tokens or private profile contents.

## Stdio migration candidate: not published

The app/helper/plugin stdio candidate is still under preparation and review. It is not an installable release or an acceptance result. Do not download or configure a candidate from the repository branch.

When a paired package is published, it will include the README, setup script, IT test checklist, Windows setup, native helper, plugin `0.1.1`, `SHA256SUMS.txt`, and `BUILD-METADATA.txt` with `source_sha`. Verify hashes and the recorded source SHA together: app version `0.1.0` is shared with beta.1 and does not distinguish the packages. The candidate script requires an updated native Claude Code CLI, updates the existing marketplace/plugin, and verifies that plugin `0.1.1` is enabled in user scope, including its folder version when reported, before configuration. The commands were checked in CLI `2.1.294` help; the real installation test remains pending.

Launch the paired app once so it creates its connection file before configuration; it may close while configuration runs. If an MCP tool call reports the app unavailable, reopen Scribe and retry in the same Claude Code session. This recovery path is not a claim of completed human acceptance testing.

## Other operating systems

The published beta installer targets Windows only. The stdio candidate packages
for macOS and Linux have not been published or validated by a clean installation.
The Windows beta.1 app/plugin pair is incompatible with plugin 0.1.1. Use these
steps only with a future paired candidate whose app, helper, plugin, checksums,
and `BUILD-METADATA.txt` `source_sha` match. Follow your organization's policy
for unsigned software; do not disable Gatekeeper or other security controls.

### macOS DMG

Verify the DMG with `shasum -a 256 -c SHA256SUMS.txt`, open it in Finder, and
copy `Scribe.app` to Applications. Launch Scribe once from Applications to
create its private connection. The helper path for system Applications is
`/Applications/Scribe.app/Contents/MacOS/scribe-hook`. If macOS blocks the
unsigned app, stop and follow your organization's approved-software process;
this guide does not bypass Gatekeeper.

### Linux DEB

Verify the package with `sha256sum -c SHA256SUMS.txt`, install the `.deb` using
your approved package-management process, and locate the helper from the package
file list instead of assuming its installation path:

```sh
sudo apt install ./Scribe_0.1.0_amd64.deb
dpkg -L scribe | grep '/scribe-hook$'
```

Launch Scribe from the desktop application menu once to create its private
connection. Use the absolute helper path printed by `dpkg -L` below.

On macOS set `SCRIBE_HELPER` to the path above. On Debian/Ubuntu, set it to the
exact path printed by `dpkg -L`:

```sh
SCRIBE_HELPER='/absolute/path/to/scribe-hook'
test -x "$SCRIBE_HELPER"
```

### Linux AppImage

Verify the checksum, mark the file executable, and extract it into a permanent
new, empty directory owned by your account. Claude Code must be able to start the helper
even when Scribe is closed, so configure the helper path inside this persistent
extraction, never inside a temporary mounted AppImage:

```sh
chmod +x ./Scribe*.AppImage
mkdir -p "$HOME/.local/opt/scribe-candidate"
cd "$HOME/.local/opt/scribe-candidate"
/absolute/path/to/Scribe.AppImage --appimage-extract
mv squashfs-root appimage-root
find "$HOME/.local/opt/scribe-candidate/appimage-root" -name scribe-hook -print
```

Open the original AppImage from your file manager once to create its private
connection. Keep the extracted directory in place for the helper path.

Use the absolute path printed by `find` below. Type 2 AppImages support
`--appimage-extract`, which creates `squashfs-root` in the current directory;
see the [official AppImage extraction guide](https://docs.appimage.org/user-guide/run-appimages.html#extract-the-contents-of-an-appimage).

Set the variable to the path returned by `find` and confirm the helper is
executable:

```sh
SCRIBE_HELPER="$(find "$HOME/.local/opt/scribe-candidate/appimage-root" -name scribe-hook -print -quit)"
test -x "$SCRIBE_HELPER"
```

### Configure the paired plugin

After installing and launching the app once, set `SCRIBE_HELPER` to the absolute
helper path found above and use the native Claude Code CLI. First require a
successful helper capability check:

```sh
"$SCRIBE_HELPER" --mcp-check
```

Continue only when its JSON reports `name` `scribe-hook`, `version` `0.1.0`,
and `mcp_transport` `attested-stdio-v1`. This confirms the helper build can
start; it does not prove that the desktop app is running or validate a live MCP
call.

List marketplaces and update `rexia-scribe` only if it is already present:

```sh
claude plugin marketplace list --json
claude plugin marketplace update rexia-scribe
```

When that marketplace exists, install its plugin and update the user-scope
installation:

```sh
claude plugin install scribe@rexia-scribe --scope user --config "client_path=$SCRIBE_HELPER"
claude plugin update scribe@rexia-scribe --scope user
```

If it is absent, skip the marketplace update and install from the public source:

```sh
claude plugin install scribe --marketplace rexia-intel-automation/scribe --scope user --config "client_path=$SCRIBE_HELPER"
claude plugin update scribe@rexia-scribe --scope user
```

Before configuration or restarting Claude Code, inspect `claude plugin list
--json`. Require exactly one user-scope `scribe@rexia-scribe` entry at version
`0.1.1`, enabled (`enabled: true`), and `folderVersion: 0.1.1` if that field is
reported. Stop for missing, disabled, duplicate, or mismatched entries.

Set or refresh only the helper path through `--values-stdin`. Python 3 is needed
for this step to JSON-encode paths safely, including spaces and backslashes:

```sh
printf '%s\n' "$SCRIBE_HELPER" | python3 -c 'import json,sys; print(json.dumps({"client_path": sys.stdin.read().rstrip("\n")}))' | claude plugin configure scribe@rexia-scribe --values-stdin
```

The plugin stores only the helper path; the helper reads the connection from
the private profile of the current OS account. Do not copy the Scribe token.
Restart Claude Code after configuration. CLI setup on macOS and Linux, clean
package installation, and visual app behavior remain unvalidated; this guide
does not claim those manual acceptance results.

For AppImage updates, close Scribe and all Claude Code sessions first. Verify
the paired new AppImage and extract it into a new empty permanent directory.
Launch the updated AppImage once and set `SCRIBE_HELPER` to the helper in the
new extraction. Repeat the helper capability check, plugin version check, and
`plugin configure` step before restarting Claude Code. Keep the old extraction
until the new helper path is configured; then it can be removed.
