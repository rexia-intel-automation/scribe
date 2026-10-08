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
