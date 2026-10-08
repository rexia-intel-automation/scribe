# Installation

## Published beta: Windows only

The published `v0.1.0-beta.1` is a prerelease for IT evaluation, not the final release. Do not treat features being developed in open pull requests as part of this package. Native question and plan flows still need a fresh interactive-session test.

1. Download the setup executable, `configure-claude-plugin.ps1`, `SHA256SUMS`, and the test checklist from the [beta release](https://github.com/rexia-intel-automation/scribe/releases/tag/v0.1.0-beta.1).
2. Verify the downloaded files against their matching entries in `SHA256SUMS` before running them.
3. Install the setup executable for the current Windows user. The installer is unsigned; follow your organization’s policy if Windows or security software warns you.
4. Open Scribe from the Start menu and leave it running.
5. Run the configuration script in a normal PowerShell 5.1 or 7 window, then close Claude Code sessions and start a fresh interactive session.

The script requires the native `claude.exe` on `PATH`; npm `.cmd` shims are not supported in this beta. Follow the downloaded checklist. The script intentionally withholds Claude CLI output; if it fails, record the stage and exit code without sharing tokens or private profile contents.

From the download folder, check the installer hash and compare it with the corresponding `SHA256SUMS` entry:

```powershell
Get-FileHash -Algorithm SHA256 -LiteralPath .\Scribe_0.1.0_x64-setup.exe
```

With the installed app open, configure the plugin in a normal PowerShell window:

```powershell
powershell.exe -NoProfile -File .\configure-claude-plugin.ps1
```

In PowerShell 7, use `pwsh -NoProfile -File .\configure-claude-plugin.ps1`. If execution policy blocks the unsigned script, follow the reviewed procedure in the downloaded README and your organization’s policy.

## Other operating systems

The published beta installer and its documented onboarding target Windows. This site does not claim a ready macOS or Linux installer.
