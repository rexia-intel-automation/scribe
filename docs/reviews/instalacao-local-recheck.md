# Recheck independente — duas lacunas de teste

Data: 2026-10-07. Escopo exclusivo: correções dos dois achados baixos de `instalacao-local.md`, em `scripts/verification/native-client.test.mjs` e `scripts/verification/fixtures/open-fixture.rs`. O relatório original foi preservado sem alterações (SHA-256 `1F685A1628AFD634F0133B89EE1BA45D468008EE0AEE63C345820CFD3775CA65`).

**Conclusão: os dois achados estão resolvidos no escopo examinado.** Não apareceu novo bloqueador. Este recheck não amplia a aprovação para Fase 3, v0.1, instalação completa, decisões ou aceites visuais; permanecem as limitações de plataforma e produto da revisão original.

| Achado anterior | Correção e validação |
|---|---|
| Compilação sem timeout/limpeza | Teste `:104–110` mantém referência ao compilador e o encerra após 30 s; `:138–144` limpa o timer e encerra compilador ainda ativo no `finally`. Injeção própria substituiu exclusivamente o executável do compilador por um processo sintético que dormiria 60 s: teste terminou em **30.063 ms**, com falha esperada `null !== 0`, e o PID sintético já não existia. Sem erro adicional de limpeza. |
| Isolamento de stdin sem regressão incorporada | Teste `:114–116` mantém pipe aberto e envia sentinela; fixture `:7–12` lê até EOF, exige conteúdo vazio, escreve sentinelas de saída e marker `EOF`. Teste `:131–137` exige marker e streams vazios. Execução focada passa **1/1 em 423 ms** com fixture corrigida. |

A falha na injeção de timeout é o resultado esperado do ensaio: confirma que compilação que excede o prazo é rejeitada, o processo termina e a suíte devolve controle. Não é falha do produto ou do teste em execução normal. O diagnóstico atual informa `null !== 0`; explicitar “timeout de compilação” seria melhoria opcional de mensagem.

Executado somente em `D:/RexIA/projetos/scribe`, usando o binário release do target exclusivo da revisão anterior. O SHA-256 do cliente continua `D9B0A918C97AA6F725DA097C3D3EC8CB2B0859986AFB117F7670C50BB9964827`, igual à fonte. Teste e fixture sincronizados foram conferidos por hash; nenhum rebuild ou execução de modelos foi necessário.

Evidências próprias preservadas em `D:/RexIA/projetos/scribe/app/.artifacts/review-local-install`:

- `recheck-normal.log`: execução focada bem-sucedida.
- `recheck-timeout.log`, `compiler-delay.rs`, `recheck-compiler.pid`: injeção de timeout e PID sintético; verificação posterior confirmou sua ausência.
- `native-client.recheck.test.mjs`: cópia com import de `lib.mjs` e caminho do binário adaptados ao ambiente isolado.
- `native-client.compiler-timeout.test.mjs`: mesma cópia, com compilador sintético no lugar de `rustc`.
- `native-client.test.mjs.recheck-original`, `open-fixture.rs.recheck-original`: fontes desta rodada, sem sobrescrever os snapshots anteriores.

Reprodução normal: `node --test --test-name-pattern='native open' app/.artifacts/review-local-install/native-client.recheck.test.mjs`, em D:. O ensaio de falha depende do executável `compiler-delay.exe` e de `REVIEW_COMPILER_PID` apontando para marker próprio absoluto.

Sem alterações no produto, configuração do Claude ou processos reais. Não repeti a revisão de fase nem atribuí novas notas globais.
