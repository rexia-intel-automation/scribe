# Fase 1 — revisão adversarial, rodada 3

Data: 2026-10-04. Revisor independente, sem participação na implementação.
Contrato: `prompt.md` inteiro, especialmente §§8, 10 e 13; diff completo
`452ab77ff76a4cc54423c37a4d3191babd98a1b6..d94398df85d257352290f0374d76d43ba9e96b22`
(32 arquivos), testes, evidências e relatórios das rodadas 1 e 2.
Snapshot avaliado: **d94398df85d257352290f0374d76d43ba9e96b22**.

**Veredito: APROVADA na catraca da Fase 1. A9 B8 C8 D8 E8 F8 J8 K8.**
R2.1 foi corrigido e reproduzido independentemente; R2.2 também foi resolvido.
Não encontrei novo problema crítico, alto, médio ou baixo demonstrável neste
snapshot. Todas as notas atingem os mínimos originais. A aprovação cobre o
esqueleto instalável da tabela 13.3; não declara pronta a v0.1 nem valida
decisões humanas, GUI ou instaladores do app.

## Escopo e isolamento

Li marketplace, manifesto, onze hooks, MCP, skill, comando, cliente Rust,
lockfile, gerador dos hooks, CI/Dependabot, documentação e evidências novas.
Também examinei os caminhos de execução/limpeza do roteiro de instalação.
Os relatórios anteriores foram preservados. Apenas este relatório foi escrito
na fonte do OneDrive. Builds, testes, servidor local, aplicativo simulado e
temporárias rodaram em `D:\RexIA\projetos\scribe`.

A comparação SHA-256 dos **120 arquivos rastreados** do snapshot com o D:
encontrou zero diferenças/ausências. O D: contém duas fixtures históricas extras
não publicadas. Executar o auditor no runtime inteiro apontou exatamente essas
duas extras; não atribuí essa falha ao snapshot. Copiei somente fixtures e
evidências rastreadas para uma temporária no D: e executei os verificadores
nesse conjunto: **46 fixtures**, todos os onze eventos, `changedFiles:0`.
Não reescrevi as extras nem os artefatos originais.

Não chamei modelos, instalei ferramentas ou alterei configurações pessoais.
Os únicos comandos reais do Claude desta revisão foram os validates estritos
e `plugin configure --help`. A reprodução do roteiro com PATH artificial
não encontrou o CLI na primeira operação de inventário: nenhum comando de
instalação/configuração chegou a executar. Temporárias próprias foram removidas
depois de conferir seus caminhos absolutos dentro de `.verification` no D:.

G/H/I não são avaliados na Fase 1. O servidor de produção, estados, UI,
decisões, ACL/0600, sincronização de tokens e launcher final permanecem nas
fases correspondentes. A regra FR-03 foi examinada no cliente observador atual;
não extrapolei seus resultados para o futuro hook que aguardará decisões.

## Verificação e CI do SHA exato

- `node --test scripts/verification/*.test.mjs`: **18 passaram**, sem falhas,
  cancelamentos ou skips. Inclui regressões do `run` e do `finally` originais.
- `cargo fmt --manifest-path app/hook-client/Cargo.toml --check`,
  `cargo clippy ... --locked -- -D warnings`, `cargo test ... --locked`:
  passaram; **um teste Rust**. Build release com `--locked` também passou.
- Após recompilar o release, encaminhei individualmente as **46 fixtures
  publicadas**: 46 requisições autenticadas, código zero e stdout/stderr vazios;
  maior duração observada **107 ms**. São amostras, não p95.
- Reexecutei os quatro testes de native-client/process/cleanup após o build:
  quatro passaram. Essa repetição vincula o ensaio ao release recompilado.
- `cargo audit --file app/hook-client/Cargo.lock --deny warnings`: código zero,
  **31 dependências**, **1290 advisories** carregados. Sem instalar ferramenta.
- `claude plugin validate --strict .` e `... plugins/scribe`: passaram.
  O help oficial confirma `--values-stdin`.
- `check-fixtures.mjs` e `audit-evidence.mjs` sobre a cópia dos arquivos
  rastreados: passaram. Distribuição: SessionStart 4, UserPromptSubmit 4,
  PreToolUse 12, PostToolUse 6, PostToolUseFailure 2, PermissionRequest 4,
  Notification 2, SubagentStart 2, SubagentStop 2, Stop 2, SessionEnd 6.

