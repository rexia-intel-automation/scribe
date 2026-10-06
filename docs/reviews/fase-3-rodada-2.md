# Fase 3 — revisão adversarial independente, rodada 2

Data: 2026-10-06. **Veredito: REPROVADA.** Candidato congelado: **18ebdea084c991d3a1bd9affb100d56fbc3cfe39**, base **824c4ce8f687620d41f568cce4564a5f8bbce902**, PR [#5](https://github.com/rexia-intel-automation/scribe/pull/5). G e H não atingem as catracas 9. Nenhum problema crítico ou alto foi encontrado nesta rodada; isso não equivale a cumprir os critérios restantes. Aceite visual humano e arraste físico continuam pendentes. Nenhuma nota 10.

## Escopo e independência

Li `prompt.md` inteiro, o diff da fase, os testes, as capturas e os artefatos. Não participei da implementação. Todas as referências de linha são de `git show 18ebdea:<arquivo>`, mesmo quando o checkout recebe correções posteriores. As Fases 0–2 são a base aprovada; não reabro suas catracas nem cobro cartões, notificações de decisão, permitir/negar/expirar ou MCP da Fase 4. A ausência de decisões no candidato foi verificada como propriedade de segurança.

O relatório da rodada 1 refere-se a **3a12b86** e permanece reprovado e inalterado, inclusive suas referências originais. Resultados desta rodada não alteram retroativamente aquele relatório. Alterações posteriores a 18ebdea, inclusive errata dos diagnósticos de CDP anunciada pelo implementador durante a revisão, exigem evidência própria e não são incorporadas ao candidato congelado.

Execução somente no espelho sem Git `D:/RexIA/projetos/scribe`. Fixtures públicas: `SCRIBE_TEST_FIXTURES_ROOT=C:/Users/engmo/OneDrive/RexIA/RexIA/projetos/scribe/app/src-tauri/tests/fixtures/hooks`. Harnesses e logs novos: `D:/RexIA/projetos/scribe/app/.artifacts/phase-3-review-2`. A única escrita na fonte feita por este revisor é este relatório. Não alterei código, fiz commit, push ou merge.

Usei [Computer Use](C:/Users/engmo/.codex/plugins/cache/openai-bundled/computer-use/26.930.31730/skills/computer-use/SKILL.md) e `@oai/sky` para ações na janela Windows de produção isolada, PID 14084. Configuração/histórico exclusivos de `.artifacts/phase-3-native`; nenhum terminal por UI, sessão pessoal ou decisão humana simulada. CDP 9223 foi usado para ler DOM, axe e enviar hooks públicos ao servidor isolado. Conexões novas usam `noDefaults:true`, preservando mídia/foco do WebView. Não executei `browser.close()`. Token/configuração completa nunca foram impressos. Preferências somente leitura foram restauradas a `false`, e o app foi devolvido aberto, 372×784, sem alerta, no final (`native-final.json`).

## Notas e catraca

| Área | Nota / mínima | Evidência e fundamento |
| --- | --- | --- |
| A — Claude Code | **8 / 8** | Diff sem alterações de manifestos/hooks/MCP aprovados. 21 testes do núcleo reexecutados incluem contratos públicos, mapeamento e helper real. Na produção isolada, `PermissionRequest` respondeu 204, sem decisão ou botão de aprovação; `native-security.json`. Eventos conferidos na referência oficial de hooks. Não testei sessões pessoais ou novos fluxos reais de Claude. |
| B — Correção funcional | **8 / 8** | 17 Vitest, 4 E2E e observação nativa confirmam origem compacta, oito passos, modalidades, idioma/tema, recolher/reabrir, persistência segura de layout. P1/P3 são falhas localizadas de feedback/dica; arraste físico continua sem confirmação, apesar do equivalente por teclado implementado. Esta nota não declara FR-31 inteiro aprovado. |
| C — Segurança | **8 / 8** | `desktop.rs:240–261` restringe janela/origem; capability limita comandos, CSP usa assets/IPC locais. Testes do núcleo e ensaio nativo rejeitaram token ausente (401), Origin externo (403) e rota de decisão (404); segredo público não chegou ao DOM. Dois avisos GTK permanecem como exceções documentadas, sem afirmação de dependência corrigida. |
| D — Robustez/falha segura | **8 / 8** | `desktop.rs:347–390` grava antes do layout, faz rollback e mantém 372×784 com arquivo somente leitura. Políticas SQL atômicas passaram em `tests/policies.rs`. P1/P2 afetam percepção da falha/recuperação, sem bloqueio de Claude ou corrupção observado. Falhas de snap físico e múltiplos monitores não foram exercitadas nesta rodada. |
| E — Qualidade de código | **8 / 8** | Ponte sanitizada, revisão serializada em `desktop.rs:264–285`, validação bounded, renderer compartilhado e limpeza de listeners. ESLint, Prettier e build passaram. Tratamento de erro disperso em `App.tsx:310/345/375/391` deixa lacunas específicas P1/P2; corrigir sem refatorar escopo adjacente. |
| F — Testes | **8 / 8** | 28 Rust desktop e 17 Vitest passaram; 4 E2E passaram com `CI=true` e servidor iniciado pelo teste. Harness independente: 8 novos casos, 3 falhas e 5 resistências. Axe nativo claro entregue e escuro reamostrado ampliam cobertura, porém não verificam glifos do canvas (P4), arraste físico, zoom nem leitor de tela humano. |
| G — Fidelidade visual e UX | **8 / 9** | Inspecionei capturas claro/escuro com 10 formas em 24/40/96 px e janela nativa escura; fontes/tokens locais e formas presentes. P4 prejudica informação visual de estado no escuro; P1 silencia falha na gota. Sem aceite visual humano exigido por §10 e sem confirmação de arraste físico. Não posso atribuir 9 com esses critérios em aberto. |
| H — Acessibilidade | **7 / 9** | Nomes/descrições, modal, foco visível, setas de movimento, Enter/Space e reduced-motion são cobertos. Axe reamostrado em sessões/erro escuros: zero violações. P1 omite anúncio de falha e P4 fica abaixo de 3:1 para o glifo informativo; axe não mede pixels de canvas. Zoom/reflow e leitor de tela humano não foram comprovados. |
| I — Desempenho | **8 / 8** | Testes FPS/hidden/reduced-motion passaram. Reamostra independente de 15 s: private WS app+WebView2 99,75 MiB; CPU 0,455125% da máquina/8 processadores. Artefato entregue p95 20,90 ms em 32 eventos é identificado como medição do implementador. Sem reamostra de latência nesta rodada nem recursos macOS/Linux; métrica de memória precisa permanecer explícita. |
| J — Documentação | **8 / 8** | ADR 0008, dependências, changelog e roteiro registram decisões e limites. Início limpo E2E agora reproduzível. P5 atribui tema escuro a artefatos que declaram claro; é erro factual a corrigir. Os docs não podem converter revisão humana/arraste em aceites. |

K não se pontua na Fase 3; CI verde continua obrigatório pelo ritual §13.4. Não há nota 9/10, portanto não ocorre a condição de invalidação por inflação do §13.1.7. Problemas encontrados têm repro/evidência, não foram inventados para satisfazer uma contagem.

## Problemas acionáveis

### P1 — Médio: falhas do modo recolhido ficam sem feedback visual ou anúncio

**Local:** `app/ui/src/App.tsx:355–410`, especialmente o catch da movimentação na linha 375 e do arraste na 391. O retorno recolhido renderiza somente o botão/canvas, sem `error`, `view.error`, `role=alert` ou mensagem equivalente. O catch das setas também perde `configUnavailable` e transforma toda causa em `bridgeUnavailable`.

**Repro independente:** iniciar com `collapsed=true`, rejeitar `bridge.move` com `configUnavailable`, focar a gota e pressionar ArrowLeft. O teste `new: arrow movement failure is announced...` falha: nenhum `role=alert`. Na produção, recolhi a janela, tornei somente `preferences.json` isolado readonly, usei Tab/Left e li o DOM: gota 56×56, foco no botão, nenhum alerta (`native-failed-move.json`). Restaurei readonly=false. O usuário não consegue distinguir comando perdido de configuração indisponível.

**Correção verificável:** anunciar o erro também recolhido, com indicação visível e descrição legível/descobrível, preservar a causa específica, e testar falhas de mover/arrastar/abrir mantendo foco e geometria. Não exigir toast grande ou reabertura automática. Erro deve permanecer acessível até recuperação pertinente. [W3C — mensagens de status e problemas anunciados sem deslocar foco](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html).

### P2 — Baixo: alerta local permanece após recuperação pelo atalho global

**Local:** `app/ui/src/App.tsx:305–326`, `342–351`; `desktop.rs:372–390/741–753`.

O sucesso de `toggle()` limpa erro, mas o sucesso recebido por `observe/receive` não. A correção da rodada 1 cobre somente recuperação que passa pelo método React. Atalho global/bandeja usam Rust e snapshots, deixando o erro local antigo visível.

**Repro real:** painel aberto, preferências readonly, clique Recolher produz alerta correto e preserva 372×784. Restaurar gravação e usar Ctrl+Shift+Space duas vezes recolhe/reabre com sucesso, mas o alerta “Não foi possível salvar as configurações” permanece (`native-persist-failure.json`, `native-global-recovery-collapsed.json`, `native-recovered-stale-alert.json`). Operação explícita pelo botão React limpou o erro depois; app foi devolvido sem alerta. Harness `new: fresh successful observation clears...` também falha após revisão nova válida.

**Correção verificável:** definir quando cada erro recuperável cessou e limpar a falha local ao receber evidência de recuperação relevante, incluindo atalho/bandeja; preservar erro persistente vindo do Rust. Não apagar toda falha por um snapshot periódico que ainda descreva a mesma falha.

### P3 — Baixo: sessões restauradas suprimem dica de plug-in sem eventos

**Local:** `app/ui/src/App.tsx:489`; `prompt.md` §7.3.

O critério é “nenhum evento recebido 5 min após abrir”, mas a condição usa ausência de sessões. Ao reiniciar com sessão restaurada do SQLite e plug-in desconectado, há sessão e zero evento novo, então a dica nunca aparece. O harness avança 300001 ms após montar uma sessão cujo `lastEventAt` é anterior à abertura; a busca por “Nenhum evento recebido...” falha.

**Correção verificável:** acompanhar último evento real após abertura, ou comparar datas de último evento com abertura de forma explícita; snapshots/ticks restaurados não contam como hooks novos. Cobrir sessão restaurada sem hook, sessão nova com hook e lista realmente vazia. Não confundir a dica com ausência de dados históricos.

### P4 — Médio: glifo informativo de interrogação no escuro tem contraste inferior a 3:1

**Local:** `app/ui/src/style.css:35/40`; `app/ui/src/gota/render.ts:132–138/228–237/270/290–311`. A mesma cor de texto `#f0eee6` é usada no `?` sobre corpo argila `#e08562` com gradiente de borda 15% mais escuro. A relação entre as cores nominais é **2,34747:1**, abaixo de 3:1. O corpo adjacente ao arco superior continua insuficiente: na captura congelada escura 1080×1550, glifo em (426,920) é RGB(240,238,230), corpo em (420,920) RGB(219,130,96), **2,45153:1**.

O `?` informa o estado no cabeçalho e especialmente na gota recolhida, sem texto visual equivalente. `aria-label` oferece alternativa para leitor de tela, mas não resolve legibilidade visual de usuários com baixa visão. O problema não é a cor argila contra o papel, e sim o marcador interno necessário para distinguir o estado. Não classifico olhos decorativos como informação obrigatória. O check do selo usa o mesmo mecanismo e merece a mesma verificação.

**Reprodução:** `python .artifacts/phase-3-review-2/contrast.py` na pasta app de D gera `contrast.json`, usando fórmula de luminância WCAG e a captura original congelada. A análise de cores nominais fundamenta o critério; pixels são corroboração local, não uma medição completa de antialiasing. A inspeção da janela escura e `native-public-permission.png` confirmam uso no produto.

**Correção verificável:** cor/contorno de glifos de estado com pelo menos 3:1 em todo fundo relevante, mantendo identidade da argila; registrar no ADR qualquer ajuste necessário ao token original do PRD para atender NFR-08. Verificar glifos em claro/escuro e 24/40/56/96 px. Um axe verde sozinho não prova esse contraste. [W3C — contraste não textual, componentes e gráficos informativos](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html).

### P5 — Baixo: documentação declara tema escuro para evidências claras

**Local:** `docs/fase-3.md:134–138`; `docs/evidence/native-a11y-{collapsed,sessions,details,settings,error}.json:5`.

O parágrafo diz que cinco estados de produção escuros tiveram zero violações; todos os JSON entregues informam `theme: light`. A alegação não corresponde ao artefato. Nesta rodada reamostrei sessões/erro escuros com `noDefaults:true`, ambos sem violações axe, mas isso não comprova os outros três estados escuros nem corrige o texto do candidato.

**Correção verificável:** descrever os cinco estados como claros, guardar nome do tema no artefato, preservar mídia/foco com CDP `noDefaults:true`, e separar novas medições escuras. O implementador anunciou errata diagnóstica posterior durante a revisão; ela não muda esta conclusão sobre 18ebdea. Ausência de violações axe não significa aprovação completa de acessibilidade, sobretudo P4.

## Correções da rodada 1 avaliadas

| Problema histórico | Resultado desta rodada |
| --- | --- |
| P1 alto, webServer cwd | **Corrigido.** `playwright.config.ts:21` deriva cwd de import.meta.url; 4 E2E passaram com CI=true/início limpo. Nenhum servidor preexistente reutilizado. |
| P2 médio, layout antes da persistência | **Corrigido no caminho recolher.** Readonly real preservou 372×784 e alertou configUnavailable; `apply_layout`, `native-persist-failure.json`. Falha nativa de set_size/set_position não foi injetada. |
| P3 médio, origem só expandida | **Corrigido.** `App.tsx:57–62`, teste de linha compacta e árvore nativa exibem startup antes de expandir. |
| P4 médio, timestamp igual | **Corrigido.** `desktop.rs:264–285` serializa captura/revisão; App recebe somente revisão maior. Teste existente e novo com revisão duplicada e wall time maior resistiram. |
| P5 baixo, DPR estático | **Corrigido.** Resize/resolution repinta; teste existente e novo com 25 eventos repintaram uma vez, 24→48 físicos, sem animar. Troca física de monitor não foi ensaiada. |
| P6 médio, movimento só por ponteiro | **Corrigido como alternativa de teclado.** `App.tsx:362–375` e `desktop.rs:395–427` implementam setas com dica acessível. Teste do produto passa; artefato nativo fornecido documenta lados/altura. Sem prova de arraste físico. Falha dessa alternativa revelou P1 atual. |
| P7 baixo, erro após recuperação | **Parcialmente corrigido.** Botão React limpa; recuperação pelo atalho/snapshot ainda reproduz P2 atual. |

O estado reprovado da rodada 1 permanece preservado.

## Tentativas de quebra novas e resultados

| # | Tentativa | Resultado |
| --- | --- | --- |
| 1 | Falha específica de mover com gota recolhida, procurando anúncio | **Quebrou** no harness e nativamente; P1, `native-failed-move.json`. |
| 2 | Snapshot novo válido após erro local, sem passar pelo botão React | **Quebrou** no harness; recuperação real por atalho manteve alerta; P2. |
| 3 | Reinício com sessões restauradas, nenhum hook por cinco minutos | **Quebrou** no harness com relógio controlado; P3. Não esperei cinco minutos na janela real. |
| 4 | Falha de movimento seguida de abrir por Enter | **Resistiu quanto à abertura/recuperação:** abrir funciona, revisão atual recebida, alerta local some. Isso não justifica ocultar a falha anterior. |
| 5 | DPR estático 1→2 com 25 eventos resize consecutivos | **Resistiu:** exatamente um redraw, 48 físicos e reduced-motion estático. |
| 6 | Ativar movimento reduzido no meio da transição | **Resistiu:** alvo final e geometria de origem iguais, changed=-Infinity, active=false. Teste de estado do renderer, não comparação pixel a pixel. |
| 7 | Revisão lógica duplicada com wall time maior e sessão antiga | **Resistiu:** não ressuscitou a sessão removida. |
| 8 | Salvar configurações com portBusy | **Resistiu:** alerta específico e sessões preservadas no harness. Não é novo conflito nativo de porta. |
| 9 | Contraste do marcador `?` interno na gota escura | **Quebrou:** 2,34747 nominal / 2,45153 amostra <3:1; P4. |
| 10 | Produção isolada: sem token, Origin externo e rota de decisão | **Resistiu:** 401, 403, 404, respectivamente; `native-security.json`. |
| 11 | PermissionRequest público com segredo de teste | **Resistiu:** 204 sem decisão, sem botões permitir/negar, sem segredo no DOM, estado interrogação presente. Não simulei decisão humana. |
| 12 | Falha readonly ao recolher, restauração e atalho global | **Layout resistiu**, alerta após recuperação falhou; P2. Arquivo restaurado e app devolvido aberto/sem alerta após operação pelo botão. |

Harness novo: `app/.artifacts/phase-3-review-2/review.test.tsx` e `review.config.ts` na cópia D. **8 testes: 5 passam / 3 falham, exit 1**; JSON `vitest.json` preservado. Reproduzir a partir de app com `npm.cmd exec -- vitest run --config .artifacts/phase-3-review-2/review.config.ts --reporter=json --outputFile=.artifacts/phase-3-review-2/vitest.json`. Falhas documentadas são resultado adversarial esperado, não teste de produto alterado. Não sobrescrevi harness/log da rodada 1.

## Verificações, desempenho e limitações

Reexecutei no espelho: **17/17 Vitest**, **28/28 Rust** (5 biblioteca + 21 núcleo + 2 políticas), **4/4 Playwright CI=true**, ESLint, Prettier, TypeScript/Vite build e npm audit (zero vulnerabilidades). Cargo usa features desktop/locked e fixtures públicas; não roda em OneDrive. Não reexecutei compilação release Rust/clippy/cobertura: release fornecido abriu, e CI/results do implementador têm sua própria autoria. Os E2E são testes de browser/previews, não interações nativas ou sessões reais de Claude.

Novas evidências de produção: `native-security.json`, `native-persist-failure.json`, `native-failed-move.json`, `native-recovered-stale-alert.json`, `native-final.json`, captura pública e `native-a11y-sessions-dark.json`/`native-a11y-error-dark.json` nos artifacts da rodada 2. Axe escuro reamostrado: zero violações em sessões/erro. Artefatos públicos entregues comprovam cinco estados **claros**, sem converter isso em aprovação de canvas/zoom/leitor de tela.

Medição independente de recursos via PowerShell 7 e `scripts/verification/measure-desktop.ps1`: PID 14084, **15 s**, oito processadores lógicos, processo nativo working set **36,09 MiB**, soma app+WebView2 private WS **99,75 MiB**, soma bruta WS **407,57 MiB**, CPU **3,641% de um núcleo / 0,455125% da máquina**. Log `resources.json`. Private WS não é RSS agregado nem memória comprometida; soma bruta conta páginas compartilhadas várias vezes. NFR-04 só está apoiado na métrica privada declarada, não comprovado de maneira irrestrita. Não houve compilação concorrente nessa medição. CPU nesta amostra atende NFR-05; amostra curta não cobre todas as cargas.

Os artefatos entregues de latência (p95 **20,90 ms**, 32 eventos, Windows produção) e FPS (61 desenhos no grande, pequenos até 30, pausa reduzida) foram inspecionados e são do implementador. FPS/reduced-motion/hidden foram reexecutados em testes; não reamostrei latência nativa. macOS/Linux primários, multi-monitor/DPI físico, zoom/reflow, conflitos reais de atalho, bandeja/menu e arraste físico continuam limites explícitos. Não atribuí sucesso a testes não feitos nem usei a inspeção de capturas como aceite visual humano.

## Dependências e fontes primárias

Reexecutei `cargo tree --features desktop --locked --target x86_64-unknown-linux-gnu -i glib`: **glib 0.18.5** continua na árvore GTK/Tauri. [RUSTSEC-2024-0429](https://raw.githubusercontent.com/RustSec/advisory-db/main/crates/glib/RUSTSEC-2024-0429.md) é unsoundness em VariantStrIter, corrigido >=0.20; [RUSTSEC-2024-0370](https://raw.githubusercontent.com/RustSec/advisory-db/main/crates/proc-macro-error/RUSTSEC-2024-0370.md) é ausência de manutenção. `docs/dependencias-desktop.md` reconhece o risco e a inferência estática de não alcance. A análise prévia de fontes relatou somente definição/docs/testes de array_iter_str, mas não refiz essa busca de todo registry nesta rodada. Não trato a exceção como crate corrigido ou prova formal; aceitável como risco explícito nesta fase, reavaliável na Fase 5/Linux. Uma chamada alcançável invalida a exceção. CI só ignora esses IDs específicos; novos avisos permanecem bloqueantes.

Fontes primárias consultadas: [Claude Code — hooks](https://code.claude.com/docs/en/hooks), [W3C — foco](https://www.w3.org/WAI/WCAG22/Understanding/focus-order.html), [W3C — reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html), [W3C — contraste não textual](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html), avisos RustSec acima. As relações de contraste foram calculadas diretamente; não deduzidas de um axe verde.

## CI e próximos requisitos da catraca

Última consulta durante a revisão (2026-10-06, aproximadamente 14:48 UTC): [run PR 37480091393](https://github.com/rexia-intel-automation/scribe/actions/runs/37480091393), head **18ebdea**, **in_progress**; audit e macOS **success**, Windows/Linux ainda **in_progress**. Resultado intermediário não é CI verde. O run duplicado de push não substitui o run do PR. Falhas históricas de outros candidatos e passes locais permanecem identificados como históricos/locais.

Para nova rodada: corrigir P1/P2/P3/P4, tornar docs/evidências coerentes em P5, obter CI do novo candidato e rever alterações independentemente. O humano ainda precisa avaliar reconhecimento/fidelidade das dez formas a 24 px e confirmar arraste físico/snap/persistência; a alternativa de teclado não comprova o arraste. Não avançar à Fase 4 com esta revisão reprovada.
