# Fase 1 — revisão adversarial, rodada 2

Data: 2026-10-04. Revisor independente, sem participação na implementação.
Contrato lido: `prompt.md` inteiro, especialmente §§8.6, 10 e 13.
Snapshot: `87904647e9081d84a19a49c9ae6a8d4f65bb54a2`.
Diff completo: `452ab77..87904647` (28 arquivos); correções da rodada 1:
`c9af439..87904647`. A referência local main inicialmente apontava para
c9af439; a base real do PR e origin/main é 452ab77. Não houve merge.

**Veredito: REPROVADA. A9 B8 C8 D8 E7 F8 J8 K8.**
E não atinge o mínimo 8: há um novo achado médio reproduzido no processo de
verificação e uma divergência baixa de configuração. As três correções anteriores foram confirmadas; nenhum problema
crítico ou alto foi demonstrado. A CI do snapshot está verde, mas os testes
atuais não cobrem a falha de criação do subprocesso do CLI. Corrigir R2.1 e
realizar outra revisão independente antes de iniciar a Fase 2.

## Escopo, isolamento e limites

Avaliei o esqueleto instalável da tabela 13.3: marketplace, manifesto, onze
hooks, MCP, skill, comando, helper observador, testes e CI introduzidos.
Não exigi servidor/UI, decisão humana, lançamento real do app ou instaladores
da v0.1 nesta fase. Não concedi crédito a FR-04 com app real nem a um turno
completo com pergunta/comando. G/H/I não são avaliados nesta fase.

A fonte ficou no OneDrive. Todos os testes, executáveis e servidores desta
revisão rodaram em `D:\RexIA\projetos\scribe`. TEMP/TMP dos testes Node foram
direcionados à `.verification` do D:. Só alterei este relatório; temporárias
de reprodução foram removidas após conferir o alvo absoluto dentro do runtime.
Não invoquei modelos, instalei ferramentas ou alterei configurações pessoais.
O ataque ao teste de instalação usou exclusivamente `--installation-only` e
PATH artificial sem o CLI; nenhuma operação de instalação chegou a executar.

A comparação SHA-256 dos 28 arquivos encontrou sete diferenças de espelho:
`.github/dependabot.yml`, `.github/workflows/ci.yml`, `CHANGELOG.md`,
`docs/evidence/dependency-audit-phase-1.json`,
`docs/evidence/plugin-install-cleanup-fixed.json`, `docs/fase-1.md` e
`docs/reviews/fase-1-rodada-1.md`; quatro destes estavam ausentes no D:.
Não tratei o espelho inteiro como snapshot. Código Rust, Cargo, manifestos,
scripts e testes executados coincidiram com a fonte; docs/CI/evidências foram
lidos na fonte e a CI foi conferida no GitHub pelo SHA exato.

O inventário da fonte contém 46 fixtures rastreáveis nos onze eventos:
SessionStart 4, UserPromptSubmit 4, PreToolUse 12, PostToolUse 6,
PostToolUseFailure 2, PermissionRequest 4, Notification 2, SubagentStart 2,
SubagentStop 2, Stop 2, SessionEnd 6. As duas extras do D: não recebem crédito.
Nesta rodada não repeti o encaminhamento individual das 46 fixtures: o ensaio
da rodada 1 permanece histórico, identificado como tal.

## Verificação independente

- `node --test scripts/verification/*.test.mjs`: 17 passaram, zero falhas,
  skips ou cancelamentos. Inclui o helper de release e a regressão do finally.
- `cargo test --manifest-path app/hook-client/Cargo.toml --locked`: um passou.
- `cargo fmt ... --check` e `cargo clippy ... --locked -- -D warnings`: passaram.
- `claude plugin validate --strict .` e `... plugins/scribe`: passaram.
- `cargo audit --file app/hook-client/Cargo.lock --deny warnings`: código 0,
  31 dependências e 1290 advisories consultados. Sem instalação de ferramenta.
