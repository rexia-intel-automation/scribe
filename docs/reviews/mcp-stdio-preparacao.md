# MCP via stdio — revisão WIP e preparação de ensaio

Autor: Claude Code, sessão `scribe-c9 [1b6021]`, Opus 5.5. Data: 2026-10-08.
Escopo: delta local NÃO commitado na branch `codex/mcp-native` (HEAD `df526d1`),
lido no working tree às 10:00 -03:00. Método: leitura estática. Nada foi
compilado, instalado ou executado. Isto é revisão de trabalho em andamento, não
veredito de PR.

Arquivos lidos: `plugins/scribe/.mcp.json`, `plugins/scribe/.claude-plugin/plugin.json`,
`plugins/scribe/hooks/hooks.json`, `scripts/configure-claude-plugin.ps1`,
`README.md`, `README.pt-BR.md`, `scripts/verification/mcp-stdio-config.test.mjs`,
`app/hook-protocol/mcp-tools.json`, `app/hook-protocol/src/lib.rs`,
`app/src-tauri/src/mcp.rs`, e para comparação `ef829f8:app/hook-client/src/main.rs`
e `desktop.rs` (beta.1).

## 1. Achados da revisão WIP

### W-01 · ALTO · O script não detecta app/helper do beta.1

`scripts/configure-claude-plugin.ps1` (bloco de validação do `connection.json`)
trata `hook_key` ausente ou igual ao `token` como "conexão desatualizada". Mas o
beta.1 já grava `hook_key` independente: `ef829f8:app/src-tauri/src/desktop.rs:181-194`
gera a chave e exige `hook_key != token`. Então, com o app e o helper do beta.1
instalados, o script passa, configura o plugin novo e termina com sucesso.

Consequência: o Claude Code inicia `scribe-hook.exe --mcp` com o helper do beta.1.
Esse helper, em `ef829f8:app/hook-client/src/main.rs:484-486`, sai com código 0
e sem saída para qualquer argumento que não seja `--hook <evento>` ou `--open`.
O servidor MCP falha no `initialize` sem mensagem. O usuário vê "failed" no
`/mcp` e nenhuma pista. Os hooks continuam funcionando, o que mascara o problema.

Correção sugerida: o script verificar a capacidade do helper, não o formato da
conexão. Por exemplo, `scribe-hook.exe --version` (ou `--mcp-check`), que o helper
novo responde com versão e protocolo MCP e o antigo não responde (sai 0 sem
stdout). Saída vazia significa helper desatualizado, e a mensagem
"Update Scribe…" passa a ser verdadeira. Teste: helper falso que sai 0 sem stdout
precisa gerar falha nessa etapa.

### W-02 · ALTO · Plugin e app não sobem juntos (o marketplace segue o `main`)

O marketplace `rexia-scribe` aponta para `./plugins/scribe` no repositório. O
plugin muda quando o `main` muda e quando o usuário atualiza o marketplace,
independente da versão do app instalada. Há duas janelas de incompatibilidade:

- **Plugin novo com app/helper beta.1:** o MCP quebra calado, como em W-01, mesmo
  sem rodar o script, só por atualizar o marketplace.
- **Plugin antigo (HTTP + Bearer) com app novo:** depende de o app novo manter
  `/mcp` com Bearer. Se mantiver, o F-01 continua aberto para quem não atualizou
  o plugin. Se remover, o plugin antigo quebra.

Correção sugerida: (a) decidir e documentar a política de `/mcp` HTTP no app novo
(janela de transição com prazo, ou remoção junto com a release); (b) subir a
`version` do `plugin.json` e citar a versão mínima do app no README; (c) o helper
novo, ao receber um `initialize` com app incompatível ou ausente, responder
normalmente e devolver um erro explícito de ferramenta no `tools/call`, que é o
desenho escolhido. O caso que continua sem saída é o helper ANTIGO com o plugin
novo, e só (a) e (b) o mitigam.

### W-03 · MÉDIO · Valores antigos `port`/`token` ficam salvos

`plugin.json` remove `port` e `token` do `userConfig`, e o script passa a
configurar só `client_path`. Nada remove os valores que o beta.1 gravou. O `token`
era `sensitive`, então fica no armazenamento seguro do Claude Code, órfão.
O README diz que ele "deixa de ser usado", o que é correto mas incompleto.

Correção sugerida: verificar se `claude plugin configure` aceita remover chaves
(`[A VERIFICAR]` na CLI). Se aceitar, o script remove. Se não, o README diz como
apagar à mão. Não é vazamento: o token continua sendo do usuário. Mas um Bearer
válido guardado sem uso é superfície desnecessária.

