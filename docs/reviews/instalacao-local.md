# Revisão independente — abertura para instalação local

Data: 2026-10-07. Escopo: diff de `app/hook-client/src/main.rs`, `scripts/verification/native-client.test.mjs` e fixture `scripts/verification/fixtures/open-fixture.rs`, conforme o protocolo de `prompt.md`, seção 13. Revisão focada da correção de lançamento; **não aprova Fase 3, v0.1, interface, decisões ou instalação completa**. O humano autorizou instalação local e adiou os aceites visuais; decisões ainda não implementadas.

**Conclusão:** não encontrei bloqueador funcional ou de segurança na correção do lançamento testada no Windows. O comando retorna silenciosamente enquanto o app sintético permanece vivo, inclusive com caminhos contendo espaços. Duas lacunas baixas de teste permanecem. Unix foi examinado pelo código e contrato de `Command`, sem execução nesta máquina.

## Evidências e tentativas de quebra

Execução em `D:/RexIA/projetos/scribe`, Node 24.11.0, Rust 1.96.0. Build release `--locked --offline` e teste Rust em target exclusivo `app/.artifacts/review-local-install/target`; nenhum build no OneDrive. Os três arquivos em D: tinham os mesmos SHA-256 da fonte. Cópias originais e diff preservados no diretório de evidências.

| Tentativa | Resultado e evidência |
|---|---|
| Manter stdout/stderr capturados enquanto o app dorme | Suíte fornecida: 3/3 passam, novo teste em 390 ms; repetição isolada 5/5 passa (`native-suite.log`, `repeat-1.log` a `repeat-5.log`). |
| Remover somente a proteção contra herança dos handles Windows | Controle Rust próprio com os três `Stdio::null()` e `CREATE_NO_WINDOW`: após 1 s, `exitCode: 0`, mas `closed: false`. Reproduz retenção dos pipes (`control.log`, `null-only-launcher.rs`). Confirma relevância de `main.rs:142–154`. |
| Caminho com espaços, acento e caracteres de shell | `á app & echo injected ^ %PATH%!.exe` abre em 164 ms e recebe exatamente `--show` como único argumento; nenhum comando de shell é interpretado (`adversarial.log`). |
| Manter stdin aberto e enviar conteúdo; app escreve nos dois streams | App recebe zero bytes de stdin, sentinelas de stdout/stderr não aparecem no cliente; PID permanece vivo após retorno (`adversarial.mjs`, `stdio-probe.rs`, `adversarial.log`). |
| Chamador sem streams padrão capturados | `stdio: ['ignore', 'ignore', 'ignore']`: lançamento passa em 105 ms, PID vivo, stdin vazio (`adversarial.log`). Não equivale a provar todos os tipos de handles de console. |
| Executável relativo | Retorno 1, silêncio e ausência de marker; caminho relativo recusado (`adversarial.log`, `main.rs:122`). |
| Executável ausente ou caminho de diretório | Ambos recusados, retorno 1, nenhum marker (`adversarial.log`). |
| Configuração malformada, sem app_path ou maior que 8 KiB | Três recusas silenciosas em 12–14 ms, sem lançamento (`adversarial.log`). |
| Regressões do transporte de hooks | Suíte confirma onze eventos, respostas ignoradas, proxy/redirect bloqueados, entrada inválida/grande, stdin incompleto e app fechado; teste Rust 1/1 passa (`native-suite.log`, `rust-tests.log`). |
| Limpeza normal e repetição | Suíte e cinco repetições completam o `finally` sem erro. Sondagens próprias removem todos os seus diretórios e sinalizam apenas PIDs sintéticos (`adversarial.log`). Nenhum processo/app real do usuário foi controlado. |

Para repetir: executar `node --test app/.artifacts/review-local-install/native-client.review.test.mjs` e `node app/.artifacts/review-local-install/adversarial.mjs` em D:. A cópia da suíte altera exclusivamente o caminho do binário para o target próprio e o import de `lib.mjs`; a fixture original permanece intacta. Todos os fontes das sondagens e logs estão em `D:/RexIA/projetos/scribe/app/.artifacts/review-local-install`.

