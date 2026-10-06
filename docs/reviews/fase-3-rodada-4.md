# Fase 3 — revisão adversarial independente, rodada 4

**Veredito: REPROVADA.** G8 e H8 ficam abaixo da catraca G9/H9 do
`prompt.md` §13.3. Há um defeito baixo confirmado de continuidade de foco.
Aceite visual humano e arraste físico continuam sem resposta/prova suficiente;
testes automatizados e capturas não substituem esses aceites.

## Identidade e limites

- Data: 2026-10-06, aproximadamente 12:31 BRT.
- Candidato congelado: `f3cacc21a9b5900d027bcea5d6d5fd9adf29ca90`.
- Base da fase: `824c4ce8f687620d41f568cce4564a5f8bbce902`.
- [PR #5](https://github.com/rexia-intel-automation/scribe/pull/5).
- Revisor independente sem participação na implementação. Leitura integral
  de `prompt.md`, diff base→candidato, código, testes, ADR 0008 e evidências.
  Relatórios R1–R3 são históricos, não autorização nem aprovação herdada.
- Testes executados com PowerShell 7 em `D:/RexIA/projetos/scribe`, fora do
  OneDrive. Fixtures Rust apontadas para a fonte pública por
  `SCRIBE_TEST_FIXTURES_ROOT`. Logs/harness novos somente em
  `D:/RexIA/projetos/scribe/app/.artifacts/phase-3-review-4`.
- `frozen-hashes.json` compara blobs Git com a cópia D: App, renderer,
  desktop Rust e E2E são idênticos ao candidato. Correções posteriores do
  implementador na fonte não fazem parte desta revisão.
- Sem edição de produto, commit, push, merge, limpeza de histórico por UI,
  decisão de permissão ou autenticação. Sem cobrança de cartões/notificações
  da Fase 4 ou instaladores da Fase 6.

## Execuções próprias

| Execução | Resultado e evidência local |
| --- | --- |
| Vitest, produto + 9 tentativas próprias | **36/37**, incluindo **28/28** do produto. R4-08 falha por perda de foco. `vitest-recheck.log` e `review.test.tsx` |
| Primeira execução do harness | `vitest.log` preservado: seletor de teste incorreto `Fechar`; corrigido para o nome real `Fechar configurações`. Essa falha inicial é do harness, não do produto |
| Chromium, reprodução adicional do foco | **0/1**, falha R4-10. `focus.spec.ts`, `focus-e2e.log`, `focus-browser.json` e `focus-results/**/trace.zip` |
| Sete E2E de produto, servidor inicial limpo | **7/7**. Cópia fiel dos testes com somente destino dos artefatos alterado para preservar logs anteriores; `product-window.spec.ts`, `playwright.config.ts`, `e2e.log` |
| Rust com feature desktop e fixtures públicas | **28/28**: 5 unidades desktop, 21 contratos/núcleo e 2 políticas. `cargo-test.log`; doc-tests e alvo binário têm zero testes |
| ESLint, Prettier, build UI | Todos exit 0. `checks.json`, `lint.log`, `format.log`, `build.log` |
| `npm audit --audit-level=low` | Exit 0, zero vulnerabilidades. `npm-audit.log` |
| Axe no WebView de produção | Zero violações A/AA no modal observado e no painel restaurado, sem overflow, 372×784, escuro, pt-BR. `native-readonly.json`, `native-restored.json` |

Comandos reproduzíveis, a partir de `D:/RexIA/projetos/scribe/app`:

```powershell
node node_modules/vitest/vitest.mjs run --config .artifacts/phase-3-review-4/vitest.config.ts --reporter=verbose
node node_modules/@playwright/test/cli.js test --config .artifacts/phase-3-review-4/focus-playwright.config.ts
node node_modules/@playwright/test/cli.js test --config .artifacts/phase-3-review-4/playwright.config.ts
cargo test --manifest-path src-tauri/Cargo.toml --features desktop --locked -- --test-threads=1
```

O harness permanece deliberadamente vermelho para preservar a reprodução.
Não confundir esta contagem com o recheck R3 39/39 executado pelo implementador.

## Tentativas de quebra próprias

| ID | Tentativa | Resultado |
| --- | --- | --- |
| R4-01 | Snapshot antigo/duplicado com timestamp artificialmente futuro | Resistiu: revisão monotônica impede restauração de sessões obsoletas |
| R4-02 | Desmontar App antes de a inscrição da ponte resolver | Resistiu: listener tardio é liberado exatamente uma vez |
| R4-03 | Projeto sintético contendo markup e handler HTML | Resistiu: React apresenta texto, não cria elemento `img` |
| R4-04 | Múltiplos movimentos enquanto pressionado e liberação depois de iniciar drag | Resistiu no contrato UI: apenas uma chamada `drag`, nenhuma `toggle`. **Mock não prova deslocamento físico** |
| R4-05 | Save de preferências rejeitado por `portBusy` | Resistiu: sessão preservada e causa específica traduzida |
| R4-06 | Cancelar confirmação de apagar histórico | Resistiu: nenhuma chamada nativa de limpeza. Apenas harness isolado, sem limpeza na janela Windows |
| R4-07 | Trinta passos e abertura por Enter | Resistiu: aparecem somente os oito últimos, sem passos antigos |
| R4-08 | Modal aberto → snapshot recolhido → snapshot aberto → fechar modal | **Quebrou:** foco termina em `BODY`, sem retornar ao controle disponível |
| R4-09 | Formas estacionárias sem olhos, todos os tamanhos aplicáveis, após prazo máximo de piscada | Resistiu: nenhuma repintura nos casos testados, inclusive a 10 s |
| R4-10 | Repetir R4-08 em Chromium separado com ponte nativa substituída por proxy explícito | **Quebrou:** após Escape o diálogo sai, `focusedTag=BODY`, botão Configurações inativo. Mesmo defeito de R4-08, não um segundo problema |

Os E2E próprios de produto ainda confrontaram geometria 24/40/96 px, glifos
24/40/56/96 px nos dois temas, fontes locais, ausência de requests externas no
catálogo, movimento reduzido e prazo de piscada. As quinze variantes do teste
após 6,5 s tiveram zero repinturas durante 1,1 s adicionais. A órbita grande
teve 61 desenhos no intervalo de aproximadamente um segundo; pequenas tiveram
31, dentro da tolerância temporal do teste. Isso não prova ausência total de RAF.

## Problema confirmado

### P1 — baixo: fechar configurações após troca de modo perde continuidade de foco

Arquivos congelados: [App.tsx:105](https://github.com/rexia-intel-automation/scribe/blob/f3cacc21a9b5900d027bcea5d6d5fd9adf29ca90/app/ui/src/App.tsx#L105),
[cleanup:122](https://github.com/rexia-intel-automation/scribe/blob/f3cacc21a9b5900d027bcea5d6d5fd9adf29ca90/app/ui/src/App.tsx#L122),
[troca de modo:331](https://github.com/rexia-intel-automation/scribe/blob/f3cacc21a9b5900d027bcea5d6d5fd9adf29ca90/app/ui/src/App.tsx#L331),
[retorno recolhido:375](https://github.com/rexia-intel-automation/scribe/blob/f3cacc21a9b5900d027bcea5d6d5fd9adf29ca90/app/ui/src/App.tsx#L375)
e [montagem do modal:538](https://github.com/rexia-intel-automation/scribe/blob/f3cacc21a9b5900d027bcea5d6d5fd9adf29ca90/app/ui/src/App.tsx#L538).

Reprodução: abrir Configurações; receber atualização nativa que recolhe o
painel; receber atualização que reabre; fechar o modal por Escape. O estado
`settings` é conservado, mas a árvore do modal/opener é desmontada. Na
remontagem o opener capturado é um elemento removido ou `BODY`. A restauração
condicionada a `source.isConnected` não garante um controle focável de fallback.
O efeito da troca de modo evita focar o botão quando `settings=true`.

Esperado: ao fechar o modal, continuar com foco visível em Configurações ou
outro controle adequado do painel. Observado: `BODY`. É recuperável por Tab,
por isso a gravidade é **baixa**, não há travamento de navegação nem decisão
automática. Evidência concordante no JSDOM R4-08 e Chromium R4-10; o proxy
imita snapshots da ponte, não a ação do atalho nativo. Não alego reprodução
Windows desta sequência: a janela foi preservada para o teste humano pendente.
O fechamento normal do modal nativo por Escape devolveu foco a Configurações,
portanto o achado é específico à desmontagem durante mudança de modo.

Referência primária: [WAI-ARIA — diálogo modal](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)
prevê restaurar foco ao invocador, ou a um elemento apropriado quando ele deixa
de existir. NFR-08 requer navegação por teclado completa e foco visível.

## Pendências de aceite, separadas dos defeitos

1. **Visual humano:** examinei as capturas novas nos dois temas. Dez formas e
   argila estão presentes; os glifos têm medição automatizada de contraste.
   Não houve resposta humana para reconhecibilidade a 24 px, estética/movimento
   nem aceite comparativo das referências. `prompt.md` §7.4/§10 exige revisão
   humana visual. Minha leitura das imagens não equivale ao aceite solicitado.
2. **Arraste físico FR-31:** `docs/fase-3.md:109` preserva a falha do arraste
   Sky pequeno, sem deslocamento. Empacotamento correto de coordenadas Win32,
   teste do contrato UI e movimento por setas não demonstram arrastar e grudar
   na borda. Nenhuma resposta humana ou reprodução física bem sucedida chegou
   até esta revisão. Não atribuo a falha ao teste sem prova e não declaro
   funcionalidade aprovada. A fonte [Microsoft WM_NCLBUTTONDOWN](https://learn.microsoft.com/en-us/windows/win32/inputdev/wm-nclbuttondown)
   confirma coordenadas de tela empacotadas; isso valida representação, não o
   fluxo inteiro de arraste.

Também não executei leitor de tela humano, zoom nativo, bandeja/conflito de
atalho em outras plataformas. Essas limitações impedem afirmar excelência
completa em H e G. Não as multiplico artificialmente como novos defeitos.

## Notas e catraca

| Área | Nota | Mínima | Evidência e limite |
| --- | --- | --- | --- |
| A — Claude Code | 8 | 8 | `cargo-test.log`: 21 contratos/núcleo verdes; sessões sem novas APIs Claude no diff da UI. [Referência oficial de hooks](https://code.claude.com/docs/en/hooks) conferida. Não reexecuto o aceite real das fases anteriores |
| B — Funcional | 8 | 8 | R4-01/04/05/07, 7 E2E e `native-restored.json`; lista, detalhe e modos sustentados. Arraste FR-31 ainda sem prova e P1 é baixo |
| C — Segurança | 8 | 8 | R4-03 não executa markup; Rust `only_local_asset_origins_can_navigate_or_invoke` verde, CSP e capability `main` restritas; npm audit zero. Dois avisos GTK com exceções específicas documentadas, sem alegação de auditoria total |
| D — Robustez | 8 | 8 | R4-01/02/05, 2 testes de políticas e 21 de núcleo verdes. Falhas de save preservam sessões, revisão rejeita retorno atrasado. Não reiniciei/paralisei o processo de produção |
| E — Código | 8 | 8 | ESLint/Prettier/build passam, separação Rust/bridge/App/renderer clara; App:105–124 carece de fallback na remontagem do modal (P1) |
| F — Testes | 8 | 8 | 28 produto Vitest, 28 Rust e 7 E2E verdes; harness encontra lacuna de modal + modo, confirmada em Chromium. Axe não detecta sozinho esse fluxo |
| G — Visual e UX | **8** | **9** | Capturas novas `browser/forms-{light,dark}-24-40-96.png` vistas; 10 formas, fontes locais e contraste testados. Aceite humano visual e arraste físico faltam; P1 prejudica continuidade do fluxo |
| H — Acessibilidade | **8** | **9** | Axe nativo e catálogo zero violações, movimento reduzido e teclado comum verdes; R4-08/10 demonstram foco em BODY após remontagem. Leitor de tela/zoom humano não ensaiados |
| I — Desempenho | 8 | 8 | `browser-frame-rates.json`, `browser-settled-forms.json` e R4-09 próprios. Histórico `docs/evidence/desktop-native-round3.json` p95 23,46 ms; recursos históricos privados 95,88 MiB e CPU 1,053%, soma bruta 391,32 MiB. Essas medições nativas são artefatos fornecidos, não nova amostra minha; não trato working set bruto como privado |
| J — Documentação | 8 | 8 | ADR 0008 e `docs/fase-3.md` explicam limite do drag, correções, mídia CDP e evidências; `docs/dependencias-desktop.md` explicita risco GTK residual. P1 novo requer registro/correção subsequente; docs não dizem fase aprovada |
| K — Release | — | — | Não avaliada nesta fase; CI é requisito do ritual §13.4, não instaladores futuros |

**Anti-inflação (§13.1.7):** nenhuma nota 10; notas A–J são 8 com limites
explícitos, portanto a regra de todas 9/10 não é acionada. Encontrado **um**
defeito, reproduzido por dois meios; duas pendências de aceite não viram três
defeitos para preencher contagem. G/H mantêm mínimas 9 sem rebaixamento.

## CI e estado devolvido

[Run PR 37487046527](https://github.com/rexia-intel-automation/scribe/actions/runs/37487046527)
tem `headSha=f3cacc21a9b5900d027bcea5d6d5fd9adf29ca90`.
Consulta própria salva em `ci-pr.json`: auditoria concluída com sucesso,
incluindo `npm audit --audit-level=low`; jobs Windows/macOS/Linux ainda em
andamento. Não uso CI anterior verde como aprovação deste candidato nem
aguardo o CI para este veredito. Mesmo se ele passar, P1 e as pendências de
aceite/catraca permanecem.

Skill Computer Use aplicada para seleção da janela real e duas ações comuns:
abrir configurações, depois Escape para restaurar. A abertura teve refresh
Sky antes de o modal aparecer; inspeção DOM posterior confirmou o modal, que
foi fechado após coordenação com o implementador. Todas as ações Windows
usaram exclusivamente `node_repl` + `@oai/sky`, observar→parar→ação→refresh.
CDP foi somente diagnóstico DOM/axe, `noDefaults:true`, sem `browser.close()`.

Estado final inspecionado: processo de produção preservado, painel **372×784**,
tema **escuro**, idioma **pt-BR**, **sem modal, sem alerta, sem overflow**, foco
em Configurações. Preferências isoladas continuam `IsReadOnly=false`.
`native-restored.json` registra esse estado. A janela está liberada para o
teste físico humano; nenhuma aprovação humana foi simulada.

Para encerrar a Fase 3: corrigir P1 com regressão equivalente, obter os aceites
pendentes e nova revisão independente sobre o novo candidato, preservando
este relatório e os anteriores. Não avançar à Fase 4 com a catraca atual.