### W-04 · MÉDIO · O teste de config é só textual

`scripts/verification/mcp-stdio-config.test.mjs:25-36` aplica regex sobre o
código-fonte do `.ps1`. Isso não prova o comportamento do script, e as rodadas
anteriores mostraram que ele já falhou no 5.1 e no 7 por motivos que a leitura
não pegaria. Faltam execuções com `claude.exe` falso no PATH e
`LOCALAPPDATA`/`APPDATA` temporários, cobrindo: conexão válida; `hook_key`
ausente; helper antigo (W-01); caminho com espaço; e segunda execução
(idempotência), conferindo os argumentos recebidos pela CLI falsa e que nenhum
deles contém `token` ou `hook_key`.

### W-05 · BAIXO · O teste dos READMEs depende da quebra de linha

`mcp-stdio-config.test.mjs:45-46` casa o texto com `\n` no meio da frase. Basta
reformatar o parágrafo para o teste quebrar sem mudança de conteúdo. Sugestão:
normalizar espaços (`.replace(/\s+/g, ' ')`) antes do `match`.

### W-06 · BAIXO · Ordem da lista no teste de drift

`app/src-tauri/src/mcp.rs` (teste novo) compara `tool_router().list_all()`
com o JSON fixo por igualdade de `Value`. Se `list_all` não garante ordem
estável, o teste pode oscilar. Sugestão: ordenar as duas listas por `name` antes
de comparar, ou confirmar no código do rmcp 3.5.0 que a ordem é determinística.
O desenho (uma só fonte em `hook-protocol`, `include_str!` no helper e teste no
app) está certo.

### W-07 · BAIXO · O `initialize` local tem de imitar o do app

Se o helper responde `initialize` localmente, `protocolVersion`, `capabilities`
e `serverInfo` precisam coincidir com o que o app anunciaria. Sugestão: estender
o teste de drift a esses três campos, e não só às ferramentas.

### Pontos conferidos sem achado

- `.mcp.json`: `type: stdio`, `command` interpolado, `args: ["--mcp"]`, sem URL,
  header ou Bearer. É o mesmo padrão que `hooks.json` já usa com sucesso para os
  hooks, inclusive com caminho com espaço, sem shell.
- O script não chama `Invoke-WebRequest`/`Invoke-RestMethod`, não imprime a saída
  da CLI e zera `$connection` e `$connectionText` no `finally`.
- O `README` explica a migração nas duas línguas e diz que as chamadas ainda
  exigem o app aberto.

## 2. Checklist de ensaio em sessão real (executar só no candidato pactuado)

Pré-condições: candidato com SHA e hash do NSIS publicados no fórum; TRAVA da
instalação real e da config do Claude Code registrada no `AGENTS.md`; backup do
perfil e da config; `connection.json`, histórico e token preservados; nada
copiado para mensagens ou logs.

| # | Passo | Evidência esperada |
| --- | --- | --- |
| 1 | Instalar o candidato por cima do beta.1 (upgrade pareado app + helper) e rodar o script de configuração | Script sai 0; hashes do app e do helper iguais aos publicados; histórico preservado |
| 2 | Repetir o script | Mesmo resultado, nenhuma mudança extra (idempotência) |
| 3 | Fechar o app pela bandeja. Abrir sessão nova do Claude Code | `/mcp` mostra `scribe` conectado; `tools/list` traz `scribe_ask` e `scribe_report` |
| 4 | Com o app fechado, pedir ao modelo um `scribe_report` | Erro explícito da ferramenta ("app indisponível"); o servidor continua conectado |
| 5 | Abrir o app pelo atalho do Iniciar (fora do pacote MSIX) e repetir o report na mesma sessão | Report chega no app sem reiniciar a sessão |
| 6 | `scribe_ask` pendente e, em paralelo, um `scribe_report` | O report chega enquanto a pergunta espera |
| 7 | Responder a pergunta no app | A resposta volta ao modelo com a opção escolhida |
| 8 | Nova `scribe_ask` e Esc no Claude Code (cancelamento) | A pergunta some ou expira no app; o socket fecha; nenhuma resposta fantasma depois |
| 9 | Encerrar a sessão com a pergunta pendente (EOF no stdin) | O helper sai; nenhum processo `scribe-hook` órfão no Gerenciador de Tarefas |
| 10 | Helper novo com app antigo (só em perfil isolado, se houver build antigo disponível) | Erro explícito de incompatibilidade, não silêncio |
| 11 | Plugin novo com helper do beta.1 (perfil isolado) | Registrar o comportamento real; hoje a leitura prevê falha silenciosa (W-01) |
| 12 | Ler o log do servidor MCP do Claude Code | stdout só com JSON-RPC; stderr sem pergunta, resposta, report, token ou `hook_key` |
| 13 | Observar a tela durante a abertura da sessão e as chamadas | Nenhuma janela de console extra no Windows |
| 14 | Restaurar o backup da config, se o ensaio for descartável, e registrar LIBERADO | Config igual ao backup; trava liberada no `AGENTS.md` |

