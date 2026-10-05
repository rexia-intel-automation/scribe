# Fase 2 — revisão adversarial independente, rodada 3

Data: 2026-10-05. Commit congelado final:
`14a668374dd83fae98c7bbd3e84bff5a5351cf49`.
Diff avaliado: `main..14a668374dd83fae98c7bbd3e84bff5a5351cf49`.
PR: [#4](https://github.com/rexia-intel-automation/scribe/pull/4).

**Veredito: REPROVADA.** Os oito achados das rodadas anteriores estão
corrigidos nas reproduções originais. Esta rodada encontrou um problema alto
e dois médios: caudas de Authorization em concatenação Bash e escape
PowerShell, além de caminhos absolutos adjacentes a redirecionamentos.
B, C e F ficam abaixo da catraca. Ambos os runs de CI do SHA revisado estão
completos e verdes; isso não elimina as novas falhas reproduzidas.

## Escopo e independência

Revisor novo, sem participação na implementação. Foram lidos `prompt.md`
inteiro, diff da fase, testes, `docs/fase-2.md`, ADR 0007, evidência local e
os dois relatórios anteriores. Fases 0 e 1 foram consideradas aprovadas.
Escopo: API sem decisões, onze hooks, estado, SQLite, higienização, SSE/MCP
e desempenho do servidor. G, H e K não são avaliadas. Não foram cobradas
janela, decisões humanas ou releases, nem atribuído crédito antecipado.
PermissionRequest vazio e scribe_ask indisponível são coerentes com esta fase.

O SHA inicialmente recebido foi `ab911a3`. Antes do veredito, o construtor
informou uma reprodução adicional de `.env` com `=` codificado e publicou
a correção em `14a6683`. A revisão foi retargetada ao novo commit, incluindo
leitura do delta, nova comparação de integridade e nova execução dos testes.
O caso codificado é uma confirmação de correção informada pelo construtor,
não uma descoberta independente deste revisor. As três falhas abaixo foram
reproduzidas no commit final, que permaneceu congelado durante os ensaios.

## Integridade e ambiente

Builds e testes executados somente em `D:\RexIA\projetos\scribe`, sob
`C:\Program Files\PowerShell\7\pwsh.exe`, com Cargo/Rust 1.96.0 e Node
24.11.0. A biblioteca real foi usada por dependência de caminho; nenhum
módulo de produção foi copiado ou modificado pelo revisor.

SHA-256 de dez arquivos — Cargo.toml, Cargo.lock, sete arquivos Rust e
`tests/core.rs` — coincidiu entre fonte C: e espelho D:. Para cada arquivo,
`git hash-object` coincidiu com o blob do commit congelado; o diff de
`app/src-tauri` contra esse SHA ficou vazio. Resultado completo:
`.artifacts/review-phase2-3/hashes.json`, no espelho.
Os nomes/versões de todos os pacotes do lockfile de produção coincidem
com o lockfile do harness; a única adição é o próprio pacote do harness.

Na fonte, somente este relatório foi criado. Os relatórios anteriores,
implementação e arquivos pessoais foram preservados. Não houve commit,
push, merge, chamada a modelo Claude nem alteração da configuração pessoal.
Os comandos de controle de aspas apenas imprimem marcadores sintéticos;
curl e Invoke-RestMethod das reproduções não foram executados na rede.

## Verificação oficial e CI

- `cargo test --manifest-path app/src-tauri/Cargo.toml --locked -- --nocapture`:
  **1 unidade e 16 integrações passaram**, zero ignoradas. Saída:
  `.artifacts/review-phase2-3/official-tests.log`.
- `SCRIBE_TEST_FIXTURES_ROOT` apontou para os fixtures públicos na fonte C:;
  o teste exige exatamente **46**, cobrindo os onze eventos. Extras históricos
  do runtime D: não foram usados.
- `cargo fmt --manifest-path app/src-tauri/Cargo.toml --check`: passou.
- `cargo clippy --manifest-path app/src-tauri/Cargo.toml --locked --all-targets -- -D warnings`:
  passou.
- `cargo audit --file app/src-tauri/Cargo.lock --deny warnings`: passou;
  128 dependências, sem vulnerabilidades ou avisos reportados.
- Helper release real: recebeu evento com stdout/stderr vazios e duração
  inferior a um segundo. Os testes versionados de MCP, SSE, ACL, corpos
  excessivos/incompletos, taxa, concorrência, SQLite ocupado/recuperado,
  porta ocupada e liberação da porta também passaram.
- [Run push 37258880171](https://github.com/rexia-intel-automation/scribe/actions/runs/37258880171)
  e [run PR 37258883452](https://github.com/rexia-intel-automation/scribe/actions/runs/37258883452):
  consultados com `gh run view --json status,conclusion,headSha,url,jobs,event`;
  ambos **completed/success**, SHA igual ao congelado. Auditoria e todos os
  jobs de Windows, macOS e Ubuntu terminaram com sucesso.
- Os logs Linux dos dois runs comprovam `--test core`, exclusão de `/tests/`
  e `--fail-under-lines 85`: **744/777 linhas de produção, 95,75%**.
  Não foi inferida cobertura de decisões futuras. A medição Windows
  794/833 = 95,32% em `docs/evidence/local-server-phase-2.json` é do
  construtor; o denominador Linux confirmado acima é diferente.

JSONs dos runs e trechos de cobertura/latência foram preservados no harness.
p95 local HTTP até estado persistido: **7 ms, 32 amostras**. No push:
Ubuntu 2 ms, macOS 25 ms, Windows 148 ms; no PR: 8, 2 e 158 ms.
Todos passaram o limite de 200 ms. Esses ensaios pequenos não comprovam
evento até janela, latência de decisão, CPU/memória do app ou FPS.

## Regressões das rodadas anteriores

Os nove testes da rodada 1 foram copiados sem alterações para
`tests/round1.rs`: **9 passaram**. Os oito da rodada 2 foram copiados para
`tests/round2.rs`, adaptando apenas `set_completed_minutes(60)` para
`set_completed_minutes(60,600_001)`, conforme a nova assinatura: **8 passaram**.
O harness original da rodada 2 ficou intacto. Saída:
`.artifacts/review-phase2-3/previous-regressions.log`.

| Achado anterior | Confirmação nesta rodada |
| --- | --- |
| P2-01, Authorization delimitado | JSON e hashtable originais redigidos; marcadores ausentes de snapshot/SQLite |
| P2-02, escape por barra em token | Relato e hook originais omitem a cauda |
| P2-03, dotenv em minúsculas | Valor original omitido nos dois caminhos |
| P2-04, histórico deslocando sessão viva | Sessão viva permanece após reinício com 256 concluídas antigas |
| P2-05, cwd de retomada | Projeto passa a new-project |
| P2-06, dotenv com espaços | Cauda original omitida em relato, hook e banco |
| P2-07, ampliar janela de concluídas | Lista ampliada coincide com a lista após reinício |
| P2-08, Mancha após silêncio | Mancha permanece após dez minutos sem novo evento |

As variantes novas de Authorization abaixo não anulam o resultado positivo
das reproduções antigas. Elas demonstram lacunas adicionais.

## Tentativas deliberadas adicionais

Harness próprio: `D:\RexIA\projetos\scribe\.artifacts\review-phase2-3`.
Fonte das novas tentativas: `src/lib.rs`; saída final: `results.log`.
Resultado: **8 testes, 5 passaram e 3 falharam**. São falhas de asserções
sobre comportamento esperado, não erros de compilação ou ambiente.
Sete tentativas são novas deste revisor; a oitava confirma o caso `.env`
informado pelo construtor. Todos os valores são marcadores públicos sintéticos.

```powershell
& 'C:/Users/engmo/.cargo/bin/cargo.exe' test `
  --manifest-path .artifacts/review-phase2-3/Cargo.toml `
  --offline --locked --lib -- --nocapture
& 'C:/Users/engmo/.cargo/bin/cargo.exe' test `
  --manifest-path .artifacts/review-phase2-3/Cargo.toml `
  --offline --locked --test round1 --test round2 -- --nocapture
```

Para reprodução individual, acrescentar o nome do teste antes de `--`.

| Teste / linha do harness | Resultado |
| --- | --- |
| `authorization_powershell_backtick_tail_is_omitted`, 23 | Quebrou em Core.report e SQLite; hook bloqueou a cauda pela segunda passagem |
| `authorization_bash_concatenated_value_is_omitted`, 29 | Quebrou em relato, hook e SQLite; a parte concatenada da credencial permanece |
| `shell_redirection_absolute_paths_are_shortened`, 35 | Quebrou nos dois caminhos para `cat</...` e `>/...`; diretório privado completo permanece |
| `failed_clear_history_does_not_desynchronize_committed_state`, 44 | Bloqueado: leitor SQLite impede limpeza; memória/banco conservam a sessão após falha e reinício |
| `visibility_reload_after_restart_does_not_invent_active_agents`, 55 | Bloqueado: mudar política conserva Ampulheta de reinício; SubagentStop não recupera agente fictício |
| `ui_credential_duplicates_and_dot_segments_cannot_read_state`, 74 | Bloqueados: credencial de UI duplicada e query sem UI recebem 403; dot segments/barra dupla recebem 404; nenhum estado exposto |
| `unauthenticated_requests_cannot_consume_valid_rate_quota`, 82 | Bloqueado: 60 pedidos com Origin externo recebem 403; pedido legítimo seguinte recebe 200 |
| `dotenv_hex_assignment_is_omitted_in_final_candidate`, 64 | Confirmação positiva da correção do construtor: marcador codificado ausente em relato, hook e SQLite |

## Achados

### P2-09 — alto: concatenação Bash deixa parte de Authorization persistida

Evidência: `app/src-tauri/src/sanitize.rs:22`, `sanitize.rs:24`,
`sanitize.rs:45`, `lib.rs:137`, `lib.rs:222`, `lib.rs:253`;
harness `src/lib.rs:29`.

Reprodução no command de PreToolUse/Bash e em Core.report:

```text
curl -H "Authorization: Bearer head"'PUBLIC_CONCAT_AUTH' https://example.invalid
```

Estado/SQLite conservam:
`curl -H "Authorization: ••••"'PUBLIC_CONCAT_AUTH' https://example.invalid`.
No hook, a ação tem também o prefixo Bash. A segunda passagem não remove
o marcador. O mesmo trecho aparece nos passos persistidos.

Controle local com Bash real, `quoting-control.sh`, imprime
`Authorization: Bearer headPUBLIC_CONCAT_AUTH`. Portanto o marcador é parte
da mesma credencial do cabeçalho, não argumento separado. Não houve requisição
de rede. Saída do controle: `quoting-controls.log`.

O regex de Authorization termina na primeira aspa da representação de shell
e não omite o trecho concatenado. Viola a redação explícita de Authorization
em §8.4. Classificação alta pela exposição de parte substancial da credencial
nos dois caminhos públicos e no banco; não foi comprovado acesso remoto nem
envio externo. Omitir a cauda ambígua após o cabeçalho ou garantir redação
completa sem depender da primeira aspa; exigir regressão em hook/relato/banco.

### P2-10 — médio: escape PowerShell de aspa ainda vaza no relato

Evidência: `app/src-tauri/src/sanitize.rs:7`, `sanitize.rs:8`,
`sanitize.rs:22`, `sanitize.rs:45`, `lib.rs:253`, `mcp.rs:67`;
harness `src/lib.rs:23`.

Reprodução:

```text
Invoke-RestMethod -Headers @{"Authorization"="Bearer head`"PUBLIC_AUTH_TAIL"}
```

Core.report publica/grava
`Invoke-RestMethod -Headers @{"Authorization"=••••PUBLIC_AUTH_TAIL"}`.
A mesma cauda está nos bytes SQLite. O controle PowerShell real,
`quoting-control.ps1`, produz o valor `Bearer head"PUBLIC_AUTH_TAIL`:
a aspa após a crase pertence ao valor, não encerra a string.

QUOTED_VALUE reconhece escapes por barra, mas fecha na aspa escapada por
crase. A atribuição delimitada de Authorization também não é coberta pela
omissão genérica de variável. A segunda higienização da ação protegeu o
hook testado; Core.report, usado por scribe_report, faz uma passagem e vaza.
Viola §8.4. A gravidade média segue o alcance parcial e o caminho de relato
comprovado. Corrigir a omissão conservadora de Authorization e preservar
uma regressão que não dependa da segunda passagem do hook.

### P2-11 — médio: redirecionamento sem espaço conserva caminho absoluto

Evidência: `app/src-tauri/src/sanitize.rs:32`, `sanitize.rs:33`,
`sanitize.rs:59`, `sanitize.rs:64`; harness `src/lib.rs:35`.

Reproduções em hook Bash e relato:

```text
cat</private/PUBLIC_PARENT/project/file.rs
cp /tmp/file >/private/PUBLIC_PARENT/project/file.rs
```

O caminho `/private/PUBLIC_PARENT/project/file.rs` permanece integralmente
na ação, nos passos e no SQLite. INLINE_PATH só considera início, espaço
ou `=` antes do caminho; os operadores `<` e `>` não são reconhecidos como
limites, embora encerrem uma palavra de shell. Caminhos entre aspas e com
espaço passam nos testes existentes, mas essas variantes comuns não.

Viola o encurtamento de caminhos absolutos de §8.4 e a alegação correspondente
do ADR 0007. Expõe diretórios ancestrais que o produto deveria omitir; não
foi demonstrada exposição de conteúdo de arquivo. Reconhecer os limites de
redirecionamento e testar ambos os caminhos antes de armazenamento.

## Notas e catraca

| Área | Nota | Mínimo | Evidência e fundamento |
| --- | --- | --- | --- |
| A — conformidade Claude Code | 9 | 9 | Onze eventos/46 fixtures em `tests/core.rs:510` passam; campos e resposta observadora conferidos na referência oficial de hooks. SDK MCP e testes HTTP em `tests/core.rs:606` passam. Nenhuma aprovação humana é inferida |
| B — correção funcional | 8 | 9 | API, estados, passos, persistência e oito correções anteriores funcionam. P2-09/P2-10/P2-11 deixam metadados diferentes do contrato de higienização/encurtamento; três expectativas adicionais falham |
| C — segurança | 7 | 9 | Loopback, Host/Origin, duas credenciais, ACL, comparação constante e ausência de allow passam (`server.rs:56`, `server.rs:150`, testes HTTP). P2-09/P2-10 publicam/persistem caudas de Authorization; P2-11 omite a barreira de privacidade do caminho |
| D — robustez/falha segura | 9 | 9 | Helper real e corpos incompletos/capacidade/SQLite/encerramento passam em `tests/core.rs:276`, `tests/core.rs:836`, `tests/core.rs:894`. Novas tentativas de leitor SQLite, reinício/política e quota legítima passaram. Não foi observado travamento ou falsa aprovação |
| E — qualidade de código | 8 | 8 | Transporte, modelo, core e store separados; salva antes de publicar em `lib.rs:234`; fmt e clippy sem avisos. Os novos formatos mostram limites localizados dos regex de higienização; requerem correção, sem justificar refatoração ampla |
| F — testes | 7 | 9 | 17 testes oficiais, 17 regressões anteriores e cobertura Linux de produção 95,75% comprovados. `tests/core.rs:40` não cobre escapes/concatenações novos de Authorization; encurtamento só cobre limites simples. Três falhas determinísticas do harness impedem nota 9 |
| I — desempenho | 8 | 8 | `tests/core.rs:894` e logs locais/CI: 32 eventos, p95 abaixo de 200 ms nas três plataformas; capacidades e spawn_blocking existem. Amostra pequena, margem Windows menor; CPU/memória/FPS da janela ainda fora do escopo |
| J — documentação | 8 | 8 | `docs/fase-2.md`, ADR 0007, READMEs e evidência distinguem fase, medições e ausências. Registram a perda de detalhe por omissão de atribuições/.env. P2-09/P2-10/P2-11 limitam as alegações de redação/encurtamento e precisam de correção alinhada; site/release completo pertence à Fase 6 |

G, H e K não avaliadas. Nenhuma nota 10 atribuída. A rodada é válida pelo
§13.1: oito tentativas documentadas, três problemas concretos, notas com
evidência e sem inflação. A catraca reprova por B/C/F abaixo dos mínimos
e pelo problema alto P2-09. CI verde não autoriza avançar à Fase 3.

## Fontes e próximo passo

- [Claude Code — hooks](https://code.claude.com/docs/en/hooks): campos,
  eventos e comportamento observador sem decisão.
- [MCP — Streamable HTTP](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports):
  autenticação, bind local e defesa de Origin.
- [PowerShell — regras de aspas](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_quoting_rules?view=powershell-7.5):
  crase conserva a aspa no valor; confirmado também pelo controle local.
- [Node.js — variáveis de ambiente](https://nodejs.org/api/environment_variables.html):
  contexto das regressões de dotenv das rodadas anteriores.

O manual GNU Bash não pôde ser recuperado pelo navegador nesta execução;
a concatenação foi confirmada diretamente pelo Bash local, sem atribuir
uma consulta bem-sucedida a essa fonte. Corrigir os três casos, adicionar
regressões e abrir outra revisão independente antes de avançar.
