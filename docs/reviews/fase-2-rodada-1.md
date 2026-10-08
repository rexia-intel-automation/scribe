# Fase 2 — revisão adversarial independente, rodada 1

Data: 2026-10-04, horário local; execução do CI terminou em 2026-10-05 UTC.
Commit congelado: `44c7895d7f110a30f7b61f7aeaa418ad3ebd41c7`.
Diff examinado: `main..44c7895d7f110a30f7b61f7aeaa418ad3ebd41c7`.
PR: [#4](https://github.com/rexia-intel-automation/scribe/pull/4).

**Veredito: REPROVADA.** Há dois problemas altos de higienização e três
problemas médios reproduzidos. B, C, D e F não atingem a catraca. CI verde
foi confirmado, mas não elimina as falhas dos testes adversariais adicionais.

## Escopo e independência

Revisor sem participação na implementação. `prompt.md` foi lido integralmente;
somente o diff, testes e artefatos da Fase 2 receberam avaliação. As fases
anteriores são consideradas aprovadas. Janela, decisões humanas, instaladores
e release não receberam crédito nem foram cobrados como entregas desta fase.
`PermissionRequest` com resposta vazia e `scribe_ask` indisponível são coerentes
com o limite documentado desta etapa.

Todos os builds e testes executaram em `D:\RexIA\projetos\scribe`, usando
`C:\Program Files\PowerShell\7\pwsh.exe` e
`C:\Users\engmo\.cargo\bin\cargo.exe`. SHA-256 do Cargo.toml, lockfile,
todos os arquivos Rust da biblioteca e `tests/core.rs` coincidiram entre
fonte C: e espelho D:. O diff desses arquivos contra o commit congelado
permaneceu vazio. Nenhum código da implementação foi alterado.

## Verificação da implementação e do CI

- `cargo test --manifest-path app/src-tauri/Cargo.toml --locked -- --nocapture`:
  1 unidade e 10 integrações passaram. A variável `SCRIBE_TEST_FIXTURES_ROOT`
  apontou para os **46 fixtures públicos** em
  `C:/Users/engmo/OneDrive/RexIA/RexIA/projetos/scribe/app/src-tauri/tests/fixtures/hooks`.
- `cargo fmt --manifest-path app/src-tauri/Cargo.toml --check`: passou.
- `cargo clippy --manifest-path app/src-tauri/Cargo.toml --locked --all-targets -- -D warnings`:
  passou.
- `cargo audit --file app/src-tauri/Cargo.lock --deny warnings`: passou,
  128 dependências, nenhum aviso ou vulnerabilidade reportado.
- O teste do helper utilizou o executável release real já presente em D:;
  recebeu evento, stdout/stderr vazios e duração inferior a um segundo.
- [Run push 37255246591](https://github.com/rexia-intel-automation/scribe/actions/runs/37255246591)
  e [run PR 37255277170](https://github.com/rexia-intel-automation/scribe/actions/runs/37255277170)
  foram consultados diretamente com `gh run view --json status,conclusion,headSha,jobs`.
  Ambos: `completed`, `success`, `headSha` igual ao commit congelado;
  auditoria, Ubuntu, macOS e Windows concluídos com sucesso.

p95 local HTTP até estado gravado: **11 ms / 32 amostras**. Nos logs do run
push: Ubuntu 4 ms, macOS 1 ms e Windows 174 ms. O limite de 200 ms passou.
Essas medições não comprovam evento até janela, latência de decisões,
CPU/memória do app nem FPS. O Windows tem margem menor e o ensaio é pequeno.

## Tentativas adicionais e reprodução

Harness isolado: `D:\RexIA\projetos\scribe\.artifacts\review-phase2-1`.
Código: `src/lib.rs`; manifesto: `Cargo.toml`; saída integral: `results.log`.
Os testes chamam a biblioteca pública real por dependência de caminho;
nenhum módulo foi copiado ou modificado. O lockfile foi derivado do original;
todos os nomes/versões das dependências do lockfile original foram conferidos
e coincidem. Só foram usados marcadores sintéticos públicos.

Executar no espelho, sob PowerShell 7:

```powershell
& 'C:/Users/engmo/.cargo/bin/cargo.exe' test `
  --manifest-path .artifacts/review-phase2-1/Cargo.toml `
  --offline --locked -- --nocapture
```

Resultado: **9 testes, 4 passaram e 5 falharam**. As cinco falhas são as
asserções do comportamento esperado, não erros de compilação ou ambiente.
Para uma reprodução individual, adicionar o nome do teste antes de `--`.

| Tentativa / teste do harness | Resultado observado |
| --- | --- |
| `json_authorization_must_be_redacted` (linha 34): chave Authorization entre aspas, em JSON e comando com hashtable PowerShell | Quebrou: `PUBLIC_JSON_AUTH` permanece no snapshot e nos bytes do SQLite nos dois casos |
| `escaped_quote_must_not_leave_token_tail` (43): `token="head\"PUBLIC_TOKEN_TAIL"` em relato | Quebrou no relato: `token=••••PUBLIC_TOKEN_TAIL"`, persistido. A variante de hook foi bloqueada pela segunda higienização da ação; essa proteção não existe no relato |
| `lowercase_dotenv_value_must_be_redacted` (52): Bash escreve `database_url=PUBLIC_ENV_VALUE` em `.env` | Quebrou: marcador intacto na ação, no passo e no SQLite |
| `expired_history_must_not_evict_live_session_on_restart` (65): sessão viva mais antiga que 256 concluídas já invisíveis | Quebrou: antes do reinício `['still-live']`; depois `[]` |
| `resumed_session_uses_current_cwd` (86): SessionStart da mesma sessão, com `source=resume` e novo cwd | Quebrou: continua `project=project`, `cwd=/public/project`, embora o payload diga `/public/new-project` |
| `standard_secret_patterns_remain_blocked` (98): Authorization simples, password, TOKEN, sk- e ghp_ | Bloqueados: nenhum marcador de segredo no snapshot ou banco |
| `sql_injection_and_late_events_do_not_reopen_end` (106): session_id com SQL e evento atrasado após SessionEnd | Bloqueados: ID rejeitado; sessão concluída não reaparece |
| `browser_origin_and_encoded_state_path_do_not_leak` (127): credencial de hook tenta GET de estado, caminho codificado, barra final, URI absoluta externa e Origin localhost | Bloqueados: estado normal 403, variantes 404, URI externa 403 e Origin 403; sem CORS |
| `permission_payload_cannot_emit_allow` (143): insere allow no payload de PermissionRequest e tenta rota de decisão | Bloqueados: hook 204 vazio sem allow; decisão 404 |

Os testes versionados também confirmaram Host duplicado/incorreto, token
errado, Origin vazio/externo, corpo acima de 1 MB (413), corpo incompleto
(408), taxa (429), concorrência, ACL, falha e recuperação de SQLite,
colisão de porta e encerramento. Esses resultados são considerados sem
substituir as tentativas independentes acima.

## Achados

### P2-01 — alto: Authorization entre aspas escapa da redação

Evidência: `app/src-tauri/src/sanitize.rs:15`, `lib.rs:163`, `lib.rs:221`,
`lib.rs:252`, `mcp.rs:67`; teste do harness linha 34.
O regex exige que `authorization` seja seguido imediatamente por espaço,
dois-pontos ou igual; a aspa final da chave impede o reconhecimento.
O regex de atribuições não inclui Authorization.

Reprodução mínima: criar sessão e chamar
`core.report("public-session", r#"{"Authorization":"Bearer PUBLIC_JSON_AUTH"}"#, 1)`.
Reprodução por `PreToolUse/Bash`, em `tool_input.command`:
`pwsh -Command 'Invoke-RestMethod -Headers @{"Authorization"="Bearer PUBLIC_JSON_AUTH"}'`.
O marcador aparece literalmente no estado e banco. Esse é um formato
comum de cabeçalho em PowerShell; não depende de chave de provedor conhecida.
Viola §8.4 e FR-11. Corrigir reconhecimento de chaves delimitadas e adicionar
regressão no hook e no relato/MCP.

### P2-02 — médio: escape de aspa deixa parte do token em relato

Evidência: `app/src-tauri/src/sanitize.rs:9`, `lib.rs:252`, `mcp.rs:67`;
teste do harness linha 43. A expressão fecha o valor na aspa escapada.
No relato sintético `token="head\"PUBLIC_TOKEN_TAIL"`, o resultado gravado
é `token=••••PUBLIC_TOKEN_TAIL"`. Snapshot e SQLite conservam a cauda.

O hook executa a higienização novamente antes de guardar a ação e bloqueou
a variante testada. O relato executa uma só passagem, e é esse o caminho
vulnerável comprovado. Viola §8.4: redação parcial de um segredo ainda o
expõe. Interpretar escapes de modo consistente e testar o caminho público
`Core::report`, também utilizado pelo MCP.

### P2-03 — alto: valores válidos de .env em minúsculas são persistidos

Evidência: `app/src-tauri/src/sanitize.rs:12`, `sanitize.rs:69`,
`lib.rs:163`, `lib.rs:233`; teste do harness linha 52.
Reprodução em `tool_input.command` de um PreToolUse/Bash:
`printf 'database_url=PUBLIC_ENV_VALUE\n' > .env`.
O estado gravado contém `Bash: printf 'database_url=PUBLIC_ENV_VALUE\n' > .env`,
e o marcador está também nos bytes do banco. O reconhecimento genérico de
variáveis só admite maiúsculas. Não é necessário ler conteúdo de arquivo:
o próprio comando usado para escrever o .env traz o valor.

A [documentação oficial Node.js para dotenv](https://nodejs.org/api/environment_variables.html#variable-names)
aceita nomes em maiúsculas ou minúsculas. A convenção de maiúsculas não é
uma restrição de validade. Viola a exigência explícita de redigir valores
de `.env` em §8.4. Cobrir nomes válidos e manter regressão de escrita por Bash.

### P2-04 — médio: histórico concluído desloca sessão viva na reabertura

Evidência: `app/src-tauri/src/store.rs:38`, `lib.rs:57`, `lib.rs:88`;
teste do harness linha 65. A consulta limita os registros a 256 antes de
considerar a visibilidade. Sessões concluídas ainda retidas no histórico
ocupam todos os lugares, mesmo que não possam aparecer na lista.

Reprodução: iniciar `still-live` em t=0; inserir 256 SessionEnd distintos
em t=`600001*n`, n=1..256; obter snapshot em t=`600001*257`, fechar Core
e reabrir em t igual. Todos os registros continuam dentro dos 14 dias.
Antes: uma sessão viva. Depois: nenhuma. O banco ainda contém a sessão;
ela só reaparece após receber novo evento. Viola a lista de sessões e
a persistência da Fase 2. Selecionar as sessões visíveis antes de aplicar
a capacidade, sem carregar histórico ilimitado na memória.

### P2-05 — médio: SessionStart vivo conserva projeto/cwd antigos

Evidência: `app/src-tauri/src/lib.rs:117`, `lib.rs:131`, `lib.rs:139`,
`app/src-tauri/src/model.rs:75`; teste do harness linha 86.
O novo cwd só é incorporado ao criar a sessão ou reabrir uma sessão que
já tinha SessionEnd. Um SessionStart/resume de sessão ainda considerada
viva conserva o projeto anterior apesar do novo campo cwd documentado.

Reprodução: dois SessionStart do mesmo ID; primeiro cwd `/public/project`,
depois `/public/new-project`, source `resume`. O segundo é aceito, mas
snapshot mantém projeto/cwd anteriores. Viola FR-10/modelo 6.2, que deriva
o projeto do cwd recebido. Atualizar esses metadados sem apagar os passos
da sessão. Também seria pertinente cobrir mudança de cwd em eventos comuns.

## Notas e catraca

| Área | Nota | Mínimo | Fundamento |
| --- | --- | --- | --- |
| A — conformidade | 9 | 9 | Os onze eventos e os 46 fixtures passam em `tests/core.rs:305`; SDK MCP oficial, descoberta e limites testados em `tests/core.rs:401`. A resposta vazia não inventa decisão. Não há evidência para nota 10 nem de fluxo real de decisões nesta fase |
| B — funcional | 7 | 9 | Mapeamento básico, passos e API funcionam, mas P2-04 e P2-05 contradizem estado persistente/lista correta; cinco expectativas adicionais falham |
| C — segurança | 6 | 9 | Loopback `server.rs:65`, defesa `server.rs:150`, comparação constante `server.rs:146` e ACL passam. P2-01/P2-03 gravam segredos integralmente; P2-02 expõe cauda. Não há aprovação indevida comprovada |
| D — robustez | 7 | 9 | Helper silencioso, corpo limitado, timeout, SQLite ocupado e encerramento passam. P2-04 perde observação de sessão viva em reinício normal com histórico retido |
| E — qualidade | 8 | 8 | Separação curta entre transporte, core, modelo, persistência e redação; lock/erros explícitos, publicação após save, fmt e clippy verdes. As condições frágeis de redação e carga precisam de correção, sem exigir refatoração ampla |
| F — testes | 7 | 9 | Contratos com todos os fixtures, HTTP real e falhas de banco são úteis. `sanitize.rs:80` cobre formatos simples; `tests/core.rs:247` não detecta os três vazamentos e o reinício não cobre histórico acima da carga. Harness adicional tem cinco falhas determinísticas; nenhum percentual de cobertura é inferido sem relatório |
| I — desempenho | 8 | 8 | Teste `tests/core.rs:722`, 32 eventos com p95 <200 ms, passou localmente e nas três plataformas; capacidades e trabalho bloqueante separado existem. Ensaio pequeno, Windows 174 ms; ainda sem medição da janela/CPU/FPS |
| J — documentação | 8 | 8 | `docs/fase-2.md:1` e ADR 0007 explicitam escopo e comandos; evidência separa medições e ausências. Alegações de higienização e reinício precisam ser alinhadas às correções desta revisão; release/site completo pertence à Fase 6 |

G, H e K: não avaliadas na Fase 2. Nenhuma nota 10 foi atribuída.
Há cinco achados concretos; as notas decorrem das reproduções, sem criar
problemas para atender à regra contra inflação.

## Referências oficiais consultadas

- [Claude Code — referência de hooks](https://code.claude.com/docs/en/hooks):
  nomes e campos comuns, SessionStart/resume e ausência de decisão quando
  o observador permanece silencioso.
- [MCP — Streamable HTTP](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports):
  validação de Origin, bind local e autenticação.
- [subtle — ConstantTimeEq](https://docs.rs/subtle/latest/subtle/trait.ConstantTimeEq.html):
  API utilizada na comparação de credenciais.
- [Node.js — dotenv](https://nodejs.org/api/environment_variables.html#variable-names):
  nomes de variáveis válidos usados em P2-03.

Correções e nova rodada independente são necessárias antes de avançar à
Fase 3. Não houve commit, push, merge, uso de modelo Claude ou alteração de
configuração pessoal durante a revisão.
