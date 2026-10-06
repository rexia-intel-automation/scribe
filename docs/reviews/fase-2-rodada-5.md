# Fase 2 — revisão adversarial independente, rodada 5

Data: 2026-10-06. Candidato inicial:
`70ddd0a1edbab57ac302fcb73cf5dcf6202940c3`.
Commit congelado final: `e374e1ebbad40e38b54c1fc323f40e4cd524f140`.
Diff avaliado: `main..e374e1ebbad40e38b54c1fc323f40e4cd524f140`.
PR: [#4](https://github.com/rexia-intel-automation/scribe/pull/4).

**Veredito: APROVADA no commit final.** A9 B9 C9 D9 E8 F9 I8 J8.
As treze reproduções de problemas das quatro rodadas anteriores passam,
assim como nove tentativas novas e independentes. Não resta problema crítico
ou alto reproduzido. O candidato inicial teve duas falhas temporais no CI
Windows do PR; esse resultado foi preservado e impedia sua aprovação.
O construtor corrigiu apenas o agendamento dos testes e a documentação,
sem alterar produção, testes, lockfiles ou limites. Os dois runs do novo
SHA terminaram verdes antes deste veredito.

## Escopo e independência

Revisor sem participação na implementação. Foram lidos `prompt.md`
integralmente, o diff da fase, os sete módulos Rust, testes, `docs/fase-2.md`,
ADR 0007, `docs/evidence/local-server-phase-2.json` e os quatro relatórios
anteriores. Somente API local sem decisões, onze eventos/estados, SQLite,
higienização, SSE/MCP e desempenho do núcleo receberam avaliação.
Fases 0 e 1 são consideradas aprovadas. G, H e K não se aplicam.
Janela, decisões humanas, instaladores e release futuros não receberam
crédito nem foram cobrados. PermissionRequest observador com 204 vazio e
scribe_ask indisponível são coerentes com esta etapa.

O construtor informou o problema do CI inicial durante a revisão. O revisor
consultou diretamente os runs e seus logs e confirmou as duas asserções.
Antes do veredito, recebeu o novo SHA, leu o delta de dois arquivos e
confirmou que os dez blobs da biblioteca/testes/dependências eram idênticos.
O delta introduz `--test-threads=1` no comando oficial do núcleo em
`.github/workflows/ci.yml:39` e explica a execução em `docs/fase-2.md:97`.
Nenhuma asserção foi afrouxada; os testes de concorrência continuam usando
threads e tarefas concorrentes dentro de cada cenário. A cobertura Linux
continua exigindo 85% e executando todos os 21 testes de integração.

## Integridade e ambiente

Builds e testes ocorreram somente em `D:\RexIA\projetos\scribe`, sob
`C:\Program Files\PowerShell\7\pwsh.exe` (7.6.6), com Cargo/Rust 1.96.0.
Fonte versionada: `C:\Users\engmo\OneDrive\RexIA\RexIA\projetos\scribe`.
Harness e logs: `.artifacts/review-phase2-5`, no runtime D:.
O harness usa dependência de caminho para a biblioteca real
`../../app/src-tauri`; nenhum módulo de produção foi copiado ou alterado.

Cargo.toml, Cargo.lock, sete módulos Rust e tests/core.rs tiveram SHA-256
bruto igual entre fonte e runtime, antes e depois dos ensaios. Seus blobs
git hash-object também coincidiram com os dois commits congelados.
Evidência: `hashes-before.json`, `hashes-after.json` e
`final-target-integrity.log`. O diff dos arquivos de produção e dos quatro
relatórios anteriores contra o SHA final ficou vazio.

O lockfile do harness foi derivado do lockfile de produção e normalizado
localmente pelo Cargo. A primeira tentativa com --locked recusou essa
normalização e não executou testes; não foi contada como falha do produto.
Depois dela, todos os 128 nomes/versões de pacotes de produção foram
conferidos: nenhuma versão mudou, e a única adição é o próprio harness.
Cargo omite a dependência dev tempfile da entrada transitiva scribe-core;
tempfile continua presente como dependência do harness. Os resultados
abaixo usam esse lockfile final com --offline --locked.
Evidência: `lock-integrity.log`.

Na fonte, somente este relatório foi escrito pelo revisor. Relatórios,
implementação, arquivos pessoais e harnesses originais foram preservados.
Não houve commit, push, merge, chamada a modelo Claude ou acesso/edição à
configuração pessoal. Entradas de comandos são textos sintéticos públicos;
nenhum payload de shell fornecido ao núcleo foi executado.

## Verificação oficial e CI

- Execução oficial inicial: **1 unidade e 21 integrações passaram**, zero
  ignoradas; p95 HTTP **35 ms / 32 amostras**, suite de integração 2,84 s.
  Evidência: `official-tests.log`.
- Comando final documentado, com --test-threads=1, repetido pelo revisor:
  **1 unidade e 21 integrações passaram**, zero ignoradas; p95 **5 ms / 32**,
  suite de integração 8,57 s. Evidência: `official-serial.log`.
- SCRIBE_TEST_FIXTURES_ROOT apontou exatamente para os **46 fixtures públicos**
  versionados em C:, cobrindo os onze eventos. Extras históricos de D: não
  entraram. O próprio teste exige total 46 em `tests/core.rs:770`.
- cargo fmt --check, cargo clippy --locked --all-targets -- -D warnings e
  cargo audit --file app/src-tauri/Cargo.lock --deny warnings passaram.
  Auditoria: 128 dependências, nenhum aviso ou vulnerabilidade reportado.
  Logs: `fmt.log`, `clippy.log`, `audit.log`.
- O helper release real recebeu evento com stdout/stderr vazios e duração
  abaixo de um segundo. ACL Windows, contratos, limites HTTP, SSE/MCP,
  concorrência, falha/recuperação SQLite, capacidade, porta ocupada e
  liberação da porta passaram.
- Cobertura local repetida pelo revisor com cargo-llvm-cov 0.9.1, --test core,
  --json --summary-only, exclusão de arquivos de teste e --fail-under-lines 85:
  **849/886 linhas de produção = 95,82%**. Apenas os sete módulos de produção
  aparecem; módulos unitários não foram compilados nesse denominador.
  Evidência: `coverage.json`, `coverage.log`.
- [Run final push 37462919510](https://github.com/rexia-intel-automation/scribe/actions/runs/37462919510)
  e [run final PR 37462926164](https://github.com/rexia-intel-automation/scribe/actions/runs/37462926164):
  consultados diretamente com gh run view --json
  status,conclusion,headSha,url,jobs,event. Ambos **completed/success**,
  headSha exatamente `e374e1ebbad40e38b54c1fc323f40e4cd524f140`, todos os
  quatro jobs concluídos com sucesso: auditoria, Windows, macOS e Ubuntu.
- Logs Linux finais comprovam --test core, exclusão de /tests/ e exigência
  de 85%: **799/830 linhas de produção = 96,27%**, nos dois runs. O denominador
  difere do Windows por código de plataforma, sem inclusão de testes.

JSONs e logs completos dos quatro runs estão no harness como
`ci-<run>.json` e `ci-<run>.log`; `final-ci-metrics.log` reúne os trechos.

| Medição HTTP até estado persistido, 32 amostras | Ubuntu | macOS | Windows |
| --- | --- | --- | --- |
| Push final | 2 ms | 2 ms | 53 ms |
| PR final | 2 ms | 3 ms | 32 ms |

Todos os valores finais passam <200 ms. São amostras pequenas e o tempo
total Windows varia bastante entre runners. Não se infere evento até janela,
latência de decisão, memória/CPU do app ou FPS a partir destes resultados.

## Regressões preservadas

**33 testes passaram: 9 + 8 + 8 + 8**, nenhum falhou ou foi ignorado.
Logs: `previous-regressions.log` e `round2-final.log`.
As cópias das rodadas 1, 3 e 4 têm SHA-256 igual aos src/lib.rs originais.
Na cópia da rodada 2, a única alteração é
`set_completed_minutes(60)` → `set_completed_minutes(60,600_001)`.
Foi conferido o diff exato e repetido esse alvo após remover uma linha
em branco herdada da cópia anterior; os oito testes passaram novamente.
Evidência: `regression-copy-diff.log`. Originais permanecem intactos.

| Problema anterior | Resultado confirmado nesta rodada |
| --- | --- |
| P2-01/02/03, Authorization delimitado, aspa escapada e dotenv minúsculo | Marcadores originais ausentes do snapshot e dos bytes SQLite, nos caminhos originais |
| P2-04/05, histórico e cwd retomado | Sessão viva não é deslocada no reinício; novo projeto/cwd aparece mantendo passos |
| P2-06, dotenv com espaços | Cauda original omitida em hook, relato e banco |
| P2-07, janela de concluídas | Ampliar/reduzir recupera o histórico imediatamente, preservando vivas/subagentes |
| P2-08, falha após silêncio | Mancha permanece até novo evento |
| P2-09/10/11, concatenação/escape Authorization e redirecionamentos | Caudas originais ausentes; caminhos junto a < e > encurtados |
| P2-12, flags -I/-L | Ancestrais originais ausentes em hook, relato e banco; alvo útil permanece |
| P2-13, retenção | Expira sem novos hooks e elimina passos antigos de sessão com atividade recente, inclusive após reinício |

## Nove tentativas novas de quebra

Fonte: `src/lib.rs` do harness; resultado: `results.log`.
**9 passaram, 0 falharam, 0 ignoradas.** Todas são ensaios novos deste
revisor, distintos dos 33 testes antigos. As expectativas não foram
alteradas após observar os resultados.

Reprodução no runtime, sob PowerShell 7:

```powershell
& 'C:/Users/engmo/.cargo/bin/cargo.exe' test `
  --manifest-path .artifacts/review-phase2-5/Cargo.toml `
  --offline --locked --lib -- --nocapture
& 'C:/Users/engmo/.cargo/bin/cargo.exe' test `
  --manifest-path .artifacts/review-phase2-5/Cargo.toml `
  --offline --locked --test round1 --test round2 --test round3 --test round4 -- --nocapture
```

Para reprodução individual, acrescentar o nome do teste antes de --.

| Teste / linha do harness | Tentativa e resultado |
| --- | --- |
| retention_boundary_keeps_exact_cutoff_and_removes_one_ms_older, 19 | Ataque ao limite inclusivo: passo exatamente no corte é conservado, passo 1 ms anterior é removido de memória/SQLite/bytes; avançar mais 1 ms remove o anterior; reinício mantém ordem e passos corretos |
| pruning_failure_after_policy_write_rolls_back_both_and_recovers, 34 | Trigger sintético falha no UPDATE dos passos, depois da gravação da política dentro da transação: política continua 14 dias, três passos e snapshot iguais; remover trigger permite mudar para um dia e apagar bytes vencidos |
| snapshot_without_expired_data_works_during_reserved_write_lock, 51 | BEGIN IMMEDIATE externo com dados não vencidos: snapshot continua legível; pruning sem trabalho não tenta escrever nem muda Respingo prematuramente |
| failed_step_prune_preserves_memory_sqlite_and_no_false_delta, 60 | Banco bloqueado durante expiração: snapshot/relato falham, SQLite mantém valor anterior e não sai delta falso; desbloquear permite expiração e próximo relato, sem bytes antigos |
| unicode_lengths_control_characters_and_secret_fragments_are_safe, 74 | 140 caracteres Unicode aceitos e 141 rejeitados; CR/LF/ESC removidos da ação; quatro variantes novas de flags sensíveis, Proxy-Authorization concatenado, atribuição mista e .eNv.production omitem marcadores do estado/banco |
| windows_unc_and_multiple_compiler_targets_shorten_without_losing_urls, 89 | Mistura de caminhos Windows/UNC/Unix em flags e response-file: ancestral sintético omitido mesmo com múltiplos alvos; URL HTTPS útil permanece inteira |
| duplicate_json_contract_keys_and_mcp_unicode_overflow_do_not_mutate, 105 | Duplicação de hook_event_name/session_id retorna 400; MCP com 141 caracteres Unicode ou campo desconhecido retorna erro; snapshot permanece idêntico |
| chunked_body_over_limit_fails_and_shutdown_ends_live_sse, 119 | Corpo chunked de 1 MB + 1 byte retorna 413 e não grava sessão; SSE inicia com snapshot, stop encerra conexão aberta e libera porta dentro do limite do ensaio |
| periodic_maintenance_prunes_a_session_without_snapshot_or_hook, 133 | Depois do tick inicial, inserir metadados antigos sintéticos e aguardar o próximo tick real, sem snapshot/hook/UI durante a espera: SQLite perde linha e bytes em cerca de 60 s; não é apenas teste da manutenção ao iniciar |

## Achado durante a rodada

### P2-14 — médio, resolvido no candidato final: validação temporal concorrente no CI Windows

A falha foi comunicada pelo construtor e confirmada diretamente pelo
revisor; não é apresentada como descoberta independente de código.
No [PR inicial 37462130262](https://github.com/rexia-intel-automation/scribe/actions/runs/37462130262),
Windows teve **19 integrações aprovadas e 2 falhas**, total 57,83 s:
`tests/core.rs:1131` falhou com p95 **314 ms** contra limite <200 ms;
`tests/core.rs:1088` falhou no helper contra limite <1 s.
Evidência: `ci-37462130262.log:2034`, `:2037`, `:2044`, `:2065`.
O [push inicial 37462123612](https://github.com/rexia-intel-automation/scribe/actions/runs/37462123612)
passou no mesmo SHA, com p95 Windows 159 ms e suite 51,43 s. Um run verde
não apagaria o run vermelho: o candidato inicial não cumpria §13.4.1.

A hipótese de disputa de disco/CPU entre benchmarks, testes de capacidade
e SQLite é uma inferência compatível com esses logs, não um perfil de CPU
ou prova de causalidade. Classificação média: execução oficial inconsistente
de dois critérios temporais exigidos, sem evidência de allow indevido,
vazamento, travamento do Claude ou defeito novo de persistência.
As duas asserções são agrupadas neste problema de validação, sem inventar
dois problemas independentes ou aumentar a contagem para atender à escala.

O construtor isolou a execução dos testes entre si com --test-threads=1,
preservando concorrência interna, limites e código. O revisor examinou o
delta, repetiu o comando e confirmou os dois runs finais completos e verdes,
com p95 Windows 53/32 ms e helper aprovado. A resolução é verificada para
o protocolo de teste final; não implica garantia de latência sob qualquer
carga do sistema. Nenhum outro problema novo foi reproduzido nas nove
tentativas. Não resta achado aberto crítico, alto ou médio nesta rodada.

## Notas e catraca

| Área | Nota | Mínimo | Evidência e fundamento |
| --- | --- | --- | --- |
| A — conformidade Claude Code | 9 | 9 | Onze eventos e 46 fixtures em tests/core.rs:709 passam; campos e ausência de decisão conferidos na referência oficial. MCP usa SDK oficial, discovery/schema/limites e dispatcher em tests/core.rs:805 passam; duplicações e Unicode inválido também são rejeitados |
| B — correção funcional | 9 | 9 | Mapeamento em tests/core.rs:555, persistência/políticas em :650 e 33 regressões passam. Cortes exatos, ordem dos passos, rollback após gravar política e manutenção periódica real passam no harness :19/:34/:133. Nada depende de futura UI para ser correto nesta etapa |
| C — segurança | 9 | 9 | Bind em server.rs:65, defesa em :170, comparação em :166, ACL em private_fs.rs:22 e tests/core.rs:523; segredos/path antes de persistência em sanitize.rs:28/:51. Testes HTTP/regras de acesso e novas variantes/chunked passam; não observado allow indevido ou marcador sensível persistido |
| D — robustez/falha segura | 9 | 9 | Core só publica após save em lib.rs:250/:273; transação de retenção em store.rs:110. Harness :34/:51/:60 prova rollback, leitura sem escrita desnecessária e recuperação sem delta falso; :119 comprova shutdown SSE. Helper real, concorrência, capacidade e porta passam localmente e nos dois CIs finais |
| E — qualidade de código | 8 | 8 | Sete módulos com responsabilidades claras, APIs públicas documentadas, erros HTTP fixos, fmt/clippy sem avisos; transações localizadas em store.rs:76/:110. Os regex conservadores em sanitize.rs:8/:11/:16 sacrificam detalhe e não interpretam shell; essa escolha explícita e o acoplamento entre mutex/SQLite ainda comportam evolução, sem exigir refatoração nesta fase |
| F — testes | 9 | 9 | 22 oficiais, 33 regressões e 9 casos novos passam, 95,82% de linhas de produção local/96,27% Linux; falhas e limites úteis, sem testes ignorados. P2-14 foi registrado, corrigido no protocolo sem afrouxar asserções e verificado por dois CIs do SHA final. Cobertura não é apresentada como prova de ausência de todos os defeitos |
| I — desempenho | 8 | 8 | tests/core.rs:1093 e logs finais dão p95 <200 ms, 32 amostras por plataforma; spawn_blocking e limites 256/20 existem. P2-14 demonstra sensibilidade ao ambiente; ainda faltam ensaios maiores de carga para uma nota 9. Nenhuma medição de UI/decisão/CPU/FPS futura é cobrada ou inferida |
| J — documentação | 8 | 8 | docs/fase-2.md, ADR 0007, evidência e READMEs delimitam fase, omissões de texto, políticas e reprodução. O delta final explica serialização/concorrência. Documentação é sólida para o núcleo, mas a evidência do construtor continua sendo uma amostra local, não substitui logs independentes; site/release completo pertence à Fase 6 |

G, H e K não avaliadas. Nenhuma nota 10 atribuída. Há nove tentativas novas,
33 regressões preservadas e um achado temporal real resolvido antes do
veredito. §13.1.7 não invalida a rodada: as notas não são todas 9/10;
E/I/J recebem 8 com fundamentos próprios, sem rebaixar qualquer mínimo.
Não foram fabricados outros problemas para inflar a contagem.
Todos os mínimos aplicáveis são atingidos no SHA final e os dois CIs
estão verdes. A aprovação abrange somente a Fase 2.

## Fontes primárias consultadas

- [Claude Code — hooks](https://code.claude.com/docs/en/hooks): nomes dos
  onze eventos, campos comuns e observador sem decisão. Eventos adicionais
  hoje documentados não ampliam o escopo obrigatório de §6.3 desta fase.
- [MCP — Streamable HTTP](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports):
  Origin, autenticação e bind local, coerentes com as defesas verificadas.
- [SQLite — transações](https://www.sqlite.org/lang_transaction.html):
  limites de transações/rollback que motivaram a injeção de falha depois
  da escrita da política, contra a conexão real da biblioteca.
- [subtle — ConstantTimeEq](https://docs.rs/subtle/latest/subtle/trait.ConstantTimeEq.html):
  comparação independente do conteúdo para comprimentos iguais; não foi
  confundida com garantia de tempo constante para comprimentos diferentes.

Próxima etapa permitida pela catraca: Fase 3, respeitando seus pré-requisitos
próprios. Esta aprovação não declara pronta nem publicada a v0.1.
