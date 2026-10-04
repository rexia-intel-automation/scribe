# Fase 1 — revisão adversarial, rodada 1

Data: 2026-10-04. Revisor independente, sem participação na implementação.
Contrato: `prompt.md` completo, em especial §§8.6, 10 e 13.
Diff revisado: `452ab77..c9af439` (23 arquivos); HEAD examinado:
`c9af4395e3677ae88076ae77579e3714c0dc39e2`.

**Veredito: REPROVADA. A9 B8 C7 D8 E7 F8 J8 K7.**
Os mínimos C8, E8 e K8 não foram atingidos. Há dois achados médios e um
baixo novos; não foi demonstrado problema crítico ou alto. A instalação do
esqueleto funciona, mas o CI verde não cobre toda a verificação obrigatória
das dependências já introduzidas, e a limpeza do teste não resiste à falha de
um comando oficial. Corrigir e realizar outra rodada independente; preservar
este relatório e os anteriores.

## Escopo e limites

Nesta fase avaliei marketplace, manifesto, onze hooks exec form, configuração
MCP, skill, comando, helper Rust, instrumentação nova, documentação e CI.
Não exigi UI, servidor de produção, resposta humana, assinatura ou instalador
final da v0.1 para aprovar o esqueleto da tabela 13.3. FR-04 com app real
continua nas fases de app/decisões; nenhum lançamento real recebeu crédito.
O plano `docs/plano-v0.1.md:20` menciona FR-01 a FR-05; esta revisão não
declara esses requisitos integralmente concluídos por existir o esqueleto.

Fonte no OneDrive; testes, processos e servidores somente em
`D:\RexIA\projetos\scribe`. Os 23 arquivos do diff coincidiram por SHA-256
entre fonte e runtime. Só as 46 fixtures da fonte receberam crédito; as duas
extras do runtime foram excluídas. HTML, ZIP e MP4 pessoais não foram usados.
Não invoquei modelos, reinstalei plugins, instalei ferramentas ou alterei
configuração do usuário. O ataque à limpeza executou o bloco original com
todos os efeitos externos substituídos por funções em memória.

O achado baixo R1 da Fase 0, idempotência da sanitização histórica, permanece
registrado em `fase-0-rodada-5.md`; o histórico não foi reescrito. Ele não é
uma nova falha do cliente desta fase.

## Evidências conferidas

- `node --test scripts/verification/*.test.mjs`: 16 testes, todos passaram,
  sem skips/cancelamentos. Dois testes novos exercitam o executável de release,
  incluindo onze eventos, resposta allow, proxies, redirects, HTTP 503, JSON
  inválido, porta fechada, excesso de input e stdin inacabado.
- `cargo test --manifest-path app/hook-client/Cargo.toml --locked`: um teste
  passou. A validação do payload rejeita eventos desconhecidos e discrepantes.
- `claude plugin validate --strict .` e `claude plugin validate --strict
  plugins/scribe`: ambos passaram. Não foi necessário chamar um modelo.
- Inventário de fixtures, apontando explicitamente para a fonte: contagens
  4/4/12/6/2/4/2/2/2/2/6 nos onze eventos. Auditoria da fonte:
  `{"rewrite":false,"changedFiles":0}`. Não confundir essa auditoria de
  evidência com auditoria de vulnerabilidades das dependências.
- `plugin-install-1791154960668.json`: `passed:true`,
  `installationPassed:true`, `modelChecksRun:false`, sete operações CLI com
  código zero e hooks SessionStart/SessionEnd autenticados. O produtor usa
  caminho com espaços, token artificial por stdin e limpeza pelo CLI oficial
  (`plugin-install.mjs:119`, `:122`, `:150`). Esta é evidência histórica
  examinada, não uma reinstalação feita pelo revisor.
- `plugin-mcp-partial-1791154606463.json`: descoberta automática, initialize,
  tools/list e chamadas scribe_report autenticadas, correlacionadas ao hook;
  execução completa saiu com código 1. Não há chamada scribe_ask ou prova do
  comando completo nesse artefato.
- `plugin-limit.json`: resultado `isError:true`, custo zero, sinais
  limit/hit/reset e código 1. Não recebeu crédito de sucesso. A prova MCP da
  Fase 0 carregava configuração explicitamente e não substitui uma chamada
  de pergunta pelo plugin instalado nesta fase.
