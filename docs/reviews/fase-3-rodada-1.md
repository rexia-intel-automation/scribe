# Fase 3 — revisão adversarial independente, rodada 1

Data: 2026-10-06. **Veredito: REPROVADA.** A fase não pode avançar: há um problema alto no candidato e B, D, F, G e H estão abaixo das respectivas catracas. Há ainda critérios nativos e avaliação visual humana pendentes. Nenhuma nota 10 foi atribuída.

## Escopo e isolamento

Revisor independente, sem participação na implementação. Li `prompt.md` inteiro e o diff da base `824c4ce8f687620d41f568cce4564a5f8bbce902` ao candidato **`3a12b86`** da branch `codex/phase-3`. Esta rodada avalia exclusivamente esse candidato. Alterações posteriores do implementador, inclusive o ajuste de `webServer.cwd`, não mudam retroativamente o resultado. Todas as referências de linha abaixo são desse commit, conferidas com `git show`, e não do checkout que estava recebendo correções durante a revisão.

Fases 0–2 aprovadas são a base; cartões, decisões, notificações de decisões e ensaios de permitir/negar/expirar permanecem na Fase 4. Não tratei sua ausência nesta fase como defeito. K não é pontuada na Fase 3, mas CI verde segue sendo exigência do ritual §13.4.

Executáveis/testes somente em `D:/RexIA/projetos/scribe`, sem Git. Fixtures públicas fornecidas por `SCRIBE_TEST_FIXTURES_ROOT`. Inspecionei a janela isolada de produção `scribe.exe`, PID 2756, usando a skill Computer Use e APIs documentadas `@oai/sky`; não controlei terminais por UI, não acessei sessões pessoais, não imprimi tokens e não simulei decisões humanas. Escrita na fonte limitada a este relatório. Harnesses e logs ficaram sob `.artifacts/phase-3-review-1` na cópia D.

## Notas e catraca

| Área | Nota / mínima | Evidência e fundamento |
| --- | --- | --- |
| A — Claude Code | **8 / 8** | O diff não altera manifestos/hooks/MCP aprovados. Os 21 testes de integração do núcleo passaram, incluindo contratos de fixtures públicas e ausência de rota de decisão. A ponte usa apenas sessões sanitizadas (`desktop.rs:262`, `bridge.ts:26`). Conferi os eventos no documento oficial de hooks. Sem observação de novas sessões reais de Claude nesta rodada. |
| B — Correção funcional | **7 / 8** | Sessões, últimas oito etapas, troca de idioma/tema, recolher e reabrir funcionam. P2 e P3 quebram aceites observáveis; P4 permite regressão do estado na UI. FR-31 físico/snap/reinício ainda não demonstrados. |
| C — Segurança | **8 / 8** | `desktop.rs:236–250` restringe URL/label; capability `main.json:6` oferece apenas comandos necessários; CSP local em `tauri.conf.json:16`. Testes Rust de Host/Origin/token/tamanho/taxa/sem decisões passaram. A tentativa XSS do harness passou. Exceções GTK são específicas e documentadas, com risco residual, não auditoria sem ressalvas. |
| D — Robustez/falha segura | **7 / 8** | Transação de políticas e testes de falha SQL passaram (`tests/policies.rs`); porta ocupada é coberta pelo núcleo. Em contrapartida P2 produz janela/DOM incoerentes por falha de gravação, reproduzida no Windows, e P4 evidencia ordenação insuficiente. Não observei bloqueio do Claude por esses defeitos de apresentação. |
| E — Qualidade do código | **8 / 8** | Fronteira Rust/UI clara, validação limitada, lockfiles, scheduler compartilhado e limpeza de listeners (`Gota.tsx:21–31`, `bridge.ts:26–43`). ESLint/Prettier/build passaram. A sequência de efeitos de P2 e o identificador temporal de P4 precisam correção, sem refatoração ampla. |
| F — Testes | **7 / 8** | 28 Rust e 13 Vitest passaram. Os quatro E2E inicialmente passaram usando servidor já aberto; isso ocultou P1. Harness independente de seis testes encontrou três falhas que os testes existentes não detectam. Axe de `window.spec.ts:124–173` examina catálogo, não a janela com sessões/settings/falhas. |
| G — Fidelidade visual/UX | **8 / 9** | Examinei as duas capturas do catálogo com 10 formas em 24/40/96 px e a janela nativa escura. Tokens/fontes locais, selo/interrogação, respingo assimétrico e estados distintos estão presentes (`render.ts:4–42`, `style.css:1–51`). P2 quebra a apresentação; P3 remove informação exigida da linha compacta; P5 afeta nitidez. Reconhecimento humano a 24 px, fidelidade aos protótipos e arraste físico ainda não têm aceite humano. |
| H — Acessibilidade | **7 / 9** | Botões com nomes, `aria-expanded`, modal nativo, Escape/restauração de foco e cortes de movimento reduzido têm testes. A árvore Windows apresentou botão, estado gráfico e alerta. P6 impede reposicionamento por teclado. Não há prova completa de contraste/zoom/leitor de tela na janela real; axe do catálogo não fornece essa prova. |
| I — Desempenho | **8 / 8** | Build passou; teste de FPS/reduced-motion passou, com limite determinístico de 30/60 desenhos (`render.test.ts:19–60`). Artefato de produção entregue informa p95 20,90 ms/32 eventos, não reamostrado por mim. Reamostrei repouso por 15 s: CPU 0,5465% da máquina e 104,43 MiB de working set privado do app+WebView2. Memória depende da definição explicitada abaixo; macOS/Linux e cenários de carga continuam não medidos. |
| J — Documentação | **8 / 8** | `docs/fase-3.md:102–114` declara pendências sem fingir aceite. ADR 0008 explica IPC, segurança, arraste Win32 e limitações; dependências têm avaliação específica; README e changelog apresentam escopo. A instrução E2E não era reproduzível em ambiente limpo por P1. App/SessionRow/Settings não têm TSDoc, ao contrário de Gota/Renderer (§12.3), melhoria menor. |