- CLI oficial `claude plugin configure --help` confirma `--values-stdin`.
- [CI do PR 37243344248](https://github.com/rexia-intel-automation/scribe/actions/runs/37243344248)
  e [CI do push 37243340039](https://github.com/rexia-intel-automation/scribe/actions/runs/37243340039):
  ambos completed/success, head_sha 87904647. Conferi os jobs do PR:
  dependency-audit e native-and-plugin Windows/macOS/Ubuntu passaram, inclusive
  instalação do cargo-audit 0.22.2, audit, testes, fmt/clippy, build de release e
  os dois validates. CI de c9af439/27c6741 não foi usada para provar correções.

`plugin-install-cleanup-fixed.json` foi examinado como evidência histórica:
passed/installationPassed true, executionFailed false, cleanupErrors vazio,
modelChecksRun false; sete operações CLI com código zero e SessionStart/
SessionEnd autenticados. O produtor usa stdin, escopo local, workspace
temporário e helper em caminho com espaços (`plugin-install.mjs:119`, `:123`).
Não fiz uma reinstalação real nesta revisão.

`plugin-mcp-partial-1791154606463.json` mostra discovery/initialize/tools/list
automáticos e scribe_report com sessionMatchesHook true. Não mostra pergunta
ou comando completo aprovados. `plugin-limit.json` mostra código 1,
isError true, custo 0 e sinais limit/hit/reset, embora subtype seja success.
Esse resultado continua sendo falha; não concedi crédito por seu subtipo.

## Tentativas deliberadas de quebra

As tentativas 1–12 executaram o helper de release real contra servidor local,
com token artificial. Em todas, código 0 e stdout/stderr vazios. Tempos incluem
criação do processo e são amostras individuais, não p95. As tentativas 13–16
reusaram os testes permanentes originais, também executados nesta rodada.

| # | Ataque | Resultado | Evidência |
| --- | --- | --- | --- |
| 1 | Executável `native & client (spaces).exe`, payload contendo `&`, `$()` e crases | Uma requisição autenticada, 148 ms; texto encaminhado sem execução e resposta allow sem saída | `main.rs:104`; spawn com argumentos separados; caminhos com espaços também na instalação histórica |
| 2 | Argumento Stop e corpo PermissionRequest | Zero requisições, 17 ms | `main.rs:84` |
| 3 | Evento `../PermissionRequest` | Zero requisições, 18 ms | `main.rs:78` |
| 4 | Token contendo CRLF e header artificial | Zero requisições, 19 ms | `main.rs:54` |
| 5 | connection.json com campo URL externo adicional | Zero requisições, 21 ms | `main.rs:24`, `:50` |
| 6 | Porta fracionária 21517.5 | Zero requisições, 18 ms | `main.rs:26`, `:50` |
| 7 | JSON com 200 níveis de arrays | Zero requisições, 20 ms | `main.rs:81` |
| 8 | Payload válido preenchido até exatamente 1 MiB | Uma requisição, 41 ms; sem decisão emitida | `main.rs:69`, `:74` |
| 9 | Mesmo payload com 1 MiB + 1 byte | Zero requisições, 18 ms | `main.rs:74` |
| 10 | Servidor derruba socket após receber o corpo | Uma requisição, 20 ms; saída silenciosa | `main.rs:104` |
| 11 | Servidor recebe corpo e nunca responde | Uma requisição, 275 ms | `main.rs:97` |
| 12 | Stdin não termina, conteúdo parcial `{` | Zero requisições, 275 ms | `main.rs:73` |
| 13 | Redirect 307 + HTTP_PROXY/HTTPS_PROXY/ALL_PROXY/NO_PROXY adversariais | Zero acesso ao servidor armadilha; respostas 503/JSON inválido/allow também ignoradas | `native-client.test.mjs:61`; `main.rs:98`, `:99` |
| 14 | Falhar uninstall, remove, ambos ou escrita do relatório | Cada remoção, fechamento e escrita é tentado; saída 1; erros externos não copiados ao relatório | `plugin-cleanup.test.mjs:14`; `plugin-install.mjs:154` |
| 15 | Host errado, token ausente/incorreto e Origin externo/vazio | Headers rejeitados | `lib.test.mjs`; `lib.mjs:88` |
| 16 | App fechado, input malformado/excessivo e evento desconhecido | Hook termina silenciosamente em menos de 1 s nos testes | `native-client.test.mjs:73`, `:81` |
| 17 | CLI indisponível: PATH artificial sem claude, modo installation-only | Relatório salvo com falha, mas processo ainda vivo após 3000 ms; encerrado pelo revisor | `plugin-install.mjs:85`, `:86`; R2.1 |
| 18 | Extrair run original e injetar erro ENOENT + timers em memória | Timer registrado para 90000 ms, nenhum clearTimeout executado após rejeição | `plugin-install.mjs:73`; R2.1 |

As tentativas 1–12 também configuraram `http_proxy` minúsculo e ALL_PROXY para
127.0.0.1:1. A implementação explicitamente desliga proxy. Nenhum ataque
produziu aprovação, exfiltração ou reinterpretação de comandos pelo helper.
O teste 1 demonstra spawn direto do helper e integridade do payload; não é
uma prova nova da expansão user_config pelo CLI. Essa expansão tem evidência
histórica de instalação e suporte explícito na documentação oficial.

## Achado novo

### R2.1 — médio: timer permanece ativo quando o CLI não pode ser criado

Em `scripts/verification/plugin-install.mjs:85`, run cria um timer de 90 s.
O Promise seguinte rejeita no evento error de child (`:86`). O clearTimeout
está somente depois do await (`:87`); portanto não executa nesse caminho.
O finally externo fecha o servidor e salva result.json, mas não conhece esse
timer. O Node permanece ativo aguardando um timer cujo filho nem foi criado.

Reproduzi executando o script original no D: com `--installation-only`, via
Node absoluto e ambiente filho com PATH apontando para um diretório inexistente
em `.verification`. Após 3000 ms: processo vivo, stderr vazio e result.json
salvo com `passed:false`, `executionFailed:true`, `cleanupErrors:[]`, `cli:[]`,
`modelChecksRun:false`. Encerramento e remoção das temporárias foram feitos
pelo revisor. Como o primeiro inventário não criou o CLI, não houve instalação,
leitura de settings.json ou alteração de configuração do usuário.

Não esperei 90 s para chamar isso de duração observada. A duração do timer é
comprovada pelo código e pela injeção do run original: timers `[90000]`, cleared
`[]`. A reprodução abaixo roda só em memória e não chama o CLI nem modelos:

```js
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
const source = await readFile('scripts/verification/plugin-install.mjs', 'utf8');
const start = source.indexOf('async function run(');
const end = source.indexOf('\n\nlet registered', start);
const timers = [], cleared = [];
function fakeSpawn() {
  const child = new EventEmitter();
  child.stdin = new EventEmitter(); child.stdin.end = () => {};
  child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
  queueMicrotask(() => child.emit('error', Error('PUBLIC ENOENT')));
  return child;
}
const run = new Function('spawn', 'performance', 'setTimeout', 'clearTimeout',
  'sessionSettings', 'workspace', 'connectionFile', 'cli', 'redact', 'console',
  `return (${source.slice(start, end)});`)(fakeSpawn, performance,
    (_fn, ms) => { timers.push(ms); return 1; }, id => cleared.push(id),
    undefined, 'public', 'public', [], () => '', { log() {} });
await assert.rejects(run('marketplace inventory', ['plugin', 'marketplace', 'list']),
  /ENOENT/);
assert.deepEqual(timers, [90000]);
assert.deepEqual(cleared, []); // bug: o recurso não foi cancelado
```

O impacto está no roteiro oficial de verificação/instalação: falha imediata de
PATH/CLI cria uma espera artificial, apesar de já existir resultado de falha.
Não alego uma violação FR-03 do helper Rust ou sessão travada do Claude por
esse problema. Ele é uma falha relevante de liberação de recursos da
instrumentação, contabilizada em E. Os 17 testes verdes não a detectam porque
a nova regressão extrai só o finally, não run.

Correção: cancelar o timer em finally do await de criação/fechamento do filho,
incluindo rejeição por error, e adicionar regressão do run original para falha
de spawn. Preservar a rejeição, o resultado de falha e a independência das
remoções já corrigidas; não contornar por edição de configurações pessoais.

### R2.2 — baixo: porta padrão diverge do PRD sem motivo documentado

`plugins/scribe/.claude-plugin/plugin.json:23` e
`docs/adr/0006-configuration-plugin.md:14` usam 21517; `prompt.md` §5.4 fixa
7717 como padrão. O ADR registra o valor, mas não explica a troca. Consultei
os ADRs e o plano: não encontrei uma justificativa objetiva para 21517.
A instalação de teste usa uma porta temporária explícita, portanto não prova
a compatibilidade entre os padrões do plugin e do futuro servidor.

É baixo nesta fase: ainda não existe servidor de produção e não demonstrei
uma falha de encaminhamento atual por esse valor. A rodada 1 tratou a porta
como parâmetro técnico registrado; mantenho a distinção entre configuração
do esqueleto e bind futuro. Antes de implementar o servidor, alinhar o padrão
do plugin ao 7717 do contrato ou documentar e obter aceite da divergência
conforme a regra 0.8/§17.5. Não rebaixo uma catraca adicional por esse detalhe.

## Correções da rodada 1

- R1: resolvido para o pacote existente. `.github/workflows/ci.yml:11` introduz
  dependency-audit com `--deny warnings`; o job do SHA correto passou.
  `.github/dependabot.yml:3`/`:7` configura Cargo/actions. API confirmou
  dependabot_security_updates, secret_scanning e push protection enabled.
  O YAML de atualizações de versão está no PR: seu processamento na main só
  ocorrerá após merge. Não afirmei que já gerou atualizações.
- R2: o defeito específico de uninstall/remove abortarem todo o finally foi
  corrigido (`plugin-install.mjs:154`). Regressão injeta ambas as falhas e
  falha de escrita sem guardar conteúdo externo. R2.1 é outro caminho: erro
  de spawn deixa recurso de run fora do alcance desse finally.
- R3: resolvido. `docs/fase-1.md:49` distingue repo/PR públicos de site/app
  ainda indisponíveis. PR1 é draft/open e tem head 87904647, base 452ab77.

## Conformidade com fontes primárias

Consultadas em 2026-10-04:

- [Hooks](https://code.claude.com/docs/en/hooks#exec-form-and-shell-form):
  args aciona spawn direto e substituição user_config como string sem shell.
  Os onze eventos utilizados existem; hook silencioso não concede permissão.
- [Manifesto](https://code.claude.com/docs/en/plugins-reference#user-configuration):
  userConfig file/number/string, min/max e sensitive são documentados;
  componentes padrão são carregados sem declaração duplicada. Ambos os
  manifestos passaram o validador oficial estrito.
- [Marketplace](https://code.claude.com/docs/en/plugins/marketplace-reference):
  source relativo à raiz, nome sem reserva e componentes fora de
  .claude-plugin/ são consistentes com os arquivos revisados.
- [Skills](https://code.claude.com/docs/en/skills): CLAUDE_SESSION_ID e
  user-invocable false são documentados. Skill exige resultado real, trata
  timeout como ausência de consentimento e proíbe burlar permissões.

ACL/0600, criação/sincronização dos tokens e launcher do app permanecem
obrigações explícitas das fases seguintes (`adr/0006-configuration-plugin.md:66`).
Nenhuma decisão humana ou lançamento de app recebeu crédito antecipado.

## Notas da catraca

| Área | Nota | Mínimo | Evidência e limite |
| --- | ---: | ---: | --- |
| A — Conformidade | 9 | 9 | Dois validates oficiais estritos; fontes primárias; exec form, configuração sensível e MCP automático histórico. Sem crédito para pergunta/comando completo. |
| B — Correção funcional | 8 | 8 | Esqueleto presente e instalação local histórica concluída; release helper encaminha onze eventos nos testes. UI, FR-04 real e decisões pertencem às fases posteriores. |
| C — Segurança | 8 | 8 | Host fixo, tokens restritos, proxy/redirect desligados, saída allow descartada; audit local e CI passaram, Dependabot configurado. Não equivale à auditoria do futuro servidor/app. |
| D — Robustez/falha segura | 8 | 8 | Ataques ao helper saem silenciosos, inclusive input aberto e servidor travado em 275 ms. R2.1 afeta roteiro e é contabilizado em E; não foi demonstrada falha da sessão/hook. |
| E — Qualidade de código | 7 | 8 | Helper pequeno e transportes claros; finally externo corrigido, mas run não libera timer em error. R2.1 é reproduzível e requer ajuste no tratamento do ciclo do subprocesso. |
| F — Testes | 8 | 7 | 17 Node + 1 Rust verdes, release real, ataques independentes e regressão de cleanup. Falta regressão de spawn error; nenhuma alegação de cobertura de decisões/UI. |
| J — Documentação | 8 | 8 | READMEs, ADR 0006, escopo/fase e evidências distinguem parcial/falha de modelo e estado de publicação. R2.2 pede alinhamento do padrão de porta; site/app finais não exigidos aqui. |
| K — Build/release | 8 | 8 | CI exata verde, três SOs e dependency-audit; instalação local/cleanup oficiais históricos. Não se alega release/instalador Tauri ou Dependabot version updates já processados. |

Nenhuma nota 10. A rodada satisfaz cinco tentativas e a regra contra inflação:
as notas não são todas 9/10; há dois achados novos fundamentados, sem inventar três
problemas para justificar notas elevadas. A revisão anterior permanece
preservada. A catraca E8 continua obrigatória; a Fase 2 aguarda correção e nova
rodada independente.
