# Fase 3 — revisão adversarial independente, rodada 5

**Veredito: REPROVADA.** G8 e H8 não atingem as mínimas G9/H9 de
`prompt.md` §13.3. Há um defeito baixo novo de continuidade do foco na
confirmação de histórico. Aceite visual humano e arraste físico continuam
pendentes e não são substituídos por capturas, mocks ou teclado.

## Identidade e isolamento

- Data: 2026-10-06, aproximadamente 12:56 BRT.
- Candidato congelado: `e98bd2194b768beab96a357d734cb2beb9476b52`.
- Base: `824c4ce8f687620d41f568cce4564a5f8bbce902`.
- [PR #5](https://github.com/rexia-intel-automation/scribe/pull/5).
- Revisor independente, sem participação na implementação. Leitura do prompt
  inteiro, diff da fase, implementação, testes, ADR 0008, documentação e
  evidências. R1–R4 permanecem históricos reprovados; nenhuma aprovação foi
  herdada. Referências de produto conferidas pelo Git do candidato.
- Ensaios somente em `D:/RexIA/projetos/scribe`, pelo PowerShell 7
  `C:/Program Files/PowerShell/7/pwsh.exe`. Fixtures públicas em
  `SCRIBE_TEST_FIXTURES_ROOT=C:/Users/engmo/OneDrive/RexIA/RexIA/projetos/scribe/app/src-tauri/tests/fixtures/hooks`.
- Harnesses e logs novos em
  `D:/RexIA/projetos/scribe/app/.artifacts/phase-3-review-5`.
  `frozen-hashes.json` confirma sete blobs importantes idênticos entre Git e D:
  App, bridge, renderer, desktop Rust, testes App/E2E e lockfile npm.
- Escrita na fonte limitada a este relatório. Sem edição de produto,
  commit/push/merge, decisões, sessões pessoais ou aceites humanos simulados.
  Sem cobrança de cartões/notificações da Fase 4 e instaladores da Fase 6.
- Nenhum input na janela nativa, nenhuma parada/recompilação do executável em
  execução, nenhum acesso CDP nesta rodada. As reproduções Chromium são
  separadas. Não foi necessário aplicar Computer Use. PID 26676 permaneceu
  vivo e `Responding=true`; não alego nova inspeção do DOM ou estado visual
  nativo. A janela continua reservada ao ensaio humano.

## Execuções próprias e resultados

| Execução | Resultado e artefatos |
| --- | --- |
| Vitest, produto + oito ensaios próprios | **36/37**: produto **29/29**, próprios **7/8**. R5-02 vermelho por P1. `review.test.tsx`, `vitest.config.ts`, `vitest-corrected-harness.log` |
| Primeira execução Vitest | **35/37**. Além de P1, R5-03 usava seletor incorreto `Porta local`. Corrigido para `Porta da conexão local`. `vitest.log` preservado; erro do harness não é defeito do produto |
| Chromium, dois ensaios próprios | **1/2**. R5-09 confirma P1, R5-10 resiste a três ciclos modal/recolher/reabrir. `focus.spec.ts`, `e2e.log`, `history-focus-browser.json`, `modal-focus-browser.json`, PNG e trace |
| Sete E2E de produto, primeira execução | **6/7**; medição de FPS falhou enquanto Vitest e verificações compilavam/executavam em paralelo. `e2e.log` e trace preservados. Essa execução não foi silenciosamente descartada |
| Sete E2E de produto, sem compilação concorrente | **7/7**, servidor novo e `reuseExistingServer=false`. `e2e-product-idle.log`, `product-playwright.config.ts`, `browser-product-idle/results.json` |
| Rust desktop/núcleo/políticas | **28/28**: cinco unidades desktop, 21 contratos/núcleo e duas políticas. `cargo-test.log`; binário e doc-tests têm zero testes |
| ESLint, Prettier, build UI | Exit 0 em todos; `checks.json`, `lint.log`, `format-check.log`, `build.log` |
| npm audit desde nível baixo | Exit 0, zero vulnerabilidades; `npm-audit.log` |

A cópia de `window.spec.ts` no harness altera apenas o destino de evidências.
Os novos servidores usam porta 1435 para não interferir na janela nativa.
Os artefatos `browser/browser-frame-rates.json`, `browser-settled-forms.json`,
`browser/glyph-contrast-{light,dark}.json` e as capturas sob `browser/` são da
execução sem compilação concorrente. A primeira falha de FPS não basta para
atribuir um defeito permanente: a execução completa posterior passou; testes
determinísticos do scheduler também passaram. O limite da amostra é explícito.

Comandos reproduzíveis, a partir de `D:/RexIA/projetos/scribe/app`:

```powershell
node node_modules/vitest/vitest.mjs run --config .artifacts/phase-3-review-5/vitest.config.ts --reporter=verbose
node node_modules/@playwright/test/cli.js test --config .artifacts/phase-3-review-5/playwright.config.ts
node node_modules/@playwright/test/cli.js test --config .artifacts/phase-3-review-5/product-playwright.config.ts
cargo test --manifest-path src-tauri/Cargo.toml --features desktop --locked -- --test-threads=1
```

O harness mantém a asserção vermelha de P1. Não confundir esta rodada com o
recheck R4 38/38 ou com provas nativas feitas pelo implementador.

## Tentativas de quebra próprias

| ID | Tentativa concreta | Resultado |
| --- | --- | --- |
| R5-01 | Abrir modal e alternar snapshot recolhido/aberto três vezes; fechar modal | Resistiu: botão Configurações atual recebe foco. Correção R4 efetiva no harness |
| R5-02 | Abrir confirmação de histórico; focar Cancelar e pressionar Enter | **Quebrou:** Cancelar é removido, foco termina em BODY. Nenhuma chamada a `clearHistory` |
| R5-03 | Digitar porta zero e tentar salvar | Resistiu: validação do formulário impede chamada a Rust e mantém modal |
| R5-04 | Desmontar App enquanto observe está pendente; rejeitar inscrição depois de montar substituto | Resistiu: nenhum alerta é aplicado no substituto |
| R5-05 | Projeto com `<img ... onerror=...>` e passo com `<script>`; expandir | Resistiu: texto literal, sem elementos img/script ou execução |
| R5-06 | Save falha por conflito de atalho; chega erro nativo de porta; fechar modal | Resistiu: motivo de porta permanece e sessão não desaparece |
| R5-07 | Revisão menor com timestamp futuro e revisão duplicada após remoção de sessões | Resistiu: sessões antigas não reaparecem |
| R5-08 | Falha de movimento recolhido via ArrowUp | Resistiu: erro específico anunciado, sem toggle automático. É contrato de seta, não prova de arraste |
| R5-09 | Repetir abrir/cancelar confirmação por Enter em Chromium real separado | **Quebrou:** BODY após abrir e após cancelar; modal ainda aberto; zero `:focus-visible`. Mesmo P1 de R5-02 |
| R5-10 | Três ciclos de modo via proxy explícito de snapshots; fechar por Escape em Chromium | Resistiu: foco volta a Configurações, sem modal residual. Proxy não equivale a ensaio Windows |

Além disso, os E2E confrontaram 10 formas × 24/40/96 px nos dois temas,
glifos 24/40/56/96 px, axe A/AA, ausência de requests externas no catálogo,
fontes locais, movimento reduzido e repouso depois de 6,5 s. Quinze variantes
sem olhos tiveram zero redesenhos durante 1,1 s adicionais. A órbita grande
registrou 61 desenhos no intervalo nominal de um segundo; pequenas, 33,
dentro da tolerância temporal de até 35 do E2E. Não confundo contagem por
janela de tempo com prova de ausência total de RAF nem com medição nativa.

## Problema acionável confirmado

### P1 — baixo: confirmação de histórico perde foco ao substituir seus controles

Fonte congelada:
[App.tsx:274](https://github.com/rexia-intel-automation/scribe/blob/e98bd2194b768beab96a357d734cb2beb9476b52/app/ui/src/App.tsx#L274),
[Cancelar:284](https://github.com/rexia-intel-automation/scribe/blob/e98bd2194b768beab96a357d734cb2beb9476b52/app/ui/src/App.tsx#L284),
[abrir confirmação:290](https://github.com/rexia-intel-automation/scribe/blob/e98bd2194b768beab96a357d734cb2beb9476b52/app/ui/src/App.tsx#L290).

Reprodução: abrir Configurações; focar Apagar histórico e pressionar Enter;
focar Cancelar e pressionar Enter. Ao abrir a confirmação, o botão original
é desmontado. Ao cancelar, Cancelar também é desmontado. Não existe
transferência de foco para um controle apropriado nessas mudanças de árvore.

Resultado Chromium de `history-focus-browser.json`: após abrir, `tag=BODY`;
após cancelar, `tag=BODY`, `dialogOpen=true`, `visibleFocusCount=0`.
`history-focus-browser.png` foi aberta e examinada; a captura mostra o modal
sem indicador de foco. Trace e asserção vermelha preservam a sequência.
JSDOM R5-02 concorda: esperado um controle adequado, observado BODY.

O critério é manter continuidade/foco visível; ao cancelar, retornar ao botão
Apagar histórico é um alvo lógico. Ao abrir, um controle adequado da
confirmação deve receber foco. A escolha exata de alvo não precisa ser idêntica
ao harness se preservar o fluxo. Referências primárias:
[WCAG 2.4.7 — foco visível](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html)
e [APG — diálogo modal](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/),
além de NFR-08 do prompt.

Gravidade **baixa**: navegação é recuperável por Tab, sem travamento, limpeza
automática de dados ou decisão automática. Não houve chamada destrutiva.
Não alego reprodução nativa Windows: preservei a janela humana.
Abrir e cancelar são duas manifestações da mesma falta de gestão de foco,
não dois defeitos para inflar a contagem. A correção R4 está confirmada pelos
R5-01/10; ela trata outro ciclo de vida, não esta confirmação interna.

## Pendências de aceite, separadas de P1

1. **Aceite visual humano:** as duas capturas do catálogo e a captura nativa
   escura fornecidas foram examinadas. Dez formas, argila, fontes e glifos
   estão presentes. Minha inspeção e os testes de contraste não substituem
   a resposta humana sobre reconhecibilidade a 24 px, fidelidade e movimento
   exigida em §7.4/§10. Nenhuma resposta chegou durante esta revisão.
2. **Arraste físico FR-31:** `docs/fase-3.md:109` registra que o ensaio
   automatizado pequeno não deslocou a gota. Código Win32, coordenadas
   empacotadas, mocks e setas não demonstram arraste/snap por mouse. Nenhuma
   resposta humana ou prova física bem sucedida chegou. Não atribuo a falha
   ao teste nem declaro a funcionalidade aprovada.

Não executei leitor de tela humano, zoom nativo ou ensaios físicos em outros
sistemas. Essas limitações restringem a conclusão de excelência, sem virarem
defeitos fictícios. Ainda que P1 seja corrigido e o CI conclua verde, os aceites
pendentes não se tornam aprovações por silêncio.

## Notas A–J e catraca

| Área | Nota | Mínima | Evidência e limites |
| --- | --- | --- | --- |
| A — Claude Code | 8 | 8 | 21 contratos/núcleo verdes em `cargo-test.log`, sem novas APIs Claude no diff. [Referência oficial de hooks](https://code.claude.com/docs/en/hooks) consultada. Sessões reais/decisões da fase seguinte não foram simuladas |
| B — Funcional | 8 | 8 | R5-01/03/06/07/08/10, produto Vitest 29/29 e E2E 7/7 sem carga concorrente. FR-31 físico ainda não demonstrado; P1 é baixo |
| C — Segurança | 8 | 8 | R5-05 resiste a markup; unidades Rust de origem/validação/gravação privada e testes HTTP verdes; `tauri.conf.json:19`, capability `main.json:6` e bridge limitam fronteira. npm audit zero; exceções GTK explícitas em `docs/dependencias-desktop.md`, sem prova formal de risco nulo |
| D — Robustez | 8 | 8 | R5-04/06/07, políticas transacionais e HTTP concorrência/falhas verdes. `desktop.rs:348` restaura layout após falha; não reiniciei nem paralisei o processo reservado ao humano |
| E — Código | 8 | 8 | Lint/format/build exit 0; separação Rust/bridge/App/renderer e cleanup presentes. P1 é ausência localizada de transferência de foco no bloco App:274–293 |
| F — Testes | 8 | 8 | 29 Vitest produto + 28 Rust verdes; sete E2E passam sem compilação concorrente. Harness encontra P1 por dois meios. Primeira medição FPS falhou e seu log foi preservado; axe isolado não descobre a continuidade do foco |
| G — Visual e UX | **8** | **9** | Capturas claro/escuro examinadas, catálogo real e contraste testados, fontes locais. P1 quebra continuidade visual do teclado; aceite humano visual e arraste continuam pendentes |
| H — Acessibilidade | **8** | **9** | Modal principal/ciclo de modo passou, reduced-motion/axe e glifos passaram. R5-02/09 deixam BODY e zero foco visível na confirmação. Leitor de tela/zoom humanos não ensaiados |
| I — Desempenho | 8 | 8 | Scheduler determinístico verde; E2E posterior registra 61 desenhos grandes e zero redraws das 15 variantes sem olhos. Primeira falha FPS limita a inferência sob carga. Artefatos fornecidos `desktop-native-round3.json` (p95 23,46 ms) e recursos (95,88 MiB privados/1,053% CPU) são históricos, não nova medição minha; soma bruta 391,32 MiB não é memória privada |
| J — Documentação | 8 | 8 | ADR 0008, fase-3 e avaliação GTK explicitam escopo, pendências e resultados históricos. `docs/evidence/desktop-modal-focus-native.json` prova apenas o fluxo R4 ensaiado pelo implementador; P1 novo exige registro/correção subsequentes |
| K — Release | — | — | Não pontuada na Fase 3. CI permanece condição do ritual §13.4, sem cobrar instaladores futuros |

**Anti-inflação (§13.1.7):** nenhuma nota 10; nenhuma nota foi elevada para
passar. A–J recebem 8, com evidências e limites, portanto a regra de todas
9/10 com menos de três problemas não é acionada. Foi encontrado **um**
defeito baixo, reproduzido por dois meios. Duas pendências humanas, uma falha
de seletor e a primeira amostra FPS não são contadas como quatro defeitos.
As mínimas G9/H9 foram mantidas.

## CI e conclusão devolvida

Consulta própria `ci-pr.json` identifica o
[run 37490295884](https://github.com/rexia-intel-automation/scribe/actions/runs/37490295884)
com `headSha=e98bd2194b768beab96a357d734cb2beb9476b52`: auditoria concluída
com sucesso, jobs Windows/macOS/Linux em andamento no momento da consulta.
`ci-list.json` também registra o run 37490286618 do mesmo SHA em andamento.
O CI verde de f3cacc2 é histórico e não aprova este candidato. Não aguardei CI
ou humano para registrar o veredito técnico.

Para encerrar a Fase 3: corrigir P1 e verificar a regressão; obter os dois
aceites humanos pendentes; confirmar CI do candidato final; fazer nova revisão
independente, preservando este relatório e os anteriores. Não avançar à Fase 4
com a catraca atual. A janela nativa foi preservada sem interação nesta rodada.
