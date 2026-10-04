---
description: Open or focus the local Scribe desktop app.
disable-model-invocation: true
---

Open the Scribe app by executing the installed native `scribe-hook` executable
with the single argument `--open`. This only launches/focuses the app; it must
not grant permissions or change Claude Code settings.

Locate the executable on PATH or in the documented installation locations:
- Windows: `%LOCALAPPDATA%\Scribe\scribe-hook.exe`.
- macOS: `/Applications/Scribe.app/Contents/MacOS/scribe-hook` or the same
  bundle under `~/Applications`.
- Linux: `~/.local/bin/scribe-hook` or `/usr/bin/scribe-hook`.

Use the platform's normal shell tool and pass the executable path as one quoted
argument. Do not interpolate user-provided command text, evaluate file contents,
search private directories, read tokens/configuration files or install software.
Do not use an MCP question or report as a substitute for opening the app.

If the executable is missing or reports that it cannot open Scribe, explain
that the desktop app must be installed, and link to
https://rexia-intel-automation.github.io/scribe/installation .
Do not claim success unless the executable succeeded. If another command owns
the bare `/scribe` alias, the unambiguous command is `/scribe:scribe`.