Itens 4, 8, 9, 12 e 13 também valem em CI com testes sintéticos. Na sessão real,
eles comprovam o caminho do Claude Code. Este checklist não substitui o ensaio
humano do Mohamad nem o aceite de fase.

## 3. Resultados do ensaio real — rodada 1 (2026-10-08, 13:36–13:55 -03:00)

Executor: Claude Code `scribe-c9 [1b6021]`, Opus 5.5, na máquina do Mohamad, sob a TRAVA
registrada no `AGENTS.md`. Pacote: Release workflow_dispatch 37805721657 do `main`
`7dfaec7` (setup `19C941E9…`, script `3B082F3A…`, guia `E4D75C3F…`; `sha256sum -c`
OK nos 10 arquivos; `BUILD-METADATA` com source_sha 7dfaec7 e plugin_version 0.1.1).
Claude Code 2.1.294. Backup íntegro e privado em
`%LOCALAPPDATA%\scribe-ensaio-backup-20261008-7dfaec7`.

| # | Passo | Resultado |
| --- | --- | --- |
| 1 | Upgrade NSIS `/S` por cima do beta.1 | PASSOU: exit 0 em 2 s; perfil intacto (connection.json, preferences.json, state.db); `--mcp-check` → `attested-stdio-v1` |
| 1b | Script de configuração | PASSOU num PS 5.1 aberto pelo Explorer (Utility 3.1.0.0) e também no 5.1 e no 7 a partir do Bash. Falhou só dentro da ferramenta PowerShell do harness do agente ("stdin isn't a JSON object of strings"), com bytes idênticos aos que funcionam: artefato do ambiente do agente, não do produto |
| 2 | Segunda execução | PASSOU: idempotente; `plugin update` → "already at the latest version (0.1.1)", exit 0 |
| — | `plugin list --json` depois | version 0.1.1, folderVersion 0.1.1, scope user, enabled |
| 3 | `tools/list` no Claude Code real | **FALHOU (bloqueante)**: `claude mcp list` → "Connected · tools fetch failed — Invalid result for tools/list" (exige `ttlMs` número e `cacheScope` "public"/"private"). O helper responde só `tools` com o protocolo 2025-11-25. Os outros servidores stdio da máquina passam |
| 4–9, 12 | Chamadas `scribe_report`/`scribe_ask`, concorrência, cancelamento, EOF, stderr | BLOQUEADOS pelo passo 3 (as ferramentas não ficam disponíveis no Claude Code) |
| 10–11 | Helper e app incompatíveis | NÃO EXECUTADO |
| 13 | Janela extra no Windows | PENDENTE HUMANO |
| 14 | Restaurar ou liberar | Instalação mantida no candidato (os hooks operam); TRAVA mantida até a correção do passo 3 |

Extra: o app abriu pelo Iniciar (PID 8520, 127.0.0.1:7717) e o `/v1/health` sem token
deu 401. O `scribe-hook.exe.bak-main` (cópia minha de 2026-10-07 22:57) continua na
pasta de instalação; o NSIS não o remove.

## 4. Resultados do ensaio real — rodada 2 (2026-10-08, ~15:08–15:14 -03:00; relatado às 18:14Z)

Pacote: Windows do Release run 37818887638, `main` `b0f9bbf` (setup `7F86FE5B…`,
`sha256sum -c` OK, `source_sha` b0f9bbf). Plugin, script e guia iguais ao `7dfaec7`;
o espelho do plugin é igual ao do b0f. Mesma TRAVA e mesmo backup da rodada 1.

