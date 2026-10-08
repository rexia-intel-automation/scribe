# Revisão adversarial — Fase 3, rodada 7

Data: 2026-10-06. Revisor independente, sem participação na implementação.
`prompt.md` foi lido integralmente, incluindo §13. Revisão do diff completo
`824c4ce8f687620d41f568cce4564a5f8bbce902..3d8c6a97cf48ca24f408f3fffea6794a8877f90f`,
no [PR #5](https://github.com/rexia-intel-automation/scribe/pull/5).
As referências de código e documentação abaixo pertencem exclusivamente ao
candidato **3d8c6a97cf48ca24f408f3fffea6794a8877f90f**, mesmo que a branch avance.

**Veredito: reprovada na catraca, sem problema crítico ou alto identificado.**
Um defeito baixo novo foi reproduzido: conclusão de salvamento de um modal já
desmontado fecha outro modal aberto depois dele e descarta o novo rascunho.
G/H ficam em 8, abaixo dos mínimos 9. A aprovação humana das dez formas/temas
e a confirmação do arraste físico continuam pendentes, separadas do defeito.
Não há autorização para avançar à Fase 4.

## Escopo e integridade

- Fases 0–2 já aprovadas. Não foram exigidos cartões de decisão, notificações,
  instalação limpa, publicação ou entregáveis das Fases 4–6. K não se aplica.
- Execução somente no espelho sem Git `D:/RexIA/projetos/scribe`, com
  PowerShell 7 (`C:/Program Files/PowerShell/7/pwsh.exe`) e `npm.cmd`.
  `SCRIBE_TEST_FIXTURES_ROOT` apontou para as fixtures públicas na fonte.
- `integrity.py` comparou SHA-256 de **130 arquivos** de app, plugins,
  manifestos, scripts e configuração GitHub ao blob do Git congelado.
  **Fontes, assets e lockfiles do app coincidiram**, permitindo apenas a
  normalização CRLF→LF explicitamente registrada. Conferência repetida ao
  terminar os ensaios, antes de liberar D: ao implementador.
- As únicas divergências são `.github/dependabot.yml` e
  `.github/workflows/ci.yml` no espelho. Foram avaliados pelo Git congelado;
  nenhum desses arquivos foi sincronizado ou alterado pelo revisor.
- Logs, scripts, diff congelado, hashes, capturas e traces novos ficam em
  `D:/RexIA/projetos/scribe/app/.artifacts/phase-3-review-7/`. O único documento
  alterado na fonte é este relatório. Relatórios anteriores foram preservados.
- Vite novo na porta **1439**, `reuseExistingServer=false`, `CI=true`,
  Playwright com um worker e nenhuma compilação/teste concorrente ao ensaio
  de FPS. O teste do produto foi copiado para o diretório desta revisão,
  alterando somente o destino de evidências, sem escrever logs de outra rodada.
- **PID 26676/e98bd21 permaneceu reservado ao humano:** nenhum input, hook,
  CDP, fechamento, parada ou recompilação do executável. Testes desktop ficaram
  na biblioteca; não se construiu nem iniciou um binário desktop novo.
  Não se usou o binário antigo como validação deste candidato.

## Verificações executadas

| Verificação | Resultado e evidência nova |
| --- | --- |
| ESLint, Prettier, build TypeScript/Vite | Passaram; `lint.log`, `format.log`, `ui-build.log` |
| Vitest | **32/32**; `vitest.log` |
| Rustfmt | Passou; `rust-fmt.log` |
| Biblioteca desktop Rust, `--features desktop --locked --lib` | **5/5**; `rust-desktop-lib.log` |
| Núcleo Rust e integração, sem feature desktop | **23/23** de contrato/políticas, mais unidade do sanitizador; `rust-core.log` |
| Clippy desktop, `--lib -- -D warnings` | Passou; `clippy-lib.log`. Não se declara verificação nova de todos os targets |
| npm audit, incluindo desenvolvimento, nível low | Zero vulnerabilidades; `npm-audit.log` |
| Playwright do produto | **10/10**; `browser.log`, `browser-results.json`, `product-evidence/` |
| Nove tentativas independentes | **8 passaram, 1 defeito confirmado**, depois do controle da expectativa excessiva de R7-07 descrito abaixo |

O primeiro lote de navegador terminou **17/19**, preservado integralmente:
dez testes do produto e sete adversariais verdes, R7-02 vermelho por defeito,
R7-07 vermelho por uma expectativa incorreta do harness. O controle posterior
passou **2/2**: R7-07 com a expectativa corrigida e um diálogo HTML mínimo.
Não houve mudança no produto entre esses lotes. Uma invocação intermediária
com regex contendo `|` falhou no wrapper `npm.cmd` com EPIPE antes dos testes;
`control-browser.log` preserva isso. O comando sem essa ambiguidade terminou
verde em `control-browser-final.log`, com resultados separados.

## Tentativas novas de quebra

Todas usam Chromium próprio, dados públicos e uma ponte simulada onde indicada.
Nenhuma limpeza ou gravação foi feita em configuração/histórico nativos.

| ID | Tentativa | Resultado |
| --- | --- | --- |
| R7-01 | Iniciar limpeza, cancelar a confirmação durante a espera, focar o botão novo e rejeitar a operação antiga | Passou: foco permaneceu no botão atual, erro apareceu e houve uma única chamada explícita de limpeza |
| R7-02 | Iniciar salvamento, Escape, reabrir Configurações, editar novo atalho, concluir com sucesso a operação anterior | **Defeito confirmado:** modal novo desapareceu e rascunho foi descartado. Trace preservado |
| R7-03 | Rejeitar salvamento depois de desmontar/reabrir o modal, com foco no idioma do novo editor | Passou: editor e foco atuais preservados, sem erro da instância antiga no modal novo |
| R7-04 | Limpeza pendente, snapshot recolhendo, reabrir pelo teclado, focar idioma e concluir limpeza antiga | Passou: modal atual permaneceu aberto e foco não foi roubado |
| R7-05 | Projeto contendo HTML público literal, origem ausente, vinte passos e expansão por Enter | Passou: nenhum elemento HTML injetado/execução, origem não inventada e somente últimos oito passos |
| R7-06 | Porta fracionária e depois campo numérico vazio; tentar salvar ambos | Passou: validação do formulário bloqueou IPC. O campo vazio gerou aviso React de NaN em desenvolvimento, sem crash ou gravação; anotação de ergonomia, não falha funcional |
| R7-07 | Novo snapshot com erro externo durante edição do atalho, percorrer Tab e fechar por Escape | Rascunho/foco inicial preservados. Após corrigir a expectativa do harness, passou: nenhum controle do painel atrás do modal recebeu foco; Escape devolveu ao opener |
| R7-08 | Alternar preferência de tema do sistema em tempo real com movimento reduzido, observar erros e requisições | Passou: tema claro→escuro, canvases presentes, nenhum pageerror ou pedido externo |
| R7-09 | Viewport 186×400, equivalente à largura disponível com ampliação de 200%, Configurações em ambos os temas e axe WCAG A/AA | Passou: zero violações axe, sem overflow horizontal do documento e botão Salvar alcançável por foco/scroll. Isso não equivale a ensaio humano com zoom/leitor de tela |

R7-07 originalmente exigia que cada Tab terminasse num elemento do diálogo.
Chromium também visita sua própria interface, deixando `activeElement=BODY`,
num diálogo HTML mínimo sem React. `tab-native-control.json` registra essa
mesma sequência, seguida do retorno ao primeiro controle. A expectativa
correta aceita esse BODY intermediário e rejeita foco em controles de fundo.
Não se atribuiu comportamento do navegador a um defeito do Scribe.

## Problema confirmado

**R7-P1 — Baixo — salvamento antigo fecha um novo editor.**

Código congelado:
[App.tsx:158](https://github.com/rexia-intel-automation/scribe/blob/3d8c6a97cf48ca24f408f3fffea6794a8877f90f/app/ui/src/App.tsx#L158),
em especial `receive(await bridge.savePreferences(preferences)); close();`
na linha 164. `close` recebido do App ainda altera o estado global do editor,
mesmo depois de a instância Settings que iniciou a operação ser desmontada.

Reprodução independente em `adversarial.spec.js`, teste R7-02:

1. Abrir Configurações e clicar Salvar alterações; manter promessa pendente.
2. Escape fecha o editor; reabrir Configurações.
3. Alterar o campo Atalho para `Control+Alt+Space` no novo editor.
4. Resolver com sucesso a promessa da primeira instância.
5. O diálogo novo é removido; a asserção de visibilidade falha e seu rascunho
   deixa de existir. A operação original foi explicitamente solicitada;
   não se pede que Escape desfaça uma gravação já iniciada.

Trace: `results/adversarial-R7-02-late-suc-3e5a4-ose-a-newer-settings-editor/trace.zip`;
estado final: `error-context.md` no mesmo diretório. A correção deve preservar
o snapshot de preferências efetivamente salvas e sua revisão monotônica,
limitando o fechamento ao editor que iniciou a operação e ainda existe.
Não se propõe impedir a atualização legítima do App após salvamento.

Há perda de rascunho e interrupção inesperada de navegação; não foi observado
vazamento, aprovação de permissão, perda de histórico ou erro do servidor.
**Nenhum problema crítico, alto ou médio foi confirmado.**

## Notas A–J e catraca

| Área | Nota | Mínima | Evidência e fundamento |
| --- | --- | --- | --- |
| A — Claude Code | **8** | 8 | Diff não muda plugins/manifestos de hooks; integração Rust cobre contrato público. UI consome Core sanitizado via bridge e não inventa respostas de decisão. Referência oficial de hooks consultada |
| B — Correção funcional | **8** | 8 | `App.tsx:75` limita oito passos; testes do produto e R7-05/R7-06 verificam sessões/formulário. R7-P1 é defeito baixo; arraste físico continua sem comprovação, não declarado funcionalmente aprovado |
| C — Segurança | **8** | 8 | `desktop.rs:239–265`, capability main e CSP restringem navegação/IPC e mantêm token no Rust; cinco testes desktop e contrato do core verdes. R7-05 resistiu a HTML literal. Dois avisos GTK têm exceções públicas específicas, ainda sem auditoria dedicada da Fase 5 |
| D — Robustez | **8** | 8 | `policies.rs` testa rollback SQL de ambas as políticas/poda/memória; revisões monotônicas em `desktop.rs:265`/`App.tsx:348`. R7-01/03/04 passam, mas R7-P1 mostra efeito assíncrono sobrevivendo ao editor errado |
| E — Código | **8** | 8 | Tipos estritos, ponte pequena, scheduler compartilhado; lint/build/clippy-lib passam. `App.tsx:158–164` ainda não vincula fechamento ao ciclo de vida da instância. Não se afirma perfeição nem se pede refatoração especulativa |
| F — Testes | **8** | 8 | 32 Vitest, 23 integração/políticas, cinco biblioteca desktop e dez E2E verdes. Reprodução independente nova revelou ausência de cobertura do sucesso tardio depois de reabrir. Redução de escopo native/Clippy explicitada |
| G — Visual e UX | **8** | **9** | Dez formas a 24/40/96 px, dois temas, fontes locais e capturas inspecionadas; `render.ts:182` faz morph de 450 ms. R7-P1 afeta UX e falta aceite humano das formas/temas e arraste. A evidência disponível não sustenta aprovação excelente/completa; isso não transforma a pendência humana em defeito visual |
| H — Acessibilidade | **8** | **9** | Produto verifica foco, confirmação, falhas assíncronas e glifos; R7-07/09 e axe nos catálogos passam. O editor atual ainda desaparece durante navegação por conclusão da instância antiga (R7-P1). Nenhum ensaio humano de leitor de tela ou novo WebView foi alegado |
| I — Desempenho | **8** | 8 | FPS serial novo: 96 px teve 61 desenhos no intervalo de aproximadamente 1 s; órbitas 24/40 px, 31, com limites determinísticos 60/30 verdes. Movimento reduzido parou desenhos; quinze formas sem olhos tiveram zero redraws após 6,5 s. Amostras nativas históricas são apoio limitado, não medição nova deste SHA |
| J — Documentação | **8** | 8 | `docs/fase-3.md`, ADR 0008, changelog e READMEs mantêm fase em verificação, sem release; limites Windows, riscos GTK e métricas discriminados. Site/instaladores são de fase posterior. Aceites pendentes são apresentados honestamente |

Notas 10 não foram atribuídas. Nem todas as notas são 9/10: a condição de
invalidade por inflação do §13.1.7 não foi acionada. Não se inventaram três
problemas para satisfazê-la. **G8/H8 não atingem G9/H9**, e as mínimas não
foram rebaixadas.

## Evidência visual, nativa e limites externos

As capturas versionadas `docs/public/phase-3/forms-{light,dark}-24-40-96.png`
e `native-sessions-dark.png` foram abertas e inspecionadas. Os novos catálogos
em `product-evidence/` foram gerados nesta rodada; verificam dez formas e
trinta canvases, fontes locais, dimensões e axe nos dois temas. O contraste
nominal dos glifos foi novamente medido acima de 3:1; pixels antialiasados
não são interpretados como relação uniforme de cada pixel. A inspeção do
revisor não substitui a aprovação visual solicitada ao humano.

Dados nativos existentes, lidos como **históricos**, registram p95 de 23,46 ms,
372×784, DPR 1,25 e fontes locais; recurso em repouso registra 33,84 MiB no
processo Scribe e 95,88 MiB de working set privado na árvore, mas 391,32 MiB
de soma de working sets incluindo páginas compartilhadas. Essa distinção
permanece explícita; não se declara nova medição de memória/CPU/latência do
SHA candidato. UI corrigida não foi testada no executável e98bd21.

**Pendências externas, sem classificação como falhas de código:**

1. Humano ainda precisa aprovar aparência e reconhecibilidade das dez formas,
   inclusive a 24 px, nos temas claro/escuro.
2. Arraste físico/snap no Windows ainda precisa ser demonstrado. A documentação
   registra que um ensaio automatizado anterior não demonstrou deslocamento;
   isso não prova defeito nem sucesso do caminho Win32 atual. Teste de
   coordenadas empacotadas prova a codificação, não o gesto físico completo.

Fontes primárias consultadas: [hooks do Claude Code](https://code.claude.com/docs/en/hooks),
[IPC Tauri](https://v2.tauri.app/develop/calling-rust/),
[WM_NCLBUTTONDOWN](https://learn.microsoft.com/en-us/windows/win32/inputdev/wm-nclbuttondown).
A correspondência com a API Win32 é uma verificação estática, não aprovação
do arraste real.

Snapshot único do CI do SHA candidato: run
[37494018400](https://github.com/rexia-intel-automation/scribe/actions/runs/37494018400),
dependency-audit **SUCCESS**, jobs Windows/macOS/Ubuntu **IN_PROGRESS** naquele
momento. O run duplicado 37494012958 estava cancelado nos jobs nativos.
Não se aguardou CI nem respostas humanas para terminar a revisão; verde de
um SHA anterior não aprova este. O ritual §13.4 continua exigindo CI verde.

Corrigir e revalidar R7-P1 é trabalho técnico concreto. Se depois disso só
faltarem os dois aceites humanos, não há fundamento para executar outras
rodadas idênticas ou simular aprovação: registrar a pendência e aguardar essa
evidência externa. D: foi liberado ao implementador ao fim dos ensaios;
nenhum processo/teste desta revisão permanece em execução.
