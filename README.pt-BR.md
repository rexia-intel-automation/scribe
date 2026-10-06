# Scribe

App local para acompanhar sessões do Claude Code e decisões humanas.

[English](README.md)

**Estado:** Fases 0, 1 e 2 aprovadas; a interface desktop da Fase 3 está em verificação.
Ainda não há release do app desktop. O cliente nativo somente observa eventos;
decisões de permissão ainda não foram implementadas.

O repositório é o marketplace `rexia-scribe`. O plugin de configuração e texto
está em `plugins/scribe`. O instalador incluirá o cliente de hooks Rust, sem
exigir Node separado. A primeira versão mostrará sessões e permitirá ao humano
responder permissões e perguntas curtas localmente.

Consulte [o plano verificável](docs/plano-v0.1.md), [a Fase 0](docs/fase-0.md) e
[a verificação da Fase 1](docs/fase-1.md), [do servidor local](docs/fase-2.md)
e [da janela desktop](docs/fase-3.md).
Configure o plugin nas sessões diárias
quando o app e os fluxos de decisão tiverem passado pelas respectivas catracas.

MIT © 2026 RexIA Tecnologia e Automação Digital LTDA.

Projeto independente de código aberto da RexIA. Sem afiliação com a Anthropic.
Claude e Claude Code são marcas da Anthropic, citadas apenas para descrever
compatibilidade.