| Passo | Resultado |
| --- | --- |
| Upgrade NSIS `/S` (app fechado antes) | PASSOU: exit 0; perfil intacto; `--mcp-check` com `attested-stdio-v1`; app pelo Iniciar, PID 11052, :7717 |
| `claude mcp list` real | PASSOU: `plugin:scribe:scribe … ✔ Connected`, sem "tools fetch failed" (corrige a rodada 1) |
| Hooks no app | PASSOU: a tabela `sessions` traz a sessão do `claude -p` e a sessão do agente (consulta read-only só de id e last_event_at) |
| `scribe_report` via `claude -p`, com app aberto e session_id correto | **FALHOU (bloqueante)**: "Scribe is unavailable or incompatible…". O debug do Claude mostra `negotiatedProtocolVersion: 2026-07-28` ("modern") |
| Reprodução direta no helper | Legado (initialize 2025-11-25 ou 2025-06-18) + tools/call → `{"ok":true}`. Moderno (sem initialize, `_meta` 2026-07-28 + clientCapabilities) → tools/list OK, tools/call com isError e a mensagem genérica |
| H3–H5 (ask, concorrência, cancelamento, EOF) | BLOQUEADOS pela falha acima |

Causa provável, lida na fonte do rmcp 3.5.0: no modo inline, o helper repassa ao app o
cabeçalho `mcp-protocol-version: 2026-07-28` sem o `_meta` obrigatório. O app responde
`invalid_params`, e o helper troca o erro pela mensagem genérica.

## 5. Resultados do ensaio real — rodada 3 (2026-10-08, ~15:38–15:43 -03:00; relatado às 18:43Z)

Pacote: build LOCAL do Codex no `f38e0ba` (PR35 sobre PR34), setup `6C36D751…`,
`sha256sum -c` OK, `source_sha` f38e0ba. Não é artefato do CI. Plugin, script e guia
iguais ao b0f.

| Passo | Resultado |
| --- | --- |
| Upgrade NSIS `/S` | PASSOU: exit 0; perfil intacto; app pelo Iniciar, PID 1688, :7717 |
| `claude mcp list` | PASSOU: ✔ Connected |
| `scribe_report` via `claude -p` | **FALHOU (bloqueante)**: "missing required resultType — servers implementing protocol revision 2026-07-28 MUST include it". A chamada já atravessa o salto privado: a correção do PR35 vale |
| Reprodução direta (moderna) | Sucesso → resultado SEM `resultType`; erro montado localmente → COM `resultType: complete` |

Causa: o helper repassa o resultado do app, que vem do salto legado e não tem
`resultType`. Só o caminho de erro, montado localmente, inclui o campo.

## 6. Resultados do ensaio real — rodada 4 (2026-10-08, ~16:05–16:11 -03:00; relatado às 19:11Z)

Pacote: build LOCAL do Codex no `b268a38` (PR35 corrigido), setup `1C9DACE5…`,
`sha256sum -c` OK, `source_sha` b268a38. Não é artefato do CI. Plugin, script e guia
iguais ao f38/b0f. Cliente: Claude Code 2.1.294 real, em sessões `claude -p` desta
máquina.

| # | Passo | Resultado |
| --- | --- | --- |
| 1 | Upgrade NSIS `/S` | PASSOU: exit 0; perfil intacto; app pelo Iniciar, PID 24544, :7717 |
| 3 | `claude mcp list` | PASSOU: ✔ Connected |
| 4a | `scribe_report` com o app aberto | **PASSOU**: `{"ok":true}`; o session_id veio de `CLAUDE_CODE_SESSION_ID` |
| 4b | `scribe_report` com o app FECHADO | PASSOU: erro explícito "Scribe is unavailable… No answer or consent was supplied."; `mcp list` continua ✔ Connected |
| 5 | App reaberto pelo Iniciar, nova chamada | PASSOU: `{"ok":true}`. É sessão nova; a recuperação na MESMA sessão interativa fica para o passo humano |
| 9 | Processos órfãos depois das sessões | PASSOU: nenhum `scribe-hook.exe` restante |
| 6–8 | `scribe_ask` respondido na UI, ask + report concorrente, Esc/cancelamento | PENDENTE HUMANO: precisa de clique na UI ou de tecla na sessão interativa |
| 12–13 | stderr sem dados; nenhuma janela extra | stderr: os logs de debug do Claude da rodada 2 só mostram a mensagem genérica; janela: PENDENTE HUMANO |

Conclusão: o caminho MCP de ponta a ponta funciona no cliente real com o pacote b268,
com os três bloqueios das rodadas 1 a 3 corrigidos (tools/list, protocolo moderno,
resultType). Sobram os passos humanos e a confirmação no artefato oficial do CI.

## 7. Resultados do ensaio real — rodada 5, artefato OFICIAL do CI (2026-10-08, ~16:25–16:33 -03:00; relatado às 19:33Z)

Pacote: artefato `scribe-distribution-preview-windows-d40079421bc315cc5e70dcfdc562d123c10ede39`
do run 37828609230 (preview do CI, ainda não é release). Setup `0875C65F…`, `sha256sum -c` OK,
`source_sha` d400794 (merge sintético do GitHub). Conferido por git: a tree do d400794 é
IDÊNTICA à do b268a38 (`49adc764…`). Plugin pareado b268 instalado. Cliente: Claude Code
2.1.294 real.

