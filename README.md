# Scribe

Local desktop companion for Claude Code sessions and human decisions.

[Português brasileiro](README.pt-BR.md)

**Development status:** Phases 0, 1 and 2 approved; Phase 3 desktop UI is in verification.
No desktop release is available yet. Allowing, denying and answering questions
in the window are implemented and verified with real Claude Code on Windows.
See [decision verification](docs/fase-4.md) for evidence and local-build limitations.

The repository is the `rexia-scribe` marketplace. The configuration-only plugin
is in `plugins/scribe`. The desktop installer will include the Rust hook client;
users will not need a separate Node installation. The first release will show
sessions and let a human answer permission requests and short questions locally.

See [the verified plan](docs/plano-v0.1.md), [Phase 0](docs/fase-0.md) and
[Phase 1 verification](docs/fase-1.md), [local server verification](docs/fase-2.md)
and [desktop verification](docs/fase-3.md). Do not configure the plugin in daily
sessions until the desktop app and decision flows have passed their gates.

MIT © 2026 RexIA Tecnologia e Automação Digital LTDA.

Independent open-source project by RexIA. Not affiliated with Anthropic.
Claude and Claude Code are trademarks of Anthropic, cited only to describe
compatibility.
