# Revisão adversarial — Fase 3, rodada 8

Data: 2026-10-06. Revisor independente, sem participação na implementação.
`prompt.md` foi lido integralmente, incluindo §13. Candidato congelado:
**9b649183b3dd713dbb19542863009cefc881a5ea**. Base da fase:
`824c4ce8f687620d41f568cce4564a5f8bbce902`.
Revisão no [PR #5](https://github.com/rexia-intel-automation/scribe/pull/5).
As referências de código deste relatório são desse SHA, mesmo que a branch avance.

**Veredito: catraca ainda não aprovada; nenhum defeito novo de código confirmado.**
A correção da rodada 7 resistiu a conclusões tardias, múltiplas montagens,
respostas fora de ordem e navegação por teclado. Oito tentativas novas passaram.
G permanece em 8 por evidência externa incompleta de aparência/reconhecibilidade
e arraste físico; H chega a 9 com a correção e os ensaios descritos abaixo.
As mínimas G/H continuam sendo 9. CI do candidato ainda estava em andamento
no snapshot, portanto §13.4 também continua pendente. Não avançar à Fase 4.

## Escopo e integridade

- Fases 0–2 aprovadas. Decisões, notificações, instaladores e publicação das
  Fases 4–6 não foram exigidos; K não se aplica nesta fase.
- Todos os testes/builds rodaram no espelho sem Git
  `D:/RexIA/projetos/scribe`, usando PowerShell 7 e `npm.cmd`.
  `SCRIBE_TEST_FIXTURES_ROOT` apontou para as fixtures públicas da fonte.
- `integrity.py` comparou SHA-256 de **130 arquivos** de app, plugins,
  manifestos, scripts e configuração GitHub ao Git congelado: **zero
  divergências**, antes e depois dos testes. Normalização CRLF→LF é registrada
  explicitamente por arquivo em `integrity.json`; não se mascara outro conteúdo.
- Diff e arquivos principais foram congelados sob
  `D:/RexIA/projetos/scribe/app/.artifacts/phase-3-review-8/`.
  Somente este relatório foi criado na fonte. Produto, Git, PR, documentos
  anteriores e logs históricos não foram alterados pelo revisor.
- Vite próprio na porta **1441**, `reuseExistingServer=false`, `CI=true`,
  um worker, sem outra compilação/teste concorrente ao FPS. O E2E de produto
  foi copiado para esta revisão alterando apenas seu destino de evidências.
- **PID 26676/e98bd21 permaneceu intocado e reservado ao humano:** não houve
  input, hook, CDP, fechamento, parada ou recompilação desse executável.
  Não se iniciou um novo desktop. A biblioteca Rust não valida um gesto nativo.
- D: foi liberado ao implementador após os testes e a conferência final dos
  hashes; a redação usou os arquivos congelados. Nenhum teste/processo desta
  revisão permaneceu em execução.

## Verificações novas

Todos os caminhos de logs nesta seção são relativos ao diretório de artefatos
`phase-3-review-8` acima.

| Verificação | Resultado e evidência |
| --- | --- |
| Vitest | **33/33**, `vitest.log` |
| ESLint, Prettier, TypeScript/Vite | Passaram, `lint.log`, `format.log`, `ui-build.log` |
| Rustfmt | Passou, `rust-fmt.log` |
| Biblioteca Rust desktop, `--features desktop --locked --lib` | **5/5**, `rust-desktop-lib.log` |
| Núcleo Rust sem feature desktop, serial | **21 testes core + 2 políticas**, mais unidade sanitizador; `rust-core.log` |
| Clippy desktop, `--lib -- -D warnings` | Passou, `clippy-lib.log`; não se declara nova execução de todos os targets |
| npm audit, incluindo desenvolvimento, nível low | Zero vulnerabilidades, `npm-audit.log` |
| E2E de produto | **11/11**, `browser.log`, `browser-results.json`, `product-evidence/` |
| Oito ensaios independentes | **8/8 válidos**, sete no lote inicial e R8-07 no controle separado |

O lote inicial terminou **18/19**: onze testes de produto e sete adversariais
verdes. R8-07 falhou por seletor incorreto do harness, não por comportamento
do Scribe. A expressão `/Port/` não encontra o nome inglês `Local connection
port`, que usa minúscula. O snapshot no `error-context.md` já mostrava o
campo com rascunho `1442` e interface inglesa correta.
O controle mudou somente esse seletor para `/port/i` e passou **1/1** em
`control-browser.log`/`control-results.json`. Lote, trace e harness originais
permanecem preservados. Não se alterou o produto para obter esse resultado.

## Oito tentativas novas de quebra

Os ensaios em `adversarial.spec.js` usam Chromium próprio e ponte simulada.
Não gravam preferências nem apagam histórico do desktop. As respostas e
revisões são controladas para forçar corridas, inclusive ordens artificiais
mais hostis que a serialização nativa. Há chamada de gravação/limpeza somente
após ação explícita de teste.

| ID | Tentativa | Resultado observado |
| --- | --- | --- |
| R8-01 | Salvar tema claro, fechar/reabrir duas vezes, editar e focar o terceiro editor, concluir o primeiro salvamento | Passou: tema efetivamente salvo chegou ao App; terceiro modal, rascunho e foco permaneceram; apenas uma chamada de save |
| R8-02 | Publicar revisão 50 enquanto um save antigo está pendente, depois devolver revisão 2 | Passou: tema da revisão 50 e editor atual preservados; snapshot antigo não substituiu o App |
| R8-03 | Manter save antigo pendente, fechar, salvar com sucesso em outro editor e depois rejeitar a operação antiga | Passou: nenhum modal reaberto/alerta tardio; foco voltou a Configurações; reabrir mostrou preferências do save novo |
| R8-04 | Iniciar limpeza, desmontar o editor, abrir outro, editar/focar porta e concluir a limpeza antiga | Passou: novo modal, porta e foco preservados; nenhuma confirmação nem aviso de sucesso transplantados da instância antiga |
| R8-05 | Dois saves explícitos em editores diferentes; concluir segundo com revisão 10 e primeiro com revisão 3 | Passou: reabrir mostrou atalho da revisão 10; conclusão antiga não fechou o editor reaberto |
| R8-06 | Recolher por teclado, falhar primeiro movimento e recuperar no movimento seguinte | Passou: erro anunciado e foco preservado; recuperação removeu alerta sem abrir painel |
| R8-07 | Trocar idioma/tema do servidor rapidamente durante edição/foco da porta, depois Escape | Passou no controle corrigido: rascunho/foco intactos, tema/idioma atuais aplicados, Escape devolveu ao botão Settings |
| R8-08 | Cancelar confirmação de histórico; tentar salvar porta abaixo do mínimo, acima do máximo e fracionária; então salvar porta válida e rejeitar | Passou: inválidos não chamaram IPC; somente save válido foi enviado; rejeição exibiu erro com editor presente |

O teste R8-01 estende a reprodução da rodada 7 além de duas montagens e
verifica simultaneamente o snapshot salvo, o novo rascunho e o foco.
Em [App.tsx:123](https://github.com/rexia-intel-automation/scribe/blob/9b649183b3dd713dbb19542863009cefc881a5ea/app/ui/src/App.tsx#L123)
e na limpeza da linha 129, a ref `mounted` segue a instância do editor.
Em [App.tsx:166](https://github.com/rexia-intel-automation/scribe/blob/9b649183b3dd713dbb19542863009cefc881a5ea/app/ui/src/App.tsx#L166),
`receive` mantém o resultado real e `if (mounted.current) close()` restringe
o fechamento. R8-02/05 também exercitam a guarda de revisão da linha 352.

**Problemas novos confirmados:** crítico 0, alto 0, médio 0, baixo 0.
Não há correção técnica nova indicada por estes ensaios. Pendências externas
e o erro do harness não foram classificados como defeitos do produto.

## Notas A–J

| Área | Nota | Mínima | Evidência e fundamento |
| --- | --- | --- | --- |
| A — Claude Code | **8** | 8 | Diff não altera plugin/hooks/MCP aprovados; core serial verifica fixtures públicas e contrato. Bridge envia apenas sessões/preferências e não inventa respostas de decisão; referência oficial de hooks consultada |
| B — Correção funcional | **8** | 8 | 11 E2E, 33 Vitest e R8-01–08 passam; `App.tsx:75` mantém oito passos e revisão 352 rejeita capturas antigas. Arraste real ainda não tem aceite, portanto não se declara FR-31 plenamente comprovado |
| C — Segurança | **8** | 8 | `desktop.rs:239–265`, capability main e CSP limitam navegação/IPC; token permanece no Rust. Cinco testes desktop e core de autenticação/Host/Origin/higienização passam. Avisos GTK têm exceções específicas públicas; auditoria dedicada da Fase 5 permanece posterior |
| D — Robustez | **8** | 8 | Rollback SQL das duas políticas passa em `policies.rs`; R8-01–05 passam corridas/desmontagens/revisões; `desktop.rs:535` serializa preferências. Não foi feita nova operação nativa de falha de disco nesta rodada |
| E — Código | **8** | 8 | Mudança localizada de ciclo de vida, tipos estritos, bridge pequena e scheduler comum; lint/build/clippy-lib verdes. Políticas SQLite seguem transação; nenhuma refatoração especulativa exigida |
| F — Testes | **8** | 8 | 33 Vitest, 11 E2E, oito tentativas válidas e testes Rust verdes; novos casos cobrem mais montagens e resultados antigos. Harness incorreto identificado com snapshot e controlado; CI completo/cobertura do candidato ainda pendentes no snapshot |
| G — Visual e UX | **8** | **9** | Capturas novas claro/escuro com dez formas em 24/40/96 px foram abertas e inspecionadas; fontes locais, tokens, morph 450 ms em `render.ts:183` e foco preservado. Aceite humano obrigatório da aparência/reconhecibilidade e confirmação do arraste/snap faltam; evidência disponível não sustenta nota 9. Isso não constitui defeito visual novo |
| H — Acessibilidade | **9** | **9** | 11 E2E cobrem teclado, foco visível, confirmação, falhas assíncronas e regressão R7; R8-01/03/04/06/07 preservam foco em condições adicionais. Axe WCAG A/AA claro/escuro passou, canvases têm nome acessível e redução de movimento para desenhos. Glifos foram medidos nos quatro tamanhos; não houve problema remanescente de acessibilidade confirmado no escopo da fase. Não se alega teste humano com leitor de tela ou novo WebView |
| I — Desempenho | **8** | 8 | FPS serial novo: 61 desenhos em aproximadamente 1 s para 96 px e 30 para órbitas pequenas; movimento reduzido parou desenhos. Quinze variantes sem olhos ficaram em zero redraws após 6,5 s. Rust HTTP p95 4 ms/32 amostras passou limite 200 ms. Não é medição nova de latência até DOM, CPU ou memória nativa deste SHA |
| J — Documentação | **8** | 8 | `docs/fase-3.md`, ADR 0008, READMEs e changelog descrevem entrega/limites, riscos GTK e catraca em verificação. Falhas anteriores do CI e incerteza de causa estão explícitas nas linhas 294–301; publicação/instaladores pertencem à fase seguinte |

**G8 não atinge G9**; H9 atinge H9. As outras notas atingem suas mínimas.
Nenhuma nota 10 foi atribuída; a regra contra inflação §13.1.7 não é acionada,
pois as notas não são todas 9/10. Não se inventaram três problemas para
justificar o protocolo nem se conservaram defeitos já corrigidos como novos.

## Visual, nativo e desempenho: limites da evidência

Os catálogos versionados e os dois catálogos novos em `product-evidence/`
foram inspecionados, assim como `native-sessions-dark.png` histórico.
Catálogo tem trinta canvases, dimensões verificadas e fontes locais, sem
pedidos externos no teste. Respingo assimétrico, divisão com dois lóbulos,
interrogação/selo e ponto final estão presentes. Inspeção do revisor não é
o aceite humano obrigatório do §10.

Novas amostras `glyph-contrast-{light,dark}.json` registram mínimos nominais
**4,39:1 / 4,98:1**, além de pixels centrais acima de 3:1. Não se exige
essa relação em cada pixel antialiasado. `browser-frame-rates.json` mede
desenhos no intervalo, não comprova ausência de RAF; `browser-settled-forms.json`
mede quinze variantes por 1,1 s depois do maior prazo de piscada.

Histórico nativo registra p95 até DOM 23,46 ms e 372×784, DPR 1,25.
Recursos históricos registram 33,84 MiB no Scribe e 95,88 MiB de working set
privado da árvore; soma bruta 391,32 MiB inclui compartilhamento contabilizado
mais de uma vez. Esses valores não são novas medições do candidato e não
transformam o executável antigo em validação deste SHA.

**Aceites externos ainda pendentes, sem classificação de defeito:**

1. Aparência/reconhecibilidade das dez formas nos temas claro/escuro, inclusive 24 px.
2. Arraste físico e snap no Windows. Teste de coordenadas empacotadas e fonte
   Win32 não demonstram o gesto completo; o ensaio automatizado histórico não
   mostrou deslocamento, e isso não determina sucesso nem causa de falha.

## CI congelado e cobertura serial

Snapshot compacto do [run 37496106695](https://github.com/rexia-intel-automation/scribe/actions/runs/37496106695),
**2026-10-06 16:35:30 UTC**, confirmou head SHA **9b649183…**:
dependency-audit **success**; Ubuntu/macOS construindo release; Windows
executando testes Rust seriais. Resultado global **in_progress**.
Arquivo: `ci-snapshot.json`. Não se declara CI verde nem se aguarda seu término
para finalizar esta revisão. Run push duplicado cancelado não substitui esse CI.

No Git congelado, [ci.yml:75](https://github.com/rexia-intel-automation/scribe/blob/9b649183b3dd713dbb19542863009cefc881a5ea/.github/workflows/ci.yml#L75)
mantém `--fail-under-lines 85` e acrescenta `-- --test-threads=1` ao llvm-cov.
A sintaxe corresponde ao CLI oficial v0.9.1: argumentos após `--` chegam ao
binário de testes. Nenhuma asserção nem limite de 200 ms foi relaxado.
É alinhamento de serialização com o teste principal, não prova da causa dos
604 ms Windows ou dos 377 ms Linux do SHA anterior.

Um snapshot adicional do run anterior **3d8c6a9**, tentativa 2, às
**16:36:11 UTC** (`prior-rerun-snapshot.json`) mostrou testes Rust seriais
Windows/Linux concluídos com sucesso; Windows estava construindo release e
Linux executando cobertura. Isso é observação de recorrência em outro SHA,
não resolução causal nem aprovação do candidato atual. Logs vermelhos originais
continuam preservados em `phase-3-modal-save-fix/ci-3d8c6a9-failed.log`.

Fontes primárias consultadas: [hooks Claude Code](https://code.claude.com/docs/en/hooks),
[WM_NCLBUTTONDOWN](https://learn.microsoft.com/en-us/windows/win32/inputdev/wm-nclbuttondown),
[CLI cargo-llvm-cov v0.9.1](https://github.com/taiki-e/cargo-llvm-cov/blob/v0.9.1/README.md).
Não se executou cobertura instrumentada nova localmente nesta rodada.

Na ausência de defeito novo confirmado, outra rodada técnica idêntica não
resolveria as pendências. Concluir esta revisão, obter os aceites externos e
registrar o resultado final do CI do SHA exato é o trabalho restante.