| Passo | Resultado |
| --- | --- |
| Upgrade NSIS `/S` | PASSOU: exit 0, perfil intacto, app pelo Iniciar (PID 19184, :7717) |
| `claude mcp list` | PASSOU: ✔ Connected |
| `scribe_report` com o app aberto | PASSOU: `{"ok":true}` |
| `scribe_report` com o app fechado | PASSOU: erro explícito, servidor continua ✔ Connected |
| App reaberto + chamada | PASSOU: `{"ok":true}` |
| `scribe-hook.exe` órfãos | PASSOU: 0 |

### Roteiro humano curto (Mohamad, ~10 min, na instalação atual)

1. Abra o Scribe pelo menu Iniciar. Num terminal novo, rode `claude` (sessão interativa).
2. Digite `/mcp`: o servidor `scribe` deve aparecer conectado, com `scribe_ask` e `scribe_report`.
3. Peça: "use o scribe_ask para me perguntar se posso continuar, com as opções Sim e Não".
   Responda no Scribe. A resposta escolhida tem de voltar ao Claude.
4. Peça outra `scribe_ask` e, com ela pendente, peça também "registre um progresso com
   scribe_report". O report aparece no Scribe enquanto a pergunta espera.
5. Com uma `scribe_ask` pendente, aperte Esc no terminal. O cartão some ou expira no
   Scribe e nada é respondido depois.
6. Feche o Scribe pela bandeja e, NA MESMA sessão, peça um `scribe_report`: deve vir
   erro de indisponível. Reabra o Scribe pelo Iniciar e peça de novo: deve funcionar
   sem reiniciar o Claude.
7. Durante tudo isso, observe: nenhuma janela de console extra; a sessão e os passos
   aparecem no Scribe; se surgir uma notificação do Windows, clique e confira se ela
   traz o Scribe com o cartão.
Anote só passo, esperado e obtido. Não copie tokens nem o conteúdo de `%APPDATA%\com.rexia.scribe`.

> Nota de registro (2026-10-08 16:40 -03:00, relógio do sistema): os horários das seções 4 a 7 foram corrigidos a partir dos carimbos UTC do `Claude.jsonl`. A primeira versão trazia horários estimados e adiantados pelo agente. Os resultados não mudam.

## 8. Ensaio real da migração do histórico (F-12), 2026-10-08 ~18:24–18:26 -03:00 (relógio do sistema)

Pacote: artefato OFICIAL do CI Distribution 37838077210, source `39d22bf` (merge
checkout). A tree do 39d22bf é idêntica à do `main` f467292 (`89956817…`), que já tem o
PR36. Setup `0c736c86…`, `sha256sum -c` OK. Não inclui o PR39. Backup novo, privado
(ACL só do usuário + SYSTEM), feito ANTES em `%LOCALAPPDATA%\scribe-ensaio-backup-f12-20261008-1824`,
com MANIFEST.sha256. O app foi fechado antes da instalação.

| Passo | Resultado |
| --- | --- |
| Antes | Roaming: `connection.json`, `preferences.json`, `history\state.db` (57.344 B). Local: só o cache do WebView2 (`EBWebView`), sem histórico. DB: 13 sessões, 2 decisões, hash dos ids `428872667aa0` |
| Upgrade NSIS `/S` + abrir pelo Iniciar | PASSOU: exit 0; app PID 11628, :7717 |
| Migração | PASSOU: o `history` saiu do Roaming (só ficaram `connection.json` e `preferences.json`); `%LOCALAPPDATA%\com.rexia.scribe\history\state.db` (57.344 B) mais marcador e recibo `.scribe-history-*`; sem tombstone nem cópia de conflito |
| Integridade | PASSOU: 13 sessões, 2 decisões e hash dos ids `428872667aa0` idênticos aos de antes |
| Escrita depois da migração | PASSOU: `scribe_report` real `{"ok":true}`; o DB Local foi para 14 sessões; o Roaming não ganhou `history` novo |
| Reinício | PASSOU: o app reabre (PID 20684, :7717), sem nova migração e com o mesmo estado nos dois perfis |
| Aviso na UI | PENDENTE HUMANO (o caminho feliz não deve mostrar aviso) |

Não foi exercitado: perfil Roaming corporativo real ou SMB, conflito com o histórico voltando
e falha de limpeza. Esses casos estão cobertos só pelos testes automatizados do PR36.
