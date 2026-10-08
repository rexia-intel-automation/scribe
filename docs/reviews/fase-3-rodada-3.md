# Fase 3 — revisão adversarial independente, rodada 3

Data: 2026-10-06. **Veredito: REPROVADA.** G e H ficam em **8**, abaixo da mínima **9**. Há três problemas baixos confirmados, nenhum crítico ou alto encontrado nesta rodada. A avaliação visual humana e o arraste físico continuam sem aceite; CI do candidato ainda estava em andamento na consulta final. Não avançar à Fase 4.

## Escopo e método

Revisor independente, sem participação na implementação. Li `prompt.md` inteiro, o diff da base **824c4ce8f687620d41f568cce4564a5f8bbce902** ao candidato congelado **b26bc89878c24c466a42a38a6257b6b62d26895b**, testes e artefatos de `docs/evidence`, `docs/public/phase-3`, `docs/fase-3.md` e ADR 0008. PR [#5](https://github.com/rexia-intel-automation/scribe/pull/5). As referências de código abaixo pertencem a esse candidato. Relatórios das rodadas 1 e 2 são históricos e foram preservados, incluindo seus vereditos.

Executei diretamente, sem delegação. Node/Rust e todos os harnesses rodaram somente em `D:/RexIA/projetos/scribe`, por PowerShell 7; fixtures oficiais vieram de `SCRIBE_TEST_FIXTURES_ROOT` na fonte. Conferi hashes idênticos entre fonte/D de oito arquivos relevantes: App, renderer, seus testes, E2E, desktop, lib e store. A escrita versionável foi limitada a este relatório; harnesses e logs novos estão em **`D:/RexIA/projetos/scribe/app/.artifacts/phase-3-review-3`**. Não fiz commit, push, merge, mudança de produto ou reescrita dos relatórios anteriores.

A janela de produção isolada foi o `scribe.exe` em D, PID **22072**, `http://tauri.localhost/`. Li a skill Computer Use, guidance, confirmações e API antes de usar `node_repl` + `@oai/sky`. Observei, parei, fiz uma ação e atualizei a observação. CDP 9223 usou `noDefaults:true` exclusivamente para leitura de DOM/axe; desconexão por encerramento do cliente, nunca `browser.close()`. Inputs de hook são públicos e sintéticos, sem sessões pessoais, decisões humanas simuladas ou saída de token/configuração privada. Não cliquei em apagar histórico, não parei nem recompilei a aplicação nativa.

Cartões, notificações de decisões, responder permissões/perguntas, instaladores e sessões reais de Claude permanecem nas fases seguintes. Sua ausência não foi tratada como defeito da Fase 3. K não é pontuada nesta fase; CI verde continua exigido por §13.4.

## Notas e catraca

| Área | Nota / mínima | Evidência e fundamento |
| --- | --- | --- |
| A — Claude Code | **8 / 8** | Manifestos/hooks/MCP aprovados não mudaram no diff. Os 21 testes `core` passaram com fixtures oficiais; PermissionRequest público retornou 204 sem decisão, e não há controles de permitir/negar na janela. `desktop.rs:265–284` publica sessões sanitizadas, sem credenciais. Conferi a referência oficial de hooks; não usei novos payloads reais de Claude nesta rodada. |
| B — Correção funcional | **8 / 8** | Os 22 Vitest de produto e seis E2E passaram; lista, origem, oito passos, idiomas/temas e modal têm cobertura. Produção abriu/recolheu por controles e teclado em 372×784/56×56. P1 prejudica continuidade do teclado, mas Tab recupera o controle. Arraste físico/snap/persistência por mouse não foi comprovado; não recebe aprovação implícita. |
| C — Segurança | **8 / 8** | `desktop.rs:239–254`, CSP e capability restringem navegação/IPC; tokens ficam no Rust. Testes Rust e cinco tentativas HTTP nativas resistiram, incluindo credencial de hook sem acesso ao estado da UI. XSS público permaneceu texto no harness. P3 deixa uma lacuna pequena na auditoria contínua de dependências; npm audit local teve zero vulnerabilidades. Exceções GTK continuam explicitamente avaliadas, sem alegação de crate corrigido. |
| D — Robustez/falha segura | **8 / 8** | Revisão duplicada não ressuscitou sessão removida; snapshot antigo não apagou erro nativo no harness novo. Transação e rollback SQL em `tests/policies.rs:20–68` passaram. Artefatos `desktop-collapsed-error.json` e `desktop-shortcut-recovery.json` mostram falha específica/recuperação corrigidas; não repeti a injeção readonly nesta rodada. Não houve erro residual ou bloqueio do hook observado. |
| E — Qualidade de código | **8 / 8** | Fronteira Rust/UI, scheduler compartilhado, cleanup de listeners e preferências validadas são claros; lint, format e build passaram. P2 é uma condição localizada de agendamento de piscada, sem necessidade de refatoração ampla. `Gota.tsx:21–31` libera o renderer e `bridge.ts:26–44` libera o listener. |
| F — Testes | **8 / 8** | Reexecutei 28 Rust, 22 Vitest de produto e seis E2E verdes. Harness independente tem 11 testes: cinco passam e seis falham, correspondendo a duas famílias reais de defeito; sete E2E incluindo o teste novo têm seis passes/uma falha. Os testes anteriores mediam repouso estacionário antes da primeira piscada e focavam a gota manualmente, deixando essas bordas sem cobertura (`render.test.ts:75–79`, `App.test.tsx:176–195`). |
| G — Fidelidade visual/UX | **8 / 9** | Examinei ambas as capturas das dez formas em 24/40/96 px e a janela de produção. Tokens, fontes locais, respingo assimétrico, selo e interrogação estão presentes (`render.ts:4–46`, `style.css:1–51`); testes reais de contraste dos dois glifos passaram. P1 reduz continuidade da interação. Reconhecimento/fidelidade humana a 24 px e arraste físico continuam sem evidência de aceite, portanto não fundamento nota 9. |
| H — Acessibilidade | **8 / 9** | Modal/Escape, labels, oito passos, setas, movimento reduzido e contraste têm testes. Reamostrei axe nativo escuro em sessões/recolhido: zero violações. P1 deixa BODY focado ao substituir o controle; Enter/setas exigem novo Tab. Axe não detecta esse caso e não comprova canvas, leitor de tela ou zoom. A cobertura e continuidade de foco ainda não fundamentam a mínima 9. |
| I — Desempenho | **8 / 8** | E2E de limites 30/60 e parada reduzida passou; latência entregue do candidato é p95 23,46 ms/32 hooks (`desktop-native-round3.json`). P2 gera pintura inútil, mas não demonstrou exceder CPU. Reamostrei gota de interrogação em repouso por 15 s: CPU 0,95% da máquina/108,6 MiB de working set privado agregado; métrica de memória e limites estão detalhados abaixo. |
| J — Documentação | **8 / 8** | README/changelog/ADR 0008 declaram escopo e catraca pendente; errata de temas foi corrigida em `docs/fase-3.md:137–148`. Arraste sem deslocamento permanece documentado. P3 contradiz a afirmação de que npm audit bloqueia no CI (`docs/dependencias-desktop.md:28`). |

Nenhuma nota 10 foi atribuída. As notas não foram elevadas para satisfazer a catraca. A regra anti-inflação §13.1.7 foi respeitada: não há rodada composta só de 9/10, nem contagem artificial de variações do mesmo defeito.

## Problemas acionáveis

### P1 — Baixo: alternar painel e gota perde o foco do controle

**Local:** `app/ui/src/App.tsx:356–365`, `368–434`, `435–454`. A troca de ramo desmonta o botão focado, sem transferir foco ao novo controle. O `set_focus()` nativo de `desktop.rs:386` foca a janela, não um elemento no DOM.

**Reprodução independente:** com a gota recolhida, Tab levou foco a BUTTON/“Abrir Scribe” (`native-before-enter.json`). Enter abriu 372×784, sem alertas, mas `activeElement` virou BODY (`native-after-enter.json`). No sentido inverso, Tab focou “Recolher janela” (`native-before-collapse-enter.json`); Enter recolheu a 56×56 e novamente deixou BODY (`native-after-collapse-enter.json`). Os dois testes correspondentes no harness Vitest falham. O usuário consegue recuperar com Tab; não há aprisionamento permanente de teclado.

**Impacto e correção verificável:** perde-se o foco visível e a continuidade de Enter/setas exatamente ao trocar o controle principal. Transferir foco de forma pertinente quando o controle focado for removido, sem roubar foco do aplicativo externo em recolhimentos pelo atalho global. Cobrir os dois sentidos, modo acionado pelo teclado e preservação de foco externo. [W3C — ordem de foco e operabilidade](https://www.w3.org/WAI/WCAG22/Understanding/focus-order.html) fundamenta a avaliação de UX; esta reprodução sozinha não prova violação formal desse critério WCAG.

### P2 — Baixo: formas sem olhos redesenham continuamente após o prazo da piscada

**Local:** `app/ui/src/gota/render.ts:99`, `198–210`, `316–321`.

`nextBlink` existe para toda forma. O retorno de repouso depende de `now < nextBlink`, mas a próxima piscada é agendada somente no ramo de olhos, que exclui raio ≤9 px e as formas interrogação/selo/ponto. Depois de 2,5–6 s esse prazo nunca se renova nesses casos, fazendo o scheduler pintar a cada frame permitido sem mudança visual.

**Reprodução:** quatro variantes de teste (gota24, interrogação56, selo56, ponto56) fizeram **60 clearRect em 60 chamadas** após o prazo; o esperado era repouso sem repaint. Corroborei no Chromium com renderer real: aguardei 7 s, medi 1,1 s sem interações, e as formas de 24 px sem órbita fizeram **33 redraws**; interrogação/selo/ponto em 40 px fizeram 33 e em 96 px **67**. `settled-draws.json`, `review.spec.ts` e trace em `pw-results` preservam o resultado. Os seis E2E de produto continuam passando; o teste novo falha.

**Impacto e correção verificável:** trabalho de Canvas desnecessário em formas estacionárias; contradiz o repouso descrito em `docs/fase-3.md:20`. Condicionar o despertar de piscada à presença de olhos, ou tratar o prazo de forma que desenhos sem piscada continuem parados. Testar depois de pelo menos 6 s, nos tamanhos 24/40/56/96, incluindo troca entre forma com olhos e sem olhos; manter órbita/transições/piscadas reais. Não alego CPU >2%: a amostra nativa recolhida com interrogação ficou em 0,95% da máquina.

### P3 — Baixo: auditoria npm não é uma catraca do CI

**Local:** `.github/workflows/ci.yml:11–19`, `38–46`; `docs/dependencias-desktop.md:26–28`; `prompt.md` §8.6 e §10.

A Fase 3 acrescenta o frontend e lockfile npm, mas o job dependency-audit executa apenas cargo audit. O passo Check frontend executa lint, formatação, testes e build; nenhum comando `npm audit` está no workflow ou é chamado pelos scripts npm. `npm ci --ignore-scripts` não configura a catraca explícita requerida. A documentação diz que novos avisos, vulnerabilidades e npm audit continuam bloqueando, sem implementação correspondente.

**Verificação:** `rg -n audit .github/workflows app/package.json` encontrou apenas auditorias Cargo e o sanitizador de evidências. Rodei `npm.cmd audit --json` separadamente: **zero vulnerabilidades**, log `npm-audit.json`; não há vulnerabilidade atual reproduzida. A falha é de prevenção contínua/documentação, não uma exploração do candidato. [npm — audit e códigos de saída para CI](https://docs.npmjs.com/cli/v11/commands/npm-audit/) descreve o comando que falha conforme o limiar de vulnerabilidade.

**Correção verificável:** executar npm audit sobre o lockfile do app em um passo bloqueante do CI, sem continuar em erro, e manter a documentação alinhada ao limiar adotado. Obter CI do próximo candidato.

## Tentativas de quebra e resultados

| # | Tentativa concreta | Resultado |
| --- | --- | --- |
| 1 | Recolher pelo Enter a partir do botão focado | **Quebrou continuidade de foco** no harness e nativo; P1. Tab recupera. |
| 2 | Reabrir pelo Enter a partir da gota focada | **Quebrou continuidade de foco** no harness e nativo; P1, mesma família. |
| 3 | Ultrapassar prazo máximo da primeira piscada em forma sem olhos | **Quebrou repouso** em quatro variantes Vitest e no Chromium; P2. |
| 4 | Enviar revisão duplicada com timestamp posterior e sessão já removida | **Resistiu**: não ressuscitou dados; harness novo. |
| 5 | Enviar snapshot antigo sem erro após um erro nativo recolhido | **Resistiu**: aviso específico permanece; harness novo. |
| 6 | Projeto/ação com tags img/script e handler de evento público | **Resistiu**: texto escapado, nenhum img/script criado; harness novo. |
| 7 | Mudar DPR reduzido com documento oculto e depois torná-lo visível | **Resistiu**: nenhuma pintura oculta; uma pintura ao voltar, 24→48 físicos; harness novo. |
| 8 | Recolher enquanto configurações estão abertas e depois reabrir | Modal ausente durante recolhimento, reaparece ao reabrir. **Não classificado como defeito**: a expectativa exploratória de que nunca reaparecesse não vem do PRD. Log inicial preservado; teste final verifica o comportamento observado. |
| 9 | Hook sem token; Origin externo; credencial de hook lendo estado UI | **Resistiu**: 401/403/403 e nenhum CORS; `native-security.json`. |
| 10 | Chamar rota de decisão e enviar PermissionRequest público | **Resistiu**: rota 404; hook 204 sem resposta de decisão. Nenhum botão permitir/negar ou segredo público no DOM (`native-final.json`). |
| 11 | Injectar falha SQL na segunda política de retenção | **Resistiu**: ambos os valores, poda, memória e histórico mantidos; teste de produto `combined_policy_failure_rolls_back_both_settings_cleanup_and_memory`. |
| 12 | Buscar auditoria npm bloqueante nas ações/scripts | **Quebrou conformidade do CI**: auditoria ausente; P3. Auditoria local separada verde. |

Não contei os quatro tamanhos/formas de P2 ou os dois sentidos de P1 como problemas distintos. A primeira expectativa de HTTP UI era 401; a implementação corretamente rejeita ausência de `x-scribe-ui` com 403. Corrigi o harness para o contrato real e preservei `native-security-exploratory.json`; isso não é defeito de produto.

## Verificações e reprodução

Reexecutei **28/28 Rust** (cinco biblioteca desktop, 21 núcleo, dois políticas), **22/22 Vitest de produto**, ESLint, Prettier e build TypeScript/Vite. Auditoria npm local: zero vulnerabilidades. Não recompilei release nativo, não refiz Clippy/coverage/cargo audit; os resultados do CI/implementador têm autoria própria.

Harness final Vitest: **33 testes**, 27 passes/6 falhas — produto 22 passes, novos cinco passes/seis falhas (P1/P2). Execução exploratória 26 passes/7 falhas preservada em `vitest-exploratory.json` e `review-exploratory.tsx`, incluindo a hipótese modal descartada. E2E: **seis passes de produto/uma falha nova**. Para não sobrescrever evidências anteriores, copiei somente o spec E2E ao diretório novo, alterando apenas destino de artefatos; configuração nova inicia Vite limpo em 1424 e usa `reuseExistingServer:false`. Não alterei fontes do produto.

Reproduzir a partir de `D:/RexIA/projetos/scribe/app`, em PowerShell 7:

```powershell
npm.cmd exec -- vitest run --config .artifacts/phase-3-review-3/review.config.ts --reporter=json --outputFile=.artifacts/phase-3-review-3/vitest.json
npm.cmd exec -- playwright test --config .artifacts/phase-3-review-3/playwright.config.ts
```

As falhas adversariais são esperadas no candidato congelado. Logs, JSONs e traces ficam no diretório da rodada 3, sem sobrescrever rodadas 1/2. Axe nativo escuro novo em sessões e recolhido: **zero violações**, arquivos `native-a11y-{sessions,collapsed}-dark.json`; não equivale a leitor de tela, zoom ou inspeção humana de pixels.

## Correções históricas, desempenho e limites

As correções da rodada 2 estão presentes: erro recolhido tem badge/alert/descrição (`App.tsx:371–434`); snapshots novos sem erro limpam falha local (`App.tsx:316–322`); dica acompanha hooks posteriores à abertura (`App.tsx:306–312`, `321–322`, `513`); tinta informativa separada no escuro (`style.css:28`, `render.ts:132`) passa contraste real nos dois temas/quatro tamanhos. As evidências axe anteriores agora são descritas como claras, com novas medições escuras separadas. Os testes de produto das correções passaram. Não alterei os resultados reprovados de seus candidatos anteriores.

Reamostrei recursos sem compilação concorrente, gota recolhida de interrogação, PID 22072, **15,007805 s**, oito processadores: nativo working set **36,12 MiB**, agregado app/WebView2 working set privado **108,6 MiB**, soma bruta working set **428,06 MiB**, CPU **7,6% de um núcleo / 0,95% da máquina**. `resources-collapsed-question.json`. Houve tráfego de poucos hooks públicos durante a amostra, portanto é observação de baixa carga, não repouso estritamente sem eventos. CPU atende a meta na amostra apesar de P2. Memória privada não é RSS agregado nem memória comprometida; soma bruta duplica páginas compartilhadas. NFR-04 fica apoiado apenas na métrica explicitada, sem prova irrestrita de <150 MB.

Latência de produção fornecida após correções: **p95 23,46 ms/32 eventos**, escuro/DPR1,25/372×784, inspecionada em `desktop-native-round3.json`, não reamostrada por mim. FPS e movimento reduzido foram reexecutados no navegador. Não medi nativo macOS/Linux, multi-monitor/DPI físico, zoom ou leitor de tela humano, menu de bandeja ou conflito real de atalho nesta rodada. Os avisos glib/proc-macro-error continuam riscos explícitos em `docs/dependencias-desktop.md`; [RustSec glib](https://rustsec.org/advisories/RUSTSEC-2024-0429.html) descreve unsoundness corrigida em versões superiores. Não refiz busca de alcance no registry nem trato a exceção como prova formal; deve ser reavaliada na Fase 5/Linux.

## CI e requisitos restantes

Consulta final em **2026-10-06 15:11:57 UTC**: [run PR 37483927880](https://github.com/rexia-intel-automation/scribe/actions/runs/37483927880), head **b26bc89878c24c466a42a38a6257b6b62d26895b**, **in_progress**. Dependency-audit, macOS e Windows: **success**; Ubuntu: **in_progress**. Não é CI completo verde. O CI histórico de 18ebdea/run 37480091393 e runs duplicados não substituem o candidato avaliado. Um resultado posterior verde não altera retroativamente as reproduções P1/P2/P3.

Para a próxima rodada, corrigir os três problemas, adicionar regressões pertinentes e obter CI do novo candidato. **Os aceites humanos visual e de arraste continuam pendentes, independentemente dessas correções.** Capturas/scheduler/axe/teclado não são aprovação visual humana nem prova de arraste. O arraste automatizado pequeno sem deslocamento continua preservado em `docs/fase-3.md:111–117`; não o converti em sucesso, falha definitiva do produto ou falha do instrumento sem evidência adicional.

Estado devolvido: janela isolada aberta **372×784**, tema escuro, sem alerta, sem modal; preferências **IsReadOnly=false**. `native-final.json` confirma segredo público ausente e nenhum controle de decisão. A sessão `public-review-round3` é somente fixture desta revisão. Nenhuma catraca foi aprovada/rebaixada, nem Fase 4 iniciada.
