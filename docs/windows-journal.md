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

Essa melhoria não fechou o gate: no pull CI da PR44, HTTP permitir/negar
atingiram p95 de 151/100 ms, e Core permitir/negar 252/100 ms. O candidato
seguinte usa WAL nas gravações normais do Windows, mantendo
`synchronous=FULL`, `secure_delete=ON` e commit antes de responder ao hook.
Linux e macOS continuam em DELETE. O teste assinado com 128 amostras por
caminho e escolha, nas três plataformas, continua sendo obrigatório.

WAL sozinho não basta para privacidade: versões antigas dos registros podem
permanecer no arquivo lateral. Antes de apagar histórico ou aplicar retenção,
o Scribe pede `locking_mode=EXCLUSIVE` e muda para `journal_mode=TRUNCATE`.
A mudança deve retornar o modo efetivo `truncate` antes de qualquer exclusão
ou alteração de preferência. O SQLite termina o WAL antes dessa transição;
um leitor que a bloqueie faz a operação falhar antes de mudar os dados.
O lock exclusivo é mantido até a transação terminar, impedindo outra conexão
de reativar WAL no intervalo entre a troca e o DELETE.

A exclusão usa transação com rollback automático. Depois de commit ou rollback,
o handle volta a NORMAL antes de tentar WAL novamente. Se essa última
otimização falhar, o escritor permanece em rollback journal com FULL e
secure_delete; o resultado retornado é o da transação já terminada. Uma
limpeza confirmada não vira erro por causa da retomada do modo mais rápido.
Não há checkpoint com erro depois de uma exclusão confirmada nem VACUUM
após o commit. O arquivo do banco pode conservar espaço livre reutilizável.

Feche o Scribe antes de abrir ferramentas externas de manutenção ou copiar o
banco. Um leitor externo aberto pode impedir a limpeza ou a retenção até
fechar sua conexão; uma cópia de um banco WAL aberto sem os arquivos laterais
pode perder dados já confirmados. O app não oferece edição externa do histórico.
Os testes de remoção e higienização inspecionam banco, journal, WAL e SHM com
o Core aberto; os testes de falha SQL continuam exigindo que nenhuma permissão
seja liberada se a gravação falhar. Testes específicos cobrem leitor bloqueando
purge, rollback das duas preferências e retomada de WAL impedida após commit.

A [documentação do SQLite](https://www.sqlite.org/pragma.html#pragma_journal_mode)
descreve os modos e o retorno do modo anterior quando a troca não é possível.
A política de locks está em [locking_mode](https://www.sqlite.org/pragma.html#pragma_locking_mode),
e a necessidade dos arquivos laterais em [WAL](https://www.sqlite.org/wal.html#the_wal_file).
FULL não é uma garantia universal contra falhas de hardware, conforme
[synchronous](https://www.sqlite.org/pragma.html#pragma_synchronous).
Não fizemos ensaio de queda de energia, não contamos chamadas fsync e não
garantimos eliminação forense de blocos ou backups. Novos resultados do SLA
assinado nas três plataformas e revisão independente são necessários antes
de integrar; nenhuma instalação ou perfil real foi alterado para este lote.

O teste Windows `windows_journal_recovery` usa um banco temporário e um único
processo filho. O filho grava uma transação não confirmada com spill para o
arquivo e termina sem executar destrutores. Antes de chamar `Core::open`, o
pai exige um journal maior que 512 bytes e o cabeçalho válido do SQLite.
Nesse banco temporário, consulta também as ACLs do diretório, do banco e do
journal hot: cada um deve conceder acesso somente ao usuário do processo;
diretório e banco devem bloquear herança externa. Não registra identidades.
Depois da recuperação, verifica a política anterior, ausência da decisão
incompleta, journal limpo e `integrity_check=ok`. Isso testa uma interrupção
de processo com journal hot; não simula queda de energia nem garante
durabilidade em qualquer hardware. Veja o
[procedimento de recuperação do SQLite](https://www.sqlite.org/lockingv3.html#hot_journals).

O teste `windows_wal_recovery` cobre o outro lado da transição: um processo
filho confirma uma sessão, um relatório e o estado de uma pergunta respondida,
e termina sem fechar o Core. Antes de reabrir, o pai exige WAL com frames,
cabeçalho válido e marcador público, além das ACLs privadas de banco, WAL e
SHM. Ao reabrir, verifica os registros e as políticas persistidos e a
integridade. A alternativa escolhida não faz parte do registro de histórico
atual; o teste verifica o estado respondido e as opções, sem inventar esse
campo. Isso também é recuperação de interrupção de processo em banco
temporário, não teste de queda de energia ou aceite de sessão real.
