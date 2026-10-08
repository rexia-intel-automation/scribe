# Comparação de gravação no mesmo runner

O NFR-02 falhou no Windows CI do head3393885: resolução Core/permitir p95
155 ms, máximo 298 ms e 13 de 128 amostras a partir de 100 ms. A resolução
inclui o commit; a espera restante do hook foi zero naquele grupo. Isso
localiza a etapa, sem provar uma causa de filesystem ou antivírus.

O diagnóstico `storage_mode_round_robin` compara DELETE, TRUNCATE e WAL
com `synchronous=FULL` e `secure_delete=ON`. Cada modo usa dois bancos
temporários independentes: um para `Store::save_decision`, outro para
`Core::resolve_decision`. Há 128 amostras por modo, operação e escolha
(permitir/negar). Os modos são intercalados e o primeiro modo gira a cada
ciclo; a ordem commit/escolha também alterna. Os logs incluem todas as
amostras em microssegundos, p50, p95 nearest rank e máximo.

A cada bloco de 32 amostras, o WAL de cada banco tem um checkpoint TRUNCATE
medido separadamente. O log registra tempo, tamanho do WAL antes/depois,
limite de auto-checkpoint e resposta do SQLite; exige sucesso e tamanho final
zero. Não se soma esse tempo aos percentis das escolhas. Essa política de
checkpoint explícito muda o padrão de I/O do diagnóstico: não representa uma
política já adotada pelo produto nem prova sua durabilidade ou remoção segura
de todos os bytes. Um número de commits não determina quantas páginas foram
gravadas; sem rastreamento não afirmamos se um auto-checkpoint ocorreu.

```powershell
cargo test --manifest-path app/src-tauri/Cargo.toml --locked --lib storage_mode_round_robin -- --ignored --nocapture --test-threads=1
```

`Storage comparison` executa esse comando nas três plataformas. Todos os
dados são públicos e temporários; não usa instalação, perfil, rede, modelo
ou sessão real. O benchmark é ignorado na suíte normal e não substitui o
teste de respostas HTTP assinadas com p95 estritamente abaixo de 100 ms.
Os resultados deste diagnóstico precisam ser lidos antes de escolher uma
alteração; a aplicação continua usando seu modo atual.

Não medimos contagens de flush/fsync, interrupção de energia, clique/IPC,
stdout do helper ou retomada do Claude. FULL e as operações dos modos são
descritos na [documentação do SQLite](https://www.sqlite.org/pragma.html),
mas a documentação não prova o custo no runner. WAL tem consequências para
bytes retidos e checkpoints; TRUNCATE precisa de testes com conexões
externas e de recuperação. Um p95 melhor isolado não aceita essas trocas
nem demonstra o SLA completo do produto.
