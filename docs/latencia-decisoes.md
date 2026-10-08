# Latência da decisão privada até a resposta do hook

O teste permission_choices_deliver_signed_hook_responses_under_100ms_p95,
em app/src-tauri/tests/core.rs, verifica o caminho HTTP real do LocalServer com
banco SQLite temporário, porta efêmera e credenciais públicas de teste. Nenhum
perfil, instalação ou sessão real do Claude Code é usado.

São 128 amostras de permitir e 128 de negar uma PermissionRequest não arriscada
para cada caminho: endpoint HTTP privado e chamada direta a Core::resolve_decision.
Cada amostra autentica o desafio, envia o hook assinado, confirma que existe uma
única decisão pendente na sessão e que o hook ainda espera a resposta. O relógio
começa imediatamente antes do POST privado ou da resolução direta e termina
depois da resposta HTTP completa do hook. O teste exige status 204 da decisão
HTTP, sucesso da resolução direta, status 200 do hook, assinatura HMAC válida
e a escolha correta no JSON.

A interface desktop usa invoke do Tauri, não o endpoint HTTP privado. Ambos
os caminhos exercitam a mesma primitiva Core::resolve_decision usada pelo
comando Tauri. O teste direto exclui IPC, verificação de foco e retorno da view;
não deve ser apresentado como medição da interface desktop.

O p95 usa nearest rank, `ceil(0,95 × n) - 1`: índice 121 das 128 durações
ordenadas de cada grupo. Deve ser estritamente menor
que 100 ms para cada escolha e caminho, conforme NFR-02 de prompt.md. O log mostra
o máximo e a quantidade de amostras que atingem ou excedem 100 ms. A pausa de
100 ms entre amostras fica fora da medição e preserva a quota real do servidor.
Não há exceção por plataforma ou aumento do limite para runners lentos.

O log separa o tempo da resolução/roundtrip da escolha e a espera restante pela
resposta do hook. Amostras de 100 ms ou mais mostram índice, caminho e escolha.
Os quatro grupos são medidos antes do assert final, que falha se qualquer p95
atingir 100 ms. Os percentis dos segmentos são independentes, não somáveis.

O intervalo inclui transporte localhost, scheduling, persistência, serialização
e assinatura. É um limite superior conservador do processamento interno desse
caminho sintético, e não uma medição isolada do servidor. Uma falha pode incluir
custos do ambiente externo ao servidor e deve ser investigada sem remover o SLA.

Execução no espelho de runtime da RexIA:

```powershell
cargo test --manifest-path app/src-tauri/Cargo.toml --features desktop --locked --test core permission_choices_deliver_signed_hook_responses_under_100ms_p95 -- --nocapture --test-threads=1
```

O teste integra a suíte normal completa de core executada pelo CI nas três
plataformas, sem instrumentação de cobertura. O job llvm-cov mede a cobertura
funcional com o mesmo mínimo de 85%; exclui apenas este teste de timing, que já
é obrigatório na suíte nativa. O binário instrumentado não representa a latência
do app distribuído. A amostragem maior continua exigindo o mesmo p95 abaixo de
100 ms, sem exceção por plataforma, e inclui 512 respostas autenticadas.

A execução histórica local Windows com 32 amostras por grupo em 2026-10-08 mediu:

| Caminho | Escolha | Amostras | p95 | Máximo |
| --- | --- | --- | --- | --- |
| HTTP privado | Permitir | 32 | 5 ms | 5 ms |
| HTTP privado | Negar | 32 | 6 ms | 6 ms |
| Core direto | Permitir | 32 | 4 ms | 4 ms |
| Core direto | Negar | 32 | 4 ms | 5 ms |

Nenhuma amostra atingiu 100 ms. Isso não mede clique físico, stdout do helper
nativo, retomada do modelo no harness, perguntas ou aprovação de planos.
Não substitui ensaio humano, aceite de fase nem aceite da release.

## Evidência histórica da investigação do CI

No Linux, a instrumentação de debug do commit 19d040e localizou as amostras
lentas em save_decision (312–507 ms); mutex, preparação e publicação ficaram
abaixo de 1 ms. Isso identifica a etapa, mas não demonstra a causa do custo de
I/O. No mesmo teste, as amostras posteriores do Core tiveram p95 de 1–2 ms.

As rodadas diagnósticas usaram execuções isoladas, `sync` e controles pareados
com os demais testes `core`, registrando `Dirty` e `Writeback` do runner Linux.
Esses contadores globais não atribuem I/O ao Scribe. Cada teste criou seu próprio
`Core` e `TempDir`; não houve evidência de mutex ou banco compartilhado entre
eles. Cache do Cargo, execução sequencial e layout do CI também podem influenciar
o resultado. Passar isoladamente não resolveu as falhas observadas na suíte.

Os controles temporários e os timers de diagnóstico foram removidos. Naquela
rodada, a suíte normal tinha quatro grupos de 32 amostras e o mesmo p95
estritamente abaixo de 100 ms. Os registros históricos identificam o custo de
`save_decision`, mas não demonstram sua causa nem garantem o SLA no CI atual.

No head e86b60f, o CI normal do Linux passou, mas a execução instrumentada para
cobertura atingiu p95 de 141 ms no caminho Core/permitir. Uma execução normal
do macOS atingiu 109 ms em Core/negar; a pior amostra teve 156 ms na escolha e
306 ms de espera adicional depois dela. Portanto, não há prova de que todas as
pausas sejam causadas pela gravação do banco.

## Journal durável sem excluir o arquivo a cada commit

O armazenamento seleciona `journal_mode=TRUNCATE` em toda abertura e exige que
o SQLite aceite esse modo. `synchronous=FULL` e `secure_delete=ON` são explícitos.
O upsert durável da decisão continua antes do envio da resposta. Segundo a
[documentação do SQLite](https://www.sqlite.org/pragma.html#pragma_journal_mode),
truncar o journal pode evitar o custo de alterar seu diretório a cada commit.
Isso é uma hipótese de melhoria de I/O; não explica pausas de scheduling ou
instrumentação e não comprova a solução das falhas anteriores.

O journal permanece vazio depois do commit, e a regressão confere tamanho zero,
configuração efetiva e política recuperada na reabertura. Os testes de remoção
dos bytes do histórico, retenção e rollback continuam obrigatórios. Como no
modo DELETE, truncar não apaga cópias de backup nem garante sobrescrever os
blocos antigos no disco. Conexões auxiliares que escrevam diretamente no mesmo
banco precisam usar o mesmo modo de journal; os três instrumentos de falha por
trigger agora fazem isso, preservando seus asserts de rollback e de ausência de
autorização quando o commit falha.
