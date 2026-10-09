# Diagnóstico temporário da latência no Windows

O PR42 no SHA `4a99b8e` falhou no job `113578035250`: HTTP/permitir
p95 151 ms, 11/128 amostras acima de 100 ms, todas na etapa de escolha.
Os outros grupos mediram 17/14/17 ms. O job paralelo `113577866449`
passou com 93/74/57/63 ms; isso não anula a falha e seus máximos incluem
1201 ms. Não atribuimos a diferença ao antivírus ou ao disco sem evidência.

A rodada WAL parte do PR45 `c6dee33`: o push job `113612959539` mediu
HTTP permitir/negar 7/22 ms e Core permitir/negar 6/221 ms. As 14 amostras
lentas do último grupo se concentraram entre os índices 106 e 121, máximo
411 ms. O pull passou o mesmo teste, mas isso não anula a falha do push.
Ainda não sabemos se a rajada coincide com um checkpoint ou outra espera.

A branch de diagnóstico conserva o mesmo teste nativo assinado, seus 128
exemplos por grupo, pacing, quotas, commit e critério estrito. A feature
`decision-timing`, desabilitada por padrão, imprime somente números:

- `lock_us`: espera pelo mutex de estado dentro de `Core::resolve_decision`.
- `validation_us`: validação e preparação entre obter o mutex e salvar.
- `save_us`: serialização e operação SQL de `Store::save_decision`, incluindo
  o commit SQLite. Não separa chamadas de flush do sistema.
- `send_us`: atualização de memória e entrega do sinal após o commit.
- `wait_us`: intervalo entre agendar o trabalho HTTP e entrar no worker.
- `json_us` e `sqlite_us`: separação da serialização de uma decisão e da
  operação SQL, que inclui preparar/executar a consulta e seu commit. Não
  separam flushes, espera de I/O ou preempção do sistema operacional. São
  impressos também ao criar a decisão, não só ao resolver.

No Windows, o teste também observa somente tamanho do WAL, `mxFrame` e
`nBackfill` do WAL-index antes da escolha e depois da entrega. Lê apenas os
100 primeiros bytes do SHM do banco público temporário; exige cabeçalhos
duplicados iguais e inicializados. Campos usam byte order nativa e
`nBackfill` está no offset 96 da tabela do
[formato SQLite](https://www.sqlite.org/walformat.html#wal_index_header).
Observações indisponíveis são registradas, sem inventar zero ou falhar o SLA.
Registra os limites de grupo, amostras lentas e mudanças de backfill/reset.
Não chama checkpoint, não instala wal_hook nem muda autocheckpoint ou FULL.
Os números podem indicar coincidência com checkpoint, não provar causalidade
ou contar flushes. O formato é observação diagnóstica, não API do produto.

Não imprime ID, escolha, alvo, JSON, credenciais, ambiente ou perfil. O teste
usa somente dados públicos em um banco temporário, sem instalação, desktop
aberto, configuração real do Claude ou chamadas de modelo. Continua sendo o
teste existente; não é um novo probe de sobrecarga.

A emissão de logs e as leituras, mesmo fora do intervalo medido, alteram
cache e agendamento. Esses dados localizam etapas;
não fecham o SLA e não substituem o CI normal sem feature. A instrumentação
é exclusiva de debug: compilar release com a feature falha explicitamente.
A branch e o workflow são temporários e não devem entrar no produto.

## Contexto completo do Core

O trace focado do head `9b11e1b` passou com p95 7/7/6/6 ms, zero amostras
acima de 100 ms. Observou um checkpoint na escolha Core/permitir (frames
999 para 1000, backfill 0 para 1000, total 27,231 ms) e um reset do WAL na
escolha HTTP/negar (12,943 ms). Não reproduziu a rajada original.

Os dois CI normais do mesmo head falharam no Windows: o pull atingiu p95
244 ms em HTTP/negar, e o push 143 ms em HTTP/permitir. Os grupos restantes
ficaram abaixo de 100 ms; essas reprovações continuam registradas.
Uma inspeção somente leitura do lifecycle não encontrou tarefa, processo ou
banco deixado vivo pelos testes anteriores, mas não identifica a causa.

A próxima rodada prepara o mesmo helper de fixture isolado do CI e executa
todos os 32 testes existentes de `core.rs` com a feature de diagnóstico,
na mesma ordem padrão e `--test-threads=1`. Assim, as observações são feitas
depois dos outros testes do Core, em vez de apenas num teste focado. Não
reproduz toda a preparação e carga de compilação do job CI; esta diferença
também limita a comparação. Não acrescenta testes, carga ou probe e mantém
as 512 escolhas assinadas, pacing, quotas e critério estrito. A rodada
instrumentada continua sem substituir o CI normal nem apagar falhas prévias.
