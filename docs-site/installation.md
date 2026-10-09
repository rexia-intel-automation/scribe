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

The published beta installer targets Windows only. This site does not claim a ready macOS or Linux installer.
