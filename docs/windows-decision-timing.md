# Diagnóstico temporário da latência no Windows

O PR42 no SHA `4a99b8e` falhou no job `113578035250`: HTTP/permitir
p95 151 ms, 11/128 amostras acima de 100 ms, todas na etapa de escolha.
Os outros grupos mediram 17/14/17 ms. O job paralelo `113577866449`
passou com 93/74/57/63 ms; isso não anula a falha e seus máximos incluem
1201 ms. Não atribuimos a diferença ao antivírus ou ao disco sem evidência.

A branch de diagnóstico conserva o mesmo teste nativo assinado, seus 128
exemplos por grupo, pacing, quotas, commit e critério estrito. A feature
`decision-timing`, desabilitada por padrão, imprime somente números:

- `lock_us`: espera pelo mutex de estado dentro de `Core::resolve_decision`.
- `validation_us`: validação e preparação entre obter o mutex e salvar.
- `save_us`: serialização e operação SQL de `Store::save_decision`, incluindo
  o commit SQLite. Não separa chamadas de flush do sistema.
- `send_us`: atualização de memória e entrega do sinal após o commit.
- `wait_us`: intervalo entre agendar o trabalho HTTP e entrar no worker.

Não imprime ID, escolha, alvo, JSON, credenciais, ambiente ou perfil. O teste
usa somente dados públicos em um banco temporário, sem instalação, desktop
aberto, configuração real do Claude ou chamadas de modelo. Continua sendo o
teste existente; não é um novo probe de sobrecarga.

A emissão de logs altera o custo observado. Esses dados localizam etapas;
não fecham o SLA e não substituem o CI normal sem feature. A instrumentação
é exclusiva de debug: compilar release com a feature falha explicitamente.
A branch e o workflow são temporários e não devem entrar no produto.
