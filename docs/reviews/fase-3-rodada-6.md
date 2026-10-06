# Fase 3 — revisão adversarial independente, rodada 6

**Veredito: REPROVADA.** A–J recebem 8; G/H exigem 9. Um defeito baixo novo
foi confirmado: a confirmação de limpeza perde foco após falha assíncrona.
Abrir/cancelar, problema da rodada 5, está corrigido. Aceite visual humano e
arraste físico continuam pendentes; não são defeitos novos nem aprovações.

## Identidade, escopo e isolamento

- Data: 2026-10-06, encerramento aproximadamente 13:06 BRT.
- Base: `824c4ce8f687620d41f568cce4564a5f8bbce902`.
- Candidato congelado: `41194b9070c6cef37bfed925ebf547b0074c364b`.
- [PR #5](https://github.com/rexia-intel-automation/scribe/pull/5).
- Revisor independente, sem participação na implementação. Prompt inteiro,
  particularmente §13, diff completo, implementação, testes, ADR 0008,
  documentação e artefatos da fase confrontados. R1–R5 permanecem imutáveis;
  nenhuma nota ou aprovação anterior foi herdada. Diff integral preservado
  em `full-diff.patch`; lockfiles e inventário de dependências incluídos.
- Ensaios no espelho sem Git `D:/RexIA/projetos/scribe`, PowerShell 7
  `C:/Program Files/PowerShell/7/pwsh.exe`, npm.cmd e Rust 1.96.
  Fixtures públicas em
  `SCRIBE_TEST_FIXTURES_ROOT=C:/Users/engmo/OneDrive/RexIA/RexIA/projetos/scribe/app/src-tauri/tests/fixtures/hooks`.
- Harnesses/logs próprios em
  `D:/RexIA/projetos/scribe/app/.artifacts/phase-3-review-6`.
  `frozen-hashes.json` confronta 47 arquivos app do diff com os blobs Git do
  candidato: **46 idênticos**. Só `app/src-tauri/icons/source.svg` está ausente
  no espelho; é fonte de autoria do ícone, não referenciada pelo build Tauri.
  Todos os fontes, configurações, testes, fontes tipográficas, ícones usados
  e lockfiles do app coincidem. A ausência não foi contada como defeito.
- Escrita na fonte restrita a este relatório. Nenhuma alteração de produto,
  outro documento, Git/PR ou relatório anterior. Sem dados pessoais,
  dump de ambiente/token, decisões humanas ou aceite simulado.
- PID 26676 preservado, `Responding=true`; hash do executável registrado em
  `native-preserved.json`. Pelo contexto de execução fornecido, esse binário é
  **e98bd21**, anterior ao candidato. Build UI novo não substitui os assets
  embutidos no executável antigo. **Esta rodada não valida o candidato em um
  novo binário nativo.** Nenhum input nessa janela, nenhuma parada/recompilação
  desse executável, nenhum fechamento de WebView/CDP/browser existente.
  Sem CDP ou Computer Use nesta rodada; interações só em Chromium separado.
- Fases 4–6 fora de escopo: não cobrados cartões de decisões, notificações,
  instaladores ou publicação. Build UI e testes/clippy usam seus próprios
  alvos; não houve build release nem execução de um app desktop novo.

## Execuções próprias

| Verificação | Resultado e evidência |
| --- | --- |
| Vitest produto + sete ensaios novos | **38/38**, sendo **31 produto + 7 próprios**; `vitest.log`, `review.test.tsx`, `vitest.config.ts` |
| Vitest inicial | **32/38**, seis falhas do harness por nomes presumidos. Corrigidos para textos reais `Apagar histórico agora`, `Manter histórico (dias)` e mensagem de storage; `vitest-first.log` preservado. Não são defeitos do produto |
| E2E produto, servidor novo 1437 | **8/8**, todos na única execução completa `e2e.log`; `browser-results.json`, `product.spec.ts` |
| Chromium próprios, primeira execução | **2/3**: R6-08 registra BODY, mas verificava recuperação posterior; R6-10 supunha wrap imediato do Tab. Log e trace preservados em `browser-results/` |
| Chromium próprios, confirmação | **3/4**: R6-08 agora contém asserção vermelha do foco após falha; R6-09/10 e controle HTML R6-11 passam. `e2e-own-red.log`, `browser-repro-results.json`, `browser-repro-results/` |
| Rust desktop/núcleo/políticas | **28/28**: 5 unidades, 21 núcleo/contratos, 2 políticas; `cargo-test.log`. Binário/doc-tests têm zero testes |
| ESLint, Prettier, UI build | Exit 0; `checks.json`, `lint.log`, `format-check.log`, `build.log` |
| Rustfmt e Clippy desktop todos os alvos | Exit 0; `extra-checks.json`, `cargo-fmt.log`, `cargo-clippy.log` |
| npm audit desde nível baixo | Exit 0, zero vulnerabilidades; `npm-audit.log` |

FPS executado **serialmente**, sem compilações/testes concorrentes, com
`CI=true`, `reuseExistingServer=false`, uma worker e porta própria **1437**.
O teste de produto foi copiado alterando somente destino de evidências.
Não repetimos sua medição só para obter resultado favorável: oito E2E passaram
na primeira execução desta rodada. A execução posterior roda somente os
ensaios próprios e o controle HTML, sem FPS. O Vite/Chromium de cada execução
foi encerrado pelo Playwright; nenhum processo da janela humana foi fechado.

Comandos, a partir de `D:/RexIA/projetos/scribe/app`:

```powershell
node node_modules/vitest/vitest.mjs run --config .artifacts/phase-3-review-6/vitest.config.ts --reporter=verbose
$env:CI='true'
node node_modules/@playwright/test/cli.js test --config .artifacts/phase-3-review-6/playwright.config.ts
node node_modules/@playwright/test/cli.js test --config .artifacts/phase-3-review-6/playwright-own.config.ts
cargo test --manifest-path src-tauri/Cargo.toml --features desktop --locked -- --test-threads=1
```

O primeiro Chromium usou `browser-first.spec.txt`, preservado; o harness atual
mantém P1 vermelho. A repetição de `playwright.config.ts` com o harness atual
também deverá encontrar P1. A falha de Tab foi confrontada com um diálogo HTML
mínimo: primeiro Tab após último botão resulta em BODY nos dois. Tabs seguintes
permanecem no diálogo; nenhum controle atrás dele recebe foco.
`dialog-tabs.json` e `baseline-dialog-tabs.json` documentam esse controle.
Isso não foi tratado como defeito novo nem como prova de WebView nativo.

Vitest emite aviso React `Received NaN for the value attribute` ao limpar
momentaneamente o número antes de digitar 27. O campo aceita a edição e mantém
27; validação e testes passam. Não há reprodução de perda de dados ou defeito
funcional por esse aviso; ele fica explicitamente registrado, sem inflar a
contagem de problemas.

## Tentativas de quebra novas

| ID | Tentativa | Resultado |
| --- | --- | --- |
| R6-01 | Limpeza rejeitada por storage; verificar histórico, confirmação e ausência de sucesso; cancelar | Resistiu em Vitest: dados permanecem, erro aparece e cancelar restaura foco. JSDOM não reproduz sozinho o blur nativo ao desabilitar botão |
| R6-02 | Cancelar/reabrir confirmação enquanto limpeza está pendente; tentar nova confirmação; resolver primeira | Resistiu: só uma chamada, confirmação disabled, foco retorna após sucesso |
| R6-03 | Nova sessão em snapshot revisão 4 chega antes de retorno da limpeza revisão 3 | Resistiu: nova sessão permanece; resposta antiga não apaga DOM atual |
| R6-04 | Editar retenção para 27; sete snapshots enquanto confirmação está aberta | Resistiu: foco fica no campo, valor não é resetado |
| R6-05 | Fechar modal durante limpeza; reabrir; rejeitar operação do modal antigo | Resistiu: erro antigo não contamina modal novo; controle atual enabled |
| R6-06 | Editar retenção, limpar com sucesso e depois salvar | Resistiu: edição não se perde e ponte recebe retentionDays 27 |
| R6-07 | Cinco ciclos abrir/cancelar usando Space | Resistiu: foco lógico acompanha controles, zero chamadas à limpeza |
| R6-08 | Confirmar limpeza via Enter em Chromium; rejeitar promessa assíncrona | **Quebrou: P1**, BODY e zero foco visível após erro. Recuperação por focar Cancelar manualmente funciona, mas não elimina a perda anterior |
| R6-09 | Chromium: cancelar/reabrir durante limpeza pendente; resolver | Resistiu: uma chamada e foco em Apagar histórico após sucesso |
| R6-10 | Chromium: edição + snapshots, Space, Tab no limite e Escape | Edição/Space/Escape resistiram. Suposição de wrap imediato falhou; controle R6-11 mostrou comportamento do diálogo HTML nativo, portanto não é achado de produto |

R6-11 é controle do instrumento, não uma tentativa extra para inflar o total.
Os mocks interceptam somente o módulo bridge da página Chromium separada;
nenhuma promessa foi enviada ao Rust ou ao app humano. Resolução simulada
serve para ensaiar a UI, não para provar limpeza real/arraste no Windows.

## P1 — baixo: foco perdido após falha assíncrona da limpeza

Candidato:
[App.tsx:159](https://github.com/rexia-intel-automation/scribe/blob/41194b9070c6cef37bfed925ebf547b0074c364b/app/ui/src/App.tsx#L159),
[botão disabled:289](https://github.com/rexia-intel-automation/scribe/blob/41194b9070c6cef37bfed925ebf547b0074c364b/app/ui/src/App.tsx#L289),
[efeito limitado a confirm:136](https://github.com/rexia-intel-automation/scribe/blob/41194b9070c6cef37bfed925ebf547b0074c364b/app/ui/src/App.tsx#L136).

Reprodução R6-08:

1. Abrir Configurações pelo teclado e ativar Apagar histórico por Enter.
2. Cancelar recebe foco, confirmando a correção R5; usar Shift+Tab para focar
   Apagar histórico agora e pressionar Enter.
3. O botão focado fica disabled durante a promessa da ponte.
4. Rejeitar a ponte com `storageUnavailable`; aguardar alerta visível e botão
   novamente enabled.
5. Observar `document.activeElement.tagName === 'BODY'` e
   `document.querySelectorAll(':focus-visible').length === 0`.

A falha mantém `confirm=true`, logo o efeito novo não executa. `setBusy(false)`
reabilita o botão sem restaurar foco. `failure-recovery.json` registra BODY,
zero indicador e uma única chamada. Seu campo `cancelFocus` refere-se à
recuperação verificada na **primeira** execução, depois de focar Cancelar
explicitamente; não demonstra foco automático após falha. A segunda execução
registra a mesma perda e falha na asserção `not.toBe('BODY')`.
`failure-before-recovery.png` foi aberta e examinada: erro visível, confirmação
presente, botões sem contorno de foco. O trace vermelho está em
`browser-repro-results/browser-R6-08-failed-async-d24e3-covery-in-separate-Chromium/trace.zip`.

Impacto baixo: recuperável por Tab ou foco explícito, sem perda de histórico,
limpeza duplicada, travamento ou aprovação automática. Não alego reprodução
nativa. É lacuna diferente de abrir/cancelar R5, já corrigido: aqui o conteúdo
não é substituído; o blur decorre da desabilitação assíncrona.
Não afirmo que falha ao salvar tenha sido ensaiada neste Chromium; o código
compartilha busy, mas essa generalização exigiria ensaio próprio.

Critério de correção: ao terminar a ação assíncrona com falha, preservar uma
posição lógica de foco e indicador visível, sem roubar foco que o usuário já
moveu nem refocar modal desmontado. NFR-08 do prompt e
[WCAG foco visível](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html),
[APG diálogo modal](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)
sustentam o fluxo esperado. O alvo exato pode ser um controle adequado;
o harness não impõe um único botão como solução.

## Pendências humanas e limites

1. **Aceite visual humano:** catálogo novo claro/escuro contém as dez formas
   em 24/40/96 px, argila, fontes locais e glifos. Capturas fornecidas dos dois
   temas e sessão nativa escura foram abertas/examinadas; minha inspeção não
   substitui o reconhecimento/fidelidade/movimento pelo humano exigido por
   §7.4/§10. Nenhum aceite foi recebido.
2. **Arraste físico FR-31:** `docs/fase-3.md:112` preserva o ensaio anterior
   sem deslocamento. Coordenadas Win32, setas, mocks e código de snap não
   comprovam mouse/snap físico. Sem nova resposta humana nem reprodução
   física bem sucedida; não converti isso em defeito novo, falha do teste ou
   funcionalidade aprovada.

Sem ensaio humano de leitor de tela/zoom nativo, multi-monitor físico ou
interação nativa nas plataformas primárias. Sem nova amostra nativa de recursos
ou latência do candidato. Estes limites restringem alegações de excelência;
não são múltiplos problemas fictícios. CI verde futuro ou silêncio humano
não resolvem as pendências. Se após correção/resteste só elas restarem, aguardar
esses aceites sem criar outra rodada vazia antes de nova evidência.

## Notas e catraca

| Área | Nota | Mínima | Evidência e limite |
| --- | --- | --- | --- |
| A — Claude Code | 8 | 8 | 21 testes núcleo/contratos verdes; diff não acrescenta API Claude. [Hooks oficial](https://code.claude.com/docs/en/hooks) consultado. Não reexecutei aceites reais das fases anteriores |
| B — Funcional | 8 | 8 | R6-01–07/09/10, 31 Vitest produto e 8 E2E produto; histórico/edição/ordenação resistem. FR-31 físico não demonstrado; P1 é baixo |
| C — Segurança | 8 | 8 | Rust origem/validação/gravação privada e contratos HTTP verdes; desktop.rs:239/249, capability main e CSP restringem ponte. npm audit zero; avisos GTK e alcance inferido explicitados em docs/dependencias-desktop.md, sem prova formal de risco nulo |
| D — Robustez | 8 | 8 | R6-01/02/03/05/09 e testes transacionais de políticas verdes; desktop.rs:347 restaura layout quando falha. Sem reinício/paralisação do app humano |
| E — Código | 8 | 8 | Lint, Prettier, build, rustfmt e Clippy exit 0; separação Rust/bridge/App/renderer clara. P1 localiza gestão incompleta de foco após busy em App:159/289 |
| F — Testes | 8 | 8 | 38 Vitest e 28 Rust passam; 8 E2E produto passam serialmente. Chromium próprio encontra lacuna que JSDOM/axe não detectam; harness mantém vermelho e controla hipótese de Tab |
| G — Visual e UX | **8** | **9** | Catálogo fornecido e novo vistos, 10 formas e tokens/fontes presentes; contraste medido nos dois temas. P1 quebra continuidade do teclado; aceite humano e arraste faltam |
| H — Acessibilidade | **8** | **9** | Abrir/cancelar R5, reduced-motion, catálogo axe A/AA e glifos passam; R6-08 documenta BODY/zero foco visível. Leitor de tela/zoom humano não ensaiados |
| I — Desempenho | 8 | 8 | E2E serial: órbita grande 55 desenhos/intervalo nominal 1s, pequenas 28; 15 variantes sem olhos com zero redraws após 6,5s. Renderer:179/194 e testes determinísticos sustentam scheduler. Artefatos nativos históricos fornecidos: p95 23,46ms, 95,88MiB privados/1,053% CPU; não são amostras minhas do candidato. Soma bruta 391,32MiB não equivale a memória privada |
| J — Documentação | 8 | 8 | ADR 0008, fase-3:234 e changelog distinguem correção R5, binário antigo e pendências. Históricos preservados, exceções GTK documentadas; P1 novo exige registro/correção posterior |
| K — Release | — | — | Não pontuada; CI exato segue requisito §13.4, sem cobrar release/instaladores futuros |

**Anti-inflação (§13.1.7):** nenhuma nota 10; notas A–J 8 com evidências e
limites, regra de todas 9/10 não acionada. Um defeito baixo confirmado, sem
multiplicar suas duas observações Chromium em dois problemas. Pendências
humanas, nomes errados do harness, aviso NaN, SVG não usado e hipótese de Tab
não foram contados como defeitos adicionais. Mínimas G/H9 mantidas.

## CI e devolução

Snapshot compacto próprio às **16:06:03 UTC** em `ci-final-compact.json`:
[run PR 37491876155](https://github.com/rexia-intel-automation/scribe/actions/runs/37491876155),
`headSha=41194b9070c6cef37bfed925ebf547b0074c364b`, auditoria **success**,
Windows/macOS/Linux **in_progress**. Não aguardei CI/humano para concluir.
CI anterior verde de e98bd21 não aprova este candidato; eventual verde exato
não apaga P1 nem simula os aceites.

Para encerrar: corrigir P1, verificar regressão sem roubar foco ou refocar
modal desmontado e fazer nova rodada independente sobre o candidato corrigido;
obter os aceites humanos e CI final. Sem avanço à Fase 4 com a catraca atual.
D foi liberado após conclusão/verificação deste relatório. Janela PID26676
permanece preservada para o humano; nenhum aceite foi simulado.