Notas apoiadas em testes/evidências, sem inflação: nenhum 9/10 e sete problemas classificados. A falta de aceite humano não foi convertida em um teste aprovado.

## Problemas acionáveis

### P1 — Alto: E2E não inicia servidor em ambiente limpo

**Local:** `app/ui/playwright.config.ts:18–22`; `app/package.json:8`; `.github/workflows/ci.yml` no passo de E2E Linux.

O `webServer` executa `npm run dev` sem `cwd`. Playwright usa por padrão o diretório do arquivo de configuração, `app/ui`, mas `package.json` está em `app`. Sem Vite já aberto, os testes não chegam a iniciar. Reproduzi diretamente o comando do processo filho na cópia D, a partir de `app/ui`: exit 1, `ENOENT ... app/ui/package.json`. O implementador também comunicou essa mesma falha no CI do candidato; não confundi a posterior correção com aprovação desta rodada.

**Correção:** definir `webServer.cwd` para `app` com caminho derivado de `import.meta.url`; executar `CI=true npm.cmd run e2e` sem servidor preexistente e obter CI verde nas três plataformas. [Referência primária Playwright: valor padrão de cwd](https://playwright.dev/docs/api/class-testconfig#test-config-web-server).

### P2 — Médio: falha ao salvar recolhimento recorta a janela sem alterar o DOM

**Local:** `app/src-tauri/src/desktop.rs:339–358`, especialmente `layout` na linha 349 antes de `write_private` na 350.

Na janela expandida, marquei apenas `D:/RexIA/projetos/scribe/.artifacts/phase-3-native/config/preferences.json` como somente leitura e cliquei **Recolher janela**. A operação de layout encolheu a janela a 56×56; a gravação falhou e o comando não publicou novas preferências. A árvore de acessibilidade continuou com o painel expandido, cabeçalho, sessões e configurações; a captura mostrou só o canto recortado da gota. O botão para reabrir não foi renderizado. Um caso comum de disco/configuração indisponível desorganiza o controle principal.

**Correção:** tornar o efeito de layout/persistência consistente e restaurar o layout anterior se alguma etapa falhar. Acrescentar teste de falha da gravação no caminho real de recolher/reabrir, não apenas teste de `write_private` isolado. Preserve o erro específico de configuração. Evidência: `.artifacts/phase-3-review-1/persist-failure.jpg` e `persist-failure-state.json` em D. Restaurei `IsReadOnly=false`, recuperei pelo atalho e reabri o app.

### P3 — Médio: origem disponível não aparece na lista compacta

**Local:** `app/ui/src/App.tsx:43–66`.

FR-10 exige origem quando disponível na lista. `session.origin` só é renderizada dentro de `expanded`, na linha 66. O harness usa origem pública `startup`; antes de expandir, `getByText('startup')` falha. O dado existe, mas exige descobrir e abrir o detalhe.

**Correção:** exibir origem legível na linha compacta, respeitando a largura/idioma, e cobrir a linha sem expansão. Não inventar origem para eventos que não a fornecem.

### P4 — Médio: timestamp em milissegundos não ordena snapshots concorrentes

**Local:** `app/ui/src/App.tsx:305–306`; `app/src-tauri/src/desktop.rs:262–263`; canais inicial/eventos em `app/ui/src/bridge.ts:31–36`.

O consumidor aceita `next.at >= previous.at`; `at` é `now_ms()`, sem revisão lógica. Duas capturas podem ter o mesmo milissegundo. O harness entrega primeiro a visão atual sem sessão (`at=1000`), depois a visão anterior com sessão (`at=1000`); a sessão removida reaparece. O teste existente cobre somente `<`, não colisões. Isso comprova falha de ordenação no consumidor; a janela concreta de chegada fora de ordem entre IPC/evento é uma inferência, não um incidente alegadamente observado em uso real.

**Correção:** revisão monotônica coerente com a captura do snapshot, usada em resposta inicial e eventos. Trocar `>=` por `>` sozinho descarta atualizações legítimas feitas no mesmo milissegundo e não resolve o contrato.

### P5 — Baixo: canvas estático não acompanha mudança de DPR

**Local:** `app/ui/src/gota/render.ts:98–107`, `158–159`, `172–196`; `app/ui/src/gota/Gota.tsx:32–34`.

O DPR só é consultado depois da guarda de animação. Com movimento reduzido, `active()` é falso, e não há listener de resolução/resize que force novo desenho. O harness cria 24 px em DPR 1 com movimento reduzido, muda o getter para DPR 2, emite resize e chama draw: largura física continua 24, esperada 48. Zoom ou passagem a monitor com outra densidade deixa a imagem em resolução anterior até outra mudança incidental. É reprodução com DOM simulado, não ensaio físico de dois monitores.

**Correção:** reagir a mudança de resolução/DPR com um desenho único, mantendo estático o modo reduzido. Testar sem permitir animação contínua. [Especificação CSSOM View, devicePixelRatio](https://drafts.csswg.org/cssom-view/#dom-window-devicepixelratio).

### P6 — Médio: arraste/reposicionamento não tem equivalente de teclado

**Local:** `app/ui/src/App.tsx:350–379`, `Settings:91–289`; `app/src-tauri/src/desktop.rs:444–446`.

A gota pode abrir por Enter/Space, porém reposicionamento só chama `bridge.drag()` por pointer move. Não há handler de teclado para mover/snap nem controles para lado/altura; `set_preferences` inclusive preserva esses campos antigos. Isso não atende navegação completa NFR-08 para uma funcionalidade da Fase 3. A exceção de gestos dependentes do caminho não se aplica: só interessa o destino do arraste.

**Correção:** proporcionar alternativa descobrível por teclado para lado/posição, mantendo foco visível e persistência, e testar com teclado. Não exigir uma implementação específica. [W3C WCAG 2.1.1: reposicionar por arraste requer equivalente](https://www.w3.org/WAI/WCAG22/Understanding/keyboard.html).

### P7 — Baixo: alerta da ponte permanece após recuperação bem-sucedida

**Local:** `app/ui/src/App.tsx:300`, `305–306`, `335–340`, `410–417`.

Após o ensaio de falha e a recuperação pelo atalho/clique, a janela voltou a 372×784 e atualizou sessões, mas continuou anunciando “O Scribe não conseguiu atualizar as sessões. Tente novamente.” `toggle()` seta o erro no catch e não o limpa no sucesso; receber visões válidas tampouco o remove. O alerta passa a representar uma falha antiga, sem ação para dispensá-lo. O arraste também pode produzir a mesma chave, portanto não atribuo exclusivamente a mensagem à falha de gravação.

**Correção:** definir quando erros recuperáveis da ponte cessam e limpar a mensagem após recuperação comprovada, preservando erros persistentes do Rust. Testar rejeição seguida de operação bem-sucedida.

## Tentativas de quebra e resultados

| # | Tentativa | Resultado e evidência |
| --- | --- | --- |
| 1 | Iniciar o comando E2E no cwd padrão sem package.json | **Quebrou.** `npm.cmd run dev` em `app/ui` retornou ENOENT/exit 1; P1. A execução inicial com Vite aberto não provava início limpo. |
| 2 | Recolher com preferences.json isolado somente leitura | **Quebrou.** Janela 56×56/DOM expandido; captura e árvore nativa; P2. Arquivo restaurado. |
| 3 | Sessão com origem disponível, sem expandir | **Quebrou.** Teste `FR10: origin must be visible...` falhou; P3. |
| 4 | Projeto e ação contendo `<img onerror>`/`<script>` | **Resistiu.** Renderizados como texto, nenhum nó img/script; harness `hostile project/action...` passou. |
| 5 | Histórico com vinte passos, expansão por botão | **Resistiu.** STEP_11 ausente, STEP_12/STEP_19 presentes; exatamente os últimos oito; harness FR11 passou. |
| 6 | Visão antiga com timestamp menor que o atual | **Resistiu.** A sessão removida não retornou; harness `older timestamp...` passou. |
| 7 | Visões atual/antiga com timestamp igual | **Quebrou no consumidor.** Sessão removida retornou; harness `snapshot collision...`; P4. Ocorrência end-to-end da corrida não foi observada. |
| 8 | DPR 1→2 com canvas estático/reduced-motion | **Quebrou.** Width 24 em vez de 48; harness DPR; P5. Troca física de monitor permanece pendente. |
| 9 | Arraste nativo automatizado (28,28)→(8,46) | **Inconclusivo.** Origem da janela permaneceu x1850/y510. `drag-observation.json`. Uma única passada pode encerrar o movimento antes da entrega da mensagem Win32; não prova defeito de arraste físico, nem prova sucesso. |
| 10 | Recuperar depois da falha por atalho/clique | **Recuperou geometria; alerta permaneceu.** Árvore Windows exibiu novamente painel e alerta; P7. |
| 11 | Operar reposicionamento apenas por teclado | **Sem caminho implementado.** Auditoria de handlers/Settings/comandos mostrou exclusividade pointer; P6. Abrir/recolher por teclado é suportado. |

Harness independente: `D:/RexIA/projetos/scribe/app/.artifacts/phase-3-review-1/review.test.tsx` e `review.config.ts`; JSON do Vitest em `D:/RexIA/projetos/scribe/app/ui/.artifacts/phase-3-review-1/vitest.json`. **6 testes: 3 passaram, 3 falharam, exit 1**, como esperado para a revisão adversarial. Reproduzir a partir de `app` com `npm.cmd exec -- vitest run --config .artifacts/phase-3-review-1/review.config.ts` sobre a cópia do candidato. Harnesses são evidência local, não novos testes de produto commitados.

## Verificações executadas e limites de medição

Na cópia D: `npm.cmd run test` **13/13**, `npm.cmd run build`, `npm.cmd run lint`, `npm.cmd run format:check` passaram. `cargo test --manifest-path app/src-tauri/Cargo.toml --features desktop --locked -- --test-threads=1` passou: **5 biblioteca + 21 integração + 2 políticas = 28**. Testes Rust usam fixtures públicas da fonte; não executam em OneDrive. Não repeti build Rust release nem clippy: binário nativo e resultados do implementador foram fornecidos; nenhuma alegação de repetição independente desses comandos.

`npm.cmd run e2e` inicialmente **4/4**: teclado/modal/idioma/tema, catálogo claro/escuro, FPS/movimento reduzido. O resultado é válido para esses fluxos com servidor existente, mas **não** valida inicialização limpa do candidato. Os testes não representam ensaio humano com Claude real.

Repouso independente, script `scripts/verification/measure-desktop.ps1` via PS7, 15,0117 s, PID 2756, oito processadores lógicos: processo nativo WS **34,57 MiB**, soma app+WebView2 private WS **104,43 MiB**, soma bruta WS **418,19 MiB**, CPU **4,372% de um núcleo / 0,5465% da máquina**. Log: `D:/RexIA/projetos/scribe/.artifacts/phase-3-review-1/resources.json`. A soma de WS conta páginas compartilhadas repetidamente; private WS não é equivalente ao RSS total nem a memória comprometida. O limite <150 MB é atendido na métrica privada declarada (aprox. 109,50 MB), mas o PRD não fixa a métrica de agregação. **NFR-04 não está comprovado de forma irrestrita**; padronizar a métrica e coletar plataformas primárias. CPU Windows nessa amostra passa NFR-05. Medidas de 15 s não demonstram todos os cenários de carga.

Artefatos entregues inspecionados: `desktop-native-production-final.json` (p95 20,90 ms, 32 eventos, largura 372, DPR 1,25), `desktop-frame-rates.json` (61 desenhos/s no grande na amostra, até 30 nos pequenos, reduced-motion para todos), `desktop-resources-before/after.json`. São evidências do implementador, identificadas como tal. Os limites determinísticos de redesenho e hidden-document foram reexecutados no Vitest/E2E. NFR-02/03 completos e ensaios de decisão são de outras fases, não inventados nesta revisão.

## Dependências e fontes primárias

`docs/dependencias-desktop.md` distingue aviso sem manutenção de unsoundness. Verifiquei na base primária RustSec que [RUSTSEC-2024-0370](https://raw.githubusercontent.com/RustSec/advisory-db/main/crates/proc-macro-error/RUSTSEC-2024-0370.md) é `unmaintained`, e [RUSTSEC-2024-0429](https://raw.githubusercontent.com/RustSec/advisory-db/main/crates/glib/RUSTSEC-2024-0429.md) afeta `VariantStrIter` glib 0.15–0.19, corrigido a partir de 0.20. Reexecutei `cargo tree --features desktop --locked --target x86_64-unknown-linux-gnu -i glib` na cópia D: confirmou glib 0.18.5 pela árvore GTK/Tauri. A busca `rg 'array_iter_str\('` nos fontes locais do registry retornou apenas a definição, documentação e testes do glib 0.18.5. Isso corrobora o argumento de alcance estático no universo de fontes presentes, não corrige o crate nem é prova formal. Aceitável como exceção explícita nesta fase, a reavaliar na Fase 5/Linux; não atribuí segurança 9/10 com base apenas em `cargo audit --ignore`.

Outras referências consultadas: [Claude Code — hooks](https://code.claude.com/docs/en/hooks), [Tauri — capabilities](https://v2.tauri.app/security/capabilities/), [Tauri — atalhos globais](https://v2.tauri.app/plugin/global-shortcut/), [Tauri — bandeja e eventos de plataforma](https://v2.tauri.app/learn/system-tray/), [Microsoft — WM_NCLBUTTONDOWN e coordenadas empacotadas](https://learn.microsoft.com/en-us/windows/win32/inputdev/wm-nclbuttondown). A adaptação Win32 usa representação documentada, mas teste de empacotamento não comprova interação física. No Linux eventos de clique da bandeja têm restrições documentadas; verificar menu nativo na plataforma primária.

## Pendências que não podem virar “verificado”

- CI verde no candidato da próxima rodada, em Windows/macOS/Linux, com início limpo de E2E. CI em andamento não é sucesso.
- Arrastar fisicamente, snap em ambas as bordas, persistência/reinício, monitor removido/múltiplos monitores e escalas distintas; a passada automatizada desta rodada não resolve isso.
- Bandeja/menu nativos e conflito real de atalho com outro aplicativo. Teste de validação de string não equivale a conflito de registro.
- Reconhecimento humano dos dez estados a 24 px e fidelidade aos protótipos aprovados. Eu inspecionei capturas, mas não sou o aceite visual humano exigido.
- Acessibilidade da janela com sessões/detalhes/settings/erro, incluindo teclado completo, zoom/reflow e leitura de tela; axe somente no catálogo não cobre essas telas.
- Recursos e comportamento nas plataformas primárias macOS/Linux e definição pública da métrica NFR-04.

Corrigir os problemas, preservar esta rodada e solicitar **outro revisor com contexto limpo** para a rodada 2, com novo diff/candidato e evidências das pendências. O app de teste foi devolvido aberto, com permissões do arquivo restauradas; nenhum commit/push/merge foi feito pelo revisor.
