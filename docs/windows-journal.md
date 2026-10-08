# Journal de decisões no Windows

O gate NFR-02 do PR20 falhou no Windows: no head2adab1a, HTTP/permitir
atingiu p95 de 112 ms (12/128 amostras >=100 ms). A resposta do hook continua
dependendo de um commit bem-sucedido; o limite de 100 ms não foi alterado.

O benchmark intercalado b6ecd18 do job113562063115 mediu, em milissegundos:

| Operação | Escolha | DELETE p95 | TRUNCATE p95 |
| --- | --- | --- | --- |
| Save decision | Permitir | 81,717 | 49,703 |
| Core resolve | Permitir | 60,575 | 48,387 |
| Save decision | Negar | 40,785 | 30,125 |
| Core resolve | Negar | 39,837 | 30,061 |

É uma comparação no mesmo runner com FULL/secure_delete, não uma medição
do hook HTTP ou de um clique físico. Os máximos incluem pausas longas; o
resultado não garante desempenho em qualquer disco ou prova a causa de I/O.
No Linux, TRUNCATE não melhorou os percentis observados. Por isso, a mudança
limita-se ao Windows; Linux e macOS mantêm o modo anterior.

No Windows, o journal agora é truncado para zero ao concluir a transação,
em vez de removido e recriado. `synchronous=FULL` e `secure_delete=ON`
permanecem; não há resposta antes do commit nem WAL. Os testes verificam
journal vazio depois de commit/rollback, preferência restaurada e reabertura
de uma cópia fechada com o journal vazio. Os testes de falha SQL mantêm a
exigência de nunca liberar uma permissão se a gravação falhar; suas conexões
externas de injeção usam o mesmo modo, que é por conexão.

A [documentação do SQLite](https://www.sqlite.org/pragma.html#pragma_journal_mode)
descreve o mecanismo e a possibilidade de menor custo de truncamento. FULL
em rollback não é garantia universal de durabilidade após queda de energia,
conforme [synchronous](https://www.sqlite.org/pragma.html#pragma_synchronous).
Não fizemos ensaio de queda de energia, não contamos chamadas fsync e não
garantimos eliminação forense de blocos ou backups. Novos resultados do SLA
assinado nas três plataformas e revisão independente são necessários antes
de integrar; nenhuma instalação ou perfil real foi alterado para este lote.