## Achados confirmados

1. **Baixo — compilação da fixture sem prazo ou limpeza do compilador.** `native-client.test.mjs:106–108` aguarda `rustc` sem timeout; o timer de 1 s começa somente em `:118`. `compiler` fica dentro do `try` e não é encerrado no `finally`. Por inspeção, se o compilador não terminar nem emitir erro, o teste nunca alcança a limpeza. A compilação normal passou; nenhum travamento real foi observado. Sugestão: deadline para a etapa e limpeza do processo de compilação pertencente ao teste.
2. **Baixo — teste incorporado não detecta regressão de stdin.** `native-client.test.mjs:112` usa stdin ignorado e `open-fixture.rs:1–8` não lê stdin nem escreve sentinelas de saída. A execução própria confirma o isolamento atual, mas esse contrato não fica protegido pela regressão incorporada. Sugestão: adicionar caso com stdin em pipe mantido aberto e fixture que verifique EOF; manter o caso atual de retenção de stdout/stderr.

Nenhum achado crítico, alto ou médio confirmado neste diff. A limpeza usa PID do marker e `kill` sem aguardar término (`native-client.test.mjs:131–133`); não consegui reproduzir falha de remoção nas seis execuções. Esperar término é sugestão de robustez, não bug demonstrado.

## Avaliação limitada ao escopo

| Área da seção 13.2 | Nota | Evidência |
|---|---:|---|
| B — correção do lançamento | 8 | Suíte e sondagens passam; app sintético permanece vivo e argumento está correto. |
| C — segurança do lançamento | 8 | Caminho absoluto, lançamento direto, caracteres especiais e stdio isolados (`main.rs:122–157`). |
| D — robustez do lançamento | 8 | Retorno independente da duração do filho; controle reproduz problema anterior; repetição passa. |
| E — qualidade desta mudança | 8 | Correção pequena, handles nulos/inválidos tratados, falha do setter recusa lançamento (`main.rs:146–151`). |
| F — testes desta mudança | 8 | Regressão de pipes relevante e repetível; duas lacunas baixas acima. |

Notas não representam avaliações globais dessas áreas. A, G, H, I, J e K completos não foram avaliados; build do cliente não prova build/instalação do app. Não se aplica catraca de fase a esta revisão parcial.

## Limitações e contratos consultados

- Unix: as três chamadas de `Stdio::null()` são independentes de plataforma. Não executei Linux/macOS; fechamento de outros descritores, sessão/grupo de processos e comportamento após fechar o terminal não foram validados. No Windows, não se examinou encerramento por job do processo pai ou todos os hosts de console. O escopo confirmado é a independência dos streams capturados.
- App sintético comprova lançamento e vida do processo, não inicialização do Tauri, servidor saudável, trazer uma janela existente à frente, instalação marketplace, MSI ou fluxo real de Claude Code. Esses aceites permanecem separados.
- [Rust — Command](https://doc.rust-lang.org/std/process/struct.Command.html): argumentos são fornecidos diretamente ao programa; stdin/stdout/stderr herdariam o pai sem redirecionamento explícito. `spawn()` confirma criação, não saúde posterior.
- [Microsoft — SetHandleInformation](https://learn.microsoft.com/en-us/windows/win32/api/handleapi/nf-handleapi-sethandleinformation): máscara `HANDLE_FLAG_INHERIT = 1`, flags `0` retiram herança; retorno zero indica falha. ABI `HANDLE`/`DWORD`/`BOOL` usada no diff é compatível. A página de `GetStdHandle` não ficou acessível pelo navegador desta revisão; os seletores foram examinados no código e exercitados pelos testes Windows.

Fonte revisada, SHA-256: `main.rs` D9B0A918C97AA6F725DA097C3D3EC8CB2B0859986AFB117F7670C50BB9964827; teste 2351325DED81A80B1D58858328FFA6AAD9D5BF2E8156155D7F1A2F2D902C3013; fixture 5579CE901EE2474A5D91C17ABE39D7E979EB38FBD2033DF3C95CE21C68E1B5F7.
