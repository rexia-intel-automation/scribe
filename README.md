# Scribe

Local desktop companion for Claude Code sessions and human decisions.

[Português brasileiro](README.pt-BR.md)

**Development status:** Phase 0 approved; Phase 1 plugin and native observer
under review. No desktop release is available yet. The native client currently
observes events only; permission decisions are not implemented.

The repository is the `rexia-scribe` marketplace. The configuration-only plugin
is in `plugins/scribe`. The desktop installer will include the Rust hook client;
users will not need a separate Node installation. The first release will show
sessions and let a human answer permission requests and short questions locally.

See [the verified plan](docs/plano-v0.1.md), [Phase 0](docs/fase-0.md) and
[Phase 1 verification](docs/fase-1.md). Do not configure the plugin in daily
sessions until the desktop app and decision flows have passed their gates.

MIT © 2026 RexIA Tecnologia e Automação Digital LTDA.

Independent open-source project by RexIA. Not affiliated with Anthropic.
Claude and Claude Code are trademarks of Anthropic, cited only to describe
compatibility.
