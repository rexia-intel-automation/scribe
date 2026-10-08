# Fase 4: rodada 3 (revisão adversarial do Claude Code)

- Data: 2026-10-08.
- Revisor: Claude Code (Opus), leitura direta do delta.
- Alvo: PR #6, delta `9c02948..fbf13d5`: `c53229c` (correções) mais o merge
  documental do PR #5.
- Escopo: os achados R2-1 a R2-8 da rodada 2. Ficam fora o lote de
  funcionalidades (AskUserQuestion, ExitPlanMode, autorização por sessão ou
  permanente, setMode, `session_title`, cor e nome, notificações) e o P8.
- Review: https://github.com/rexia-intel-automation/scribe/pull/6#pullrequestreview-5450996097
- **Veredito: APROVADA no escopo de segurança**, condicionada ao CI verde nas três
  plataformas. Não aprova a Fase 4 inteira: o lote de funcionalidades terá rodada própria.

## Notas (rodada parcial: G, H e I não avaliadas)

| Área (mín.) | Nota | Evidência |
| --- | --- | --- |
| A (9) | 9 | Contrato de saída inalterado. A correlação por `tool_key` se mantém. |
| B (9) | 9 | Alvo inteiro e visível (`style.css:208-215`, `pre-wrap`). A aprovação só vale quando todos os campos são conhecidos (`decisions.rs:104-150`). |
| C (9) | 9 | Hooks só com HMAC (`server.rs:249-252`). Balde próprio para o challenge, e o limite global só conta depois da autenticação. `\p{Cf}` rejeitado. |
| D (9) | 9 | Tudo o que não pode ser verificado vai para o terminal. Reinício no Unix corrigido (`9c02948`). |
| E (8) | 8 | A lista de esquemas por ferramenta é explícita e comentada. A regex continua fixa no código. |
| F (9) | 9 | +164 linhas em `core.rs` (inclui Bearer-only sem efeito), +75 em `decisions.rs` (chave extra, truncamento) e um Playwright de alvo longo. |
| J (8) | 8 | `fase-4.md` registra o gate de esquema e os limites. |

## Status da rodada 2

| Id | Estado | Evidência |
| --- | --- | --- |
| R2-4 | corrigido | `pre-wrap` + `overflow-wrap: anywhere`; acima de 8000 caracteres, `display != raw` faz `can_allow=false`. |
| R2-5 | corrigido | Só Bash, Read, Glob e Grep, com todos os campos escalares e conhecidos. Com mais de um campo, o cartão mostra o JSON inteiro e o `RISK` vale sobre tudo. Write, Edit, MCP e ferramentas desconhecidas vão para o terminal. |
| R2-1 | parcial | Balde de 256/s só para o challenge. Uma página web ainda pode esgotá-lo (o Scribe só cai para o terminal). Falta rejeitar `Sec-Fetch-*`. |
| R2-2 | corrigido para hooks | Todo POST `/v1/hooks/*` exige HMAC. O Bearer do MCP continua no escopo do P8. |
| R2-3 | aberto (baixo) | Um nonce consumido ainda pode ser registrado de novo. |
| R2-6 | corrigido | `ambiguous_text` cobre Cc e Cf, inclusive em perguntas e opções. |
| R2-7 | corrigido | `9c02948`. |
| R2-8 | aberto (baixo) | Lacunas da regex de risco. |

## Problemas novos

- **R3-1 · média · não bloqueia, mas importante para o uso no Windows.** A
  ferramenta `PowerShell` não está na lista de esquemas aprováveis, então todo
  pedido de PowerShell vai para o terminal. O autor aceitou incluir o mesmo
  esquema do Bash num delta separado, com teste.
- **R3-2 · baixa.** Com um alvo longo fora da área visível, a tecla A ainda
  permite sem rolar até o fim. Sugestão: exigir que o fim do alvo tenha ficado
  visível uma vez.

## Tentativas de quebra

1. Esconder um campo extra num Bash (`{"command":"ls","sql":"DROP…"}`): **falhou**. A chave desconhecida torna o pedido incompleto e o manda para o terminal.
2. Alvo longo cortado na tela: **falhou**. O texto quebra linha; acima de 8000 caracteres não dá para aprovar.
3. POST de hook só com Bearer: **falhou**. Exige HMAC, e o teste confirma que não cancela o pedido real.
4. Inundar o challenge para bloquear hooks legítimos: **parcial**. O limite global fica protegido, mas o balde do challenge ainda pode ser esgotado (R2-1).
5. Caractere bidi (U+202E) no comando: **falhou**. É rejeitado por `\p{Cf}`.
6. Valor não escalar (objeto ou array) num campo permitido: **falhou**. O pedido fica incompleto.
