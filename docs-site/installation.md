# Installation

## Published beta.1: Windows evaluation only

`v0.1.0-beta.1` is an unsigned Windows prerelease for IT evaluation, not an accepted final release. It pairs the app and native helper with plugin `0.1.0`, which uses the local HTTP connection. The current marketplace branch is plugin `0.1.1` over stdio and is incompatible with beta.1. The app still reports version `0.1.0`, so that number alone cannot identify the pairing.

The [beta release page](https://github.com/rexia-intel-automation/scribe/releases/tag/v0.1.0-beta.1) retains its original setup executable, script, checksums, and test checklist. Those instructions apply only when the installed plugin is the matching beta.1-tag version and the beta app is open. Do not use the current repository setup script or refresh the marketplace to its current branch with the beta.1 app. A fresh setup with a matching marketplace source is not documented here.

If you are checking an existing, correctly paired beta.1 installation, verify each downloaded file against the release's `SHA256SUMS` before use. The installer is unsigned; follow your organization's policy if Windows or security software warns you. The original setup script requires native `claude.exe` on `PATH`; npm `.cmd` shims are not supported. Its original PowerShell command was:

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
