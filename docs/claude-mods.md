# Claude Mods e aplicações no Scribe

Claude Mods permite que plugins observem e alterem eventos internos do Claude Code por funções JavaScript ou TypeScript. Para o Scribe, a aplicação mais promissora é uma integração opcional que acrescente contexto da sessão e mostre decisões pendentes dentro do terminal. A v0.1 continua usando hooks nativos e MCP. [Documentação oficial](https://code.claude.com/docs/en/plugins/mods/overview).

O recurso aparece nas notas da versão 2.1.287. A instalação local consultada em 7 de outubro de 2026 é a 2.1.293. Mods vêm ligados por padrão no CLI a partir da 2.1.287 e no Code tab do Desktop a partir da 2.1.286. O comando literal `/mods` não aparece nas fontes consultadas; a gestão documentada é `/plugin`, na aba Installed, e `/reload-plugins` para recarregar uma sessão aberta. [Release 2.1.287](https://github.com/anthropics/claude-code/releases/tag/v2.1.287) e [gestão de Mods](https://code.claude.com/docs/en/plugins/mods/overview#see-which-mods-a-session-loaded).

## Aplicações possíveis

| Aplicação proposta | Base confirmada | Verificação necessária |
| --- | --- | --- |
| Mostrar estado e decisões do Scribe no terminal | O mod `diff` fornece uma UI lateral e registra comandos. | Uma ponte local autenticada e comportamento quando o app estiver fechado. |
| Associar eventos à sessão certa | `diff` consulta `$.session.id()`. | Correspondência desse ID com os hooks atuais e ausência de confusão entre sessões concorrentes. |
| Acrescentar contexto ao pedido de permissão | `sec-default` participa de `tool.check` e inspeciona a decisão do próximo hook. | Preservar regras de negação e exigir gesto humano; observar não deve se transformar em aprovação automática. |

Exemplos oficiais: [diff](https://github.com/anthropics/claude-code/blob/main/mods/diff/hooks/register.ts) e [sec-default](https://github.com/anthropics/claude-code/blob/main/mods/sec-default/hooks/register.ts). Esses exemplos não comprovam que os eventos resolvam a ausência de `tool_use_id` no PermissionRequest, nem vinculam automaticamente uma chamada MCP à sessão correta.

A API documenta `$.http.fetch`, processos, UI e eventos de sessão. Uma ponte local com o Scribe ainda precisa validar autenticação e falhas. Mods têm os privilégios do usuário e podem alterar decisões de ferramenta; não redesenham o prompt nativo de permissão. O primeiro experimento proposto deve apenas observar eventos e mostrar estado. Nenhum mod foi instalado ou ativado nesta investigação. [API](https://code.claude.com/docs/en/plugins/mods/api) e [políticas administradas](https://code.claude.com/docs/en/plugins/mods/admin).

## Direção do produto

O usuário definiu o Scribe como interface amigável para aproveitar o PowerShell, com expansão futura para OpenCode e Codex. Mods pode complementar a integração específica com Claude Code. Os futuros harness precisarão de contratos próprios para eventos, identidade de sessão e respostas humanas.

A sequência proposta é concluir a v0.1, experimentar um mod apenas de observação e UI e então avaliar respostas humanas com os mesmos testes de autenticação, concorrência e falha do caminho nativo. A execução guiada de PowerShell e os adaptadores para outros harness pertencem ao planejamento posterior; não foram implementados nesta pesquisa.