Conferi `gh run list --commit d94398df85d257352290f0374d76d43ba9e96b22`
e `gh run view` para os dois runs:

- [PR 37244077444](https://github.com/rexia-intel-automation/scribe/actions/runs/37244077444):
  completed/success, headSha **d94398d**.
- [Push 37244075077](https://github.com/rexia-intel-automation/scribe/actions/runs/37244075077):
  completed/success, headSha **d94398d**.

Em ambos, dependency-audit e native-and-plugin Windows/macOS/Ubuntu passaram.
Nenhum step retornou conclusão diferente de success. Isso inclui audit,
fmt/clippy, teste Rust, build release, Node, gates de fixtures/evidências e
os dois validates oficiais. O push ainda estava em execução na primeira
consulta; confirmei sua conclusão posteriormente. Não usei CI de 87904647
ou c9af439 como prova do HEAD novo. PR 1 permanece draft/open, head d94398d,
base 452ab77. Não houve merge nesta revisão.

A API do repositório público confirmou dependabot_security_updates,
secret_scanning e secret_scanning_push_protection enabled. O arquivo de
atualizações de versões para Cargo/actions está no PR; sua presença não
prova processamento do Dependabot na main antes do merge.

## Tentativas deliberadas de quebra

Os tempos abaixo incluem criação do processo e são medições individuais.
Os testes efêmeros usaram token e texto públicos artificiais. Casos de hook
encerraram com código zero e saída vazia; `--open` inválido retornou código 1.

| # | Tentativa | Resultado e evidência |
| --- | --- | --- |
| 1 | Falha real de spawn do CLI, PATH apontando para diretório inexistente, roteiro original com `--installation-only` | Código 1 em **231 ms**, relatório salvo: passed/installationPassed false, executionFailed true, cleanupErrors vazio, cli/events/calls vazios, modelChecksRun false. `plugin-install.mjs:85`–`:90` libera timer na rejeição. |
| 2 | Runner original com executável inexistente, fechamento normal e timeout acelerado | Regressão executada: em cada modo active.size zero e um clearTimeout; erro ENOENT preservado e timeout rejeitado. `plugin-process.test.mjs:7`, `:24`, `:34`. Não esperei 90 s nem aleguei essa duração como medida. |
| 3 | Finally original: uninstall falha, remove falha, ambos falham e escrita falha | Teste permanente passou: removals, fechamento e escrita tentados independentemente; saída 1, passed false e erros externos omitidos. `plugin-cleanup.test.mjs:12`, `:25`; `plugin-install.mjs:157`. |
| 4 | Finally original: ambas as remoções e o efeito de fechamento falham simultaneamente | Injeção adicional registrou efeitos uninstall/remove/close/write, cleanupErrors com os três rótulos, saída 1 e passed false; marcador do erro não apareceu no JSON. A escrita continuou após os efeitos anteriores. `plugin-install.mjs:159`, `:166`, `:170`. |
| 5 | Helper em `native & client (spaces).exe` e payload com `&`, `$()` e crases | Uma requisição, corpo idêntico ao enviado, resposta allow descartada, saída vazia, **129 ms**. Spawn direto; `main.rs:104`; `hooks/hooks.json:7`. Não atribuo este ensaio à substituição user_config pelo CLI. |
| 6 | Argumento Stop com corpo PermissionRequest; argumento extra no hook; `--open --hook` | Zero requisições, saída vazia, **18–20 ms**. Validação de evento e seleção estrita de modo; `main.rs:84`, `:130`, `:136`. |
| 7 | Token com CRLF, campo URL externo desconhecido, porta fracionária | Zero requisições, saída vazia, **18–23 ms**. Token restrito, serde deny_unknown_fields e port u16; `main.rs:24`, `:26`, `:50`. |
| 8 | SCRIBE_CONNECTION_FILE relativo | Zero requisições e saída vazia, **16 ms**; override recusado. `main.rs:33`–`:37`. |
| 9 | `--open` sem app_path, app relativo, diretório e arquivo ausente | Código 1, sem stdout/stderr e zero requisições, **20–23 ms**. `main.rs:111`, `:115`, `:131`. |
| 10 | `--open` com aplicativo Rust inofensivo em `mock & app (spaces).exe` | Código 0 em **124 ms**; aplicativo escreveu argv contendo **somente `--show`**. Caminho preservado sem shell. `main.rs:118`–`:125`. Não é teste de GUI/foco ou de instância existente. |
| 11 | Servidor travado, redirect 307, HTTP 503, JSON inválido e allow com proxies adversariais | Teste de release passou; zero chamadas ao servidor armadilha, nenhuma saída/decisão e cada processo abaixo de 1 s. `native-client.test.mjs:61`; `main.rs:97`–`:99`. |
| 12 | App fechado, stdin aberto, input excessivo/malformado, evento desconhecido e session_id numérico | Testes de release passaram silenciosamente em menos de 1 s. `native-client.test.mjs:73`, `:81`; `main.rs:65`–`:90`. |
| 13 | Host incorreto, ausência/erro de token, Origin externo e Origin vazio | Casos permanentes passaram rejeitando headers; transporte da sonda não aceita navegador. `lib.test.mjs`, `lib.mjs:88`. Isso não audita o futuro servidor de produção. |
| 14 | Deriva entre onze eventos/args, componente duplicado, token em argv e porta fora do contrato | Asserções adicionais passaram: chaves iguais a EVENTS, cada args exatamente `['--hook', evento]`, sem token; timeout 130 para PermissionRequest e 1 para outros, port.default 7717, MCP em loopback/header, sem hooks/mcpServers duplicados no manifesto. `hooks/hooks.json:7`, `plugin.json:23`, `.mcp.json:5`, `marketplace.json:9`. |
| 15 | Contratos reais sanitizados com variedade dos onze eventos | Todos os 46 corpos foram aceitos pelo release e recebidos na rota correspondente com bearer correto; sem decisão ou saída. `main.rs:78`, `:104`; inventário rastreado da Fase 0. |

O caso 4 testa a continuação para salvar o relatório quando o efeito de
fechamento rejeita; não prova que um servidor impossível de fechar esteja
fechado. Os casos de falha de escrita não prometem JSON salvo quando a própria
escrita falha: o comportamento verificado é código 1 e continuidade dos efeitos
anteriores. Essas distinções evitam dar crédito além do teste realizado.

## Correções e evidências históricas

**R2.1 resolvido:** `run` agora tem clearTimeout em finally do await de
error/close (`plugin-install.mjs:87`–`:90`). A regressão extrai o corpo da
função original; não é uma cópia reimplementada do algoritmo. Além do teste,
a reprodução independente do roteiro inteiro terminou sem a retenção de
processo observada na rodada 2. A evidência publicada
`plugin-spawn-failure-fixed.json` é consistente com a reprodução: resultado
false, execução falha e nenhum modelo.

**R2.2 resolvido:** `plugin.json:23` e `adr/0006-configuration-plugin.md:14`
usam **7717**, conforme `prompt.md` §5.4. Não resta a divergência 21517 no
padrão do plugin. Portas temporárias ou artificiais em testes não são defaults
do produto.

As correções da rodada 1 permanecem: auditoria/Dependabot no pacote existente,
limpeza independente e documentação distinguindo repo público de app/site
indisponíveis. `docs/evidence/plugin-install-spawn-fixed.json:3` registra nova
instalação local sem modelo, sete operações CLI com código zero, lifecycle
SessionStart/SessionEnd autenticado e cleanupErrors vazio. Examinei essa
evidência e seu produtor (`plugin-install.mjs:117`–`:132`); não executei outra
instalação real nesta revisão nem declarei instalação limpa numa máquina nova.

`plugin-mcp-partial-1791154606463.json` comprova historicamente descoberta,
initialize/tools/list e scribe_report com sessionMatchesHook true. O resultado
geral é false. `plugin-limit.json` registra isError true, código 1 e custo zero,
apesar do subtipo success. Nenhum deles recebe crédito de pergunta/comando
completo aprovado. O limite da conta continua respeitado, sem novas chamadas.

## Conformidade com fontes primárias

Consultadas em 2026-10-04:

- [Hooks](https://code.claude.com/docs/en/hooks#exec-form-and-shell-form):
  presença de args aciona spawn direto; user_config é substituído como string
  sem shell. Os onze eventos utilizados constam da referência.
- [Manifesto](https://code.claude.com/docs/en/plugins-reference#user-configuration):
  userConfig e seus campos/tipos, opções sensíveis, componentes padrão e
  validador estrito suportam a configuração examinada.
- [Marketplace](https://code.claude.com/docs/en/plugins/marketplace-reference#relative-path-plugin-source):
  source relativo à raiz é consistente com `./plugins/scribe`; componentes
  permanecem fora de `.claude-plugin/`.
- [Skills](https://code.claude.com/docs/en/skills): CLAUDE_SESSION_ID,
  user-invocable false e disable-model-invocation true são documentados.
  `skills/scribe/SKILL.md:7`, `:20`, `:25` exige ID/resultados reais, não
  interpreta timeout como consentimento e proíbe contornar permissões.
  `commands/scribe.md:6`, `:16`, `:24` orienta execução concreta com quoting,
  evita ler tokens e exige resultado antes de afirmar abertura.

A combinação de fontes oficiais, validação CLI e instalação histórica dá
suporte à conformidade do esqueleto. Ainda falta o teste de `/scribe` em turno
real e com o app final; não atribuí esse sucesso à análise textual do comando
ou ao aplicativo simulado.

## Notas da catraca

| Área | Nota | Mínimo | Evidência e limite |
| --- | ---: | ---: | --- |
| A — Conformidade Claude Code | 9 | 9 | Validates oficiais estritos, fontes primárias, hooks exec form, MCP histórico automático e report correlacionado. Manifestos/skill/comando consistentes. Sem crédito antecipado para pergunta/comando completo. |
| B — Correção funcional | 8 | 8 | Entregáveis de 13.3 presentes; instalação local registrada em plugin-install-spawn-fixed.json:3; 46 fixtures autenticadas no release. `main.rs:111` validado com mock. UI/decisões/FR-04 real aguardam fases próprias. |
| C — Segurança | 8 | 8 | `main.rs:50`, `:98`, `:104`: token restrito, host fixo, proxy/redirect desligados e resposta descartada. Ataques 5/7/11/13/14 contidos; audit e CI atuais verdes, mecanismos públicos de varredura enabled. Não é auditoria do app final. |
| D — Robustez/falha segura | 8 | 8 | Stdin/HTTP limitados a 250 ms em `main.rs:73`, `:97`; ataques a app ausente/travado e payload inválido passam abaixo de 1 s. CLI ausente terminou em 231 ms e preservou falha. Sem comprovação do fluxo futuro que espera decisão. |
| E — Qualidade de código | 8 | 8 | `plugin-install.mjs:87`, `:159`: recursos liberados em error/close, efeitos de limpeza independentes, erro preservado. Regressores originais e reprodução adicional passam; fmt/clippy verdes. Não há nota 9 por um ajuste pontual nem por cobertura só do esqueleto. |
| F — Testes | 8 | 7 | 18 Node + 1 Rust, CI três SOs, 46 fixtures no release e quinze tentativas enumeradas. `plugin-process.test.mjs:34` detecta timer residual. Testes permanentes ainda não cobrem os modos --open examinados efemeramente; UI/decisões não existem. |
| J — Documentação | 8 | 8 | READMEs bilíngues, ADR 0006:14/29/45/64, fase-1.md e evidências distinguem instalação, observação, falha de modelo e limitações. Porta alinhada. Site e documentação final de instalação pertencem à Fase 6. |
| K — Build/release | 8 | 8 | Build local --locked, lockfile, audit, dois validates e CI **d94398d** verdes em push/PR, três SOs. Instalação histórica sem modelo revisada. Não há release desktop/checksums/instalador ou teste em computador novo aprovado. |

Nenhuma nota 10. As notas não são todas 9/10: portanto esta rodada com zero
achados novos não viola §13.1.7. Não forcei problemas para justificar a catraca.
A aprovação permite prosseguir à Fase 2, mantendo as obrigações e revisões das
fases seguintes; não reduz qualquer mínimo nem substitui o ritual de fim de fase.