- [CI 37242475811](https://github.com/rexia-intel-automation/scribe/actions/runs/37242475811):
  consulta read-only confirmou HEAD c9af439, estado completed e conclusion
  success, com Windows, macOS e Ubuntu 22.04 success. Cada job construiu o
  helper de release e executou testes/validações. Isso não comprova app Tauri,
  instaladores ou release final e não executa cargo audit.

## Tentativas deliberadas de quebra

Executei o helper de release como processo real, contra um servidor Node local
controlado, com configuração/token exclusivamente artificiais. Em todos os
casos de hook abaixo stdout e stderr ficaram vazios. Tempos são amostras
individuais incluindo criação do processo, não p95. As temporárias ficaram
sob `.verification/review-phase1-*` no D: e foram removidas após verificar o
alvo absoluto de limpeza. O servidor foi encerrado ao final.

| # | Tentativa | Resultado efetivo | Código examinado |
| --- | --- | --- | --- |
| 1 | Argumento Stop com corpo PermissionRequest | Código 0, 28 ms, zero requisições | `app/hook-client/src/main.rs:77`, `:84` |
| 2 | Evento `../PermissionRequest` | Código 0, 18 ms, zero requisições; sem construção de rota para o valor | `main.rs:78` |
| 3 | Raiz JSON null | Código 0, 16 ms, zero requisições | `main.rs:81`, `:84` |
| 4 | session_id vazio | Código 0, 16 ms, zero requisições | `main.rs:89` |
| 5 | session_id com 257 bytes | Código 0, 18 ms, zero requisições | `main.rs:89` |
| 6 | Token artificial contendo CRLF e header adicional | Código 0, 20 ms, zero requisições | `main.rs:48`, `:55` |
| 7 | Campo url externo desconhecido em connection.json | Código 0, 31 ms, zero requisições | `main.rs:24`, `:46` |
| 8 | Porta fracionária 21517.5 no arquivo do helper | Código 0, 31 ms, zero requisições | `main.rs:26`, `:46` |
| 9 | Configuração maior que 8192 bytes | Código 0, 16 ms, zero requisições | `main.rs:43` |
| 10 | Override SCRIBE_CONNECTION_FILE relativo | Código 0, 21 ms, zero requisições | `main.rs:35` |
| 11 | Arquivo de configuração inexistente | Código 0, 20 ms, zero requisições | `main.rs:43` |
| 12 | `--open` sem app_path | Código 1, 42 ms, saídas vazias; não afirma abertura | `main.rs:115`, `:135` |
| 13 | Argumento adicional inesperado | Código 0, 36 ms, saídas vazias | `main.rs:140` |
| 14 | Servidor devolve PermissionRequest behavior allow | Uma requisição autenticada, código 0, 38 ms; nenhum JSON/decisão emitido | `main.rs:93`, `:104` |
| 15 | Servidor recebe corpo e nunca responde | Uma requisição, código 0, 274 ms | `main.rs:98` |
| 16 | Servidor inicia corpo JSON parcial e nunca o termina | Uma requisição, código 0, 26 ms; corpo descartado | `main.rs:106` |
| 17 | Stdin só encerra após 220 ms, seguido por HTTP travado | Código 0, 510 ms; ambas as esperas continuam abaixo de 1 s | `main.rs:73`, `:98` |
| 18 | Stdin permanece aberto | Código 0, 285 ms, saídas vazias | `main.rs:73` |
| 19 | Encaminhar todas as 46 fixtures reais anonimizadas da fonte | 46 requisições, cada uma com Bearer correto e rota igual ao evento do corpo; zero rejeições | `main.rs:77`; `app/src-tauri/tests/fixtures/hooks/` |
| 20 | Primeiro comando oficial de cleanup falha | Apenas uninstall é tentado; remove, close e write result não são executados. Achado R2 | `scripts/verification/plugin-install.mjs:149` |
| 21 | Conferir se CI verde equivale aos audits exigidos | Todos os jobs verdes; cargo audit e configuração Dependabot ausentes. Achado R1 | `.github/workflows/ci.yml:25`, `:31`, `:35`; `prompt.md:423` |

As tentativas 1–18 somam 18 cenários de processo; a 19 acrescenta 46 processos
com fixtures. Os testes permanentes também confirmaram zero requisições ao
destino de redirect/proxy (`native-client.test.mjs:61`, `:65`). Nenhuma dessas
tentativas produziu uma aprovação. O caso 12 testa apenas a falha do helper;
não comprova o texto de fallback de `/scribe` num turno Claude.

## Achados novos

### R1 — médio: dependências reais sem auditoria de vulnerabilidades no CI nem atualização configurada

`app/hook-client/Cargo.toml:8` introduz dependências de produção; o lockfile
está versionado e os builds usam `--locked`. Porém o CI termina com testes,
auditoria de evidências e validação dos manifestos
(`.github/workflows/ci.yml:25–35`). Não há cargo audit. `audit-evidence.mjs`
é um verificador de anonimização, não consulta advisories Rust. O inventário
de `.github/` contém somente workflows/ci.yml e não contém dependabot.yml.

Isso deixa descobertas de advisories e atualizações de dependências fora da
catraca apesar da exigência explícita de `prompt.md:423` e `:482`. Alertas e
varredura de segredos do GitHub, mesmo habilitados, não substituem a execução
de cargo audit nem a configuração de atualizações do pacote Cargo.
Não afirmo uma vulnerabilidade conhecida ou explorada: o achado é a ausência
do controle obrigatório para dependências que já existem. Auditorias npm do
futuro frontend não são exigidas nesta rodada, pois ainda não há esse pacote.

Correção: adicionar auditoria do lockfile Rust ao CI e configurar Dependabot
para o pacote Cargo existente (e ações utilizadas); comprovar execução verde
no commit corrigido. Esta lacuna é atual, não depende de um app futuro.

### R2 — médio: falha no uninstall impede as demais limpezas e a evidência do teste

O finally chama uninstall e remove sequencialmente com `await run`, antes de
fechar o servidor ou salvar result.json (`plugin-install.mjs:149–154`).
`run` lança erro quando o CLI retorna código não zero (`:109`). Assim, uma
falha de uninstall deixa a remoção do marketplace sem tentativa, o servidor
aberto e o resultado sem registro. Uma falha de remove também impede close
e escrita. O servidor ainda ativo pode manter o processo do teste aberto.

Reproduzi extraindo e executando o bloco original, com installed/registered
true e efeitos externos simulados. O primeiro run lança erro artificial;
assertivas confirmaram que só `uninstall probe plugin` foi executado.
Nenhuma instalação ou credencial real foi tocada nesse ataque.

Reprodução em memória, a partir do runtime D:, sem executar o CLI:

```js
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source = await readFile('scripts/verification/plugin-install.mjs', 'utf8');
const body = source.match(/\} finally \{([\s\S]+?)\n\}\nconsole\.log/)[1];
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const cleanup = new AsyncFunction('installed', 'registered', 'run', 'server',
  'writeFile', 'join', 'root', 'runId', 'passed', 'installationPassed',
  'process', 'cli', 'events', 'calls', body);
const calls = [];
await assert.rejects(cleanup(true, true, async label => {
  calls.push(label); throw Error('PUBLIC SYNTHETIC cleanup failure');
}, { closeAllConnections() { calls.push('close'); }, close() {} },
async () => calls.push('write'), (...parts) => parts.join('/'),
'public', 'public', false, false, { argv: [] }, [], [], []));
assert.deepEqual(calls, ['uninstall probe plugin']);
```

Correção: tentar cada cleanup oficial independentemente, fechar o servidor
e registrar os erros mesmo quando uma limpeza falha, preservando o erro e
código de saída da execução. Adicionar regressão com falha de uninstall e
remove; não editar configurações pessoais diretamente para contornar o CLI.
O caminho feliz histórico continua válido, mas não prova este caminho de falha.

### R3 — baixo: estado de publicação desatualizado

`docs/fase-1.md:48` diz que o repositório/site ainda não foram publicados.
O repositório público e o run de CI já existem. A frase mistura um fato que
mudou com a indisponibilidade do site/app. Atualizar cada estado separadamente,
mantendo claro que não existe release desktop pronta. Não penalizei a ausência
do site de documentação final, pertencente à Fase 6.

## Conformidade e documentação oficial

Fontes primárias consultadas em 2026-10-04:

- [Hooks](https://code.claude.com/docs/en/hooks#exec-form-and-shell-form):
  os onze eventos existem; args ativa spawn direto e substituição user_config
  sem shell. O manifesto usa executável real, caminho separado dos argumentos
  e não expõe token em argv (`hooks/hooks.json:7`).
- [Manifestos](https://code.claude.com/docs/en/plugins-reference): userConfig
  sensível, validação estrita e carregamento dos arquivos padrão são
  documentados. O plugin utiliza esses mecanismos e ambos os validate passaram.
- [Marketplace](https://code.claude.com/docs/en/plugins/marketplace-reference):
  source é relativo à raiz e o nome utilizado não é reservado. A entrada não
  duplica os hooks (`.claude-plugin/marketplace.json:9`).
- [Skills](https://code.claude.com/docs/en/skills): o comando aceita os campos
  de frontmatter utilizados; CLAUDE_SESSION_ID e user-invocable false são
  documentados. A skill correlaciona sessão e diz explicitamente que timeout
  não é consentimento (`plugins/scribe/skills/scribe/SKILL.md:7`, `:20`).

O texto do comando usa um helper concreto e exige sucesso antes de afirmar
abertura (`commands/scribe.md:6`, `:24`). Falta validar o comportamento num
turno real e o app não existe; nenhum destes resultados foi inventado.
O token do helper vem de arquivo local e o token MCP da configuração oficial;
o app ainda deverá criar/sincronizar esses valores com ACL/0600. A porta
21517 está registrada no ADR 0006; o valor configurável foi examinado como
parte do esqueleto, não como bind do futuro servidor de produção.

## Notas da catraca

G/H/I não se aplicam à Fase 1. Nenhuma nota 10. As notas mantêm os mínimos
originais; reprovação não altera o contrato.

| Área | Nota | Mínimo | Evidência e limite |
| --- | ---: | ---: | --- |
| A — Conformidade Claude Code | 9 | 9 | Fontes oficiais, validate estrito nos dois manifestos, hooks exec form, MCP descoberto automaticamente, report correlacionado; não se alega pergunta/comando completo. |
| B — Correção funcional | 8 | 8 | Entregáveis do esqueleto presentes; instalação local real com stdin e eventos autenticados; 46 fixtures passaram pelo release. UI/decisões e FR-04 real aguardam fases próprias. |
| C — Segurança | 7 | 8 | Host HTTP fixo, proxy/redirect desligados, token validado, allow descartado (`main.rs:48`, `:98`, `:106`); R1 impede considerar completo o controle de cadeia de suprimentos de §8.6. Nenhum ataque demonstrou vazamento/aprovação. |
| D — Robustez e falha segura | 8 | 8 | Cliente de produção silencioso em erros e esperas, máximo observado 510 ms; budgets em `main.rs:73` e `:98`. R2 afeta a instrumentação e é contabilizado em E; não foi demonstrada quebra do fluxo de hook. |
| E — Qualidade de código | 7 | 8 | Helper pequeno, serde estrito e HTTP mantido; erro de cleanup reproduzido no finally `plugin-install.mjs:149` impede encerramento e relatório. Requer tratamento independente dos efeitos já iniciados. |
| F — Testes | 8 | 7 | 16 testes Node e 1 Rust verdes, testes do release, 21 tentativas/verificações documentadas; falta regressão permanente do cleanup R2. Não se alega cobertura de decisões/UI. |
| J — Documentação | 8 | 8 | READMEs bilíngues, ADR 0006, fase/evidências e changelog registram escopo e limite de uso; R3 baixo no estado de publicação. Sem crédito para site e instalação final ainda inexistentes. |
| K — Build e release | 7 | 8 | CI do HEAD verde em três SOs com build release, lockfile e validação CLI; instalação local examinada. R1: não executa cargo audit e não configura Dependabot para pacote existente; não se exige release desktop nesta fase. |

A rodada cumpre o mínimo de cinco tentativas e a regra contra inflação:
notas não são todas 9/10, achados têm localização/reprodução e não foram
escondidos pela disponibilidade parcial dos testes. O limite de uso do Claude
permanece uma limitação de evidência; não foi usado como motivo para aprovar
ou para exigir chamadas proibidas de modelo. A Fase 2 aguarda nova catraca
da Fase 1 após R1/R2 e confirmação do CI do commit corrigido.
