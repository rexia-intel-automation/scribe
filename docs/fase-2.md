# Fase 2 — servidor local

Estado: aprovada na quinta revisão independente, em 2026-10-06.
Notas: A9 B9 C9 D9 E8 F9 I8 J8. As Fases 0 e 1 passaram.
O núcleo Rust existe, mas a janela Tauri e decisões humanas continuam pendentes.

## Entrega e limites

`app/src-tauri` contém uma biblioteca que o processo Tauri incorporará. Não
é um serviço remoto nem um app desktop executável nesta fase. Recebe os onze
hooks reais, grava metadados higienizados no SQLite e publica snapshot/deltas
em SSE. O SDK oficial rmcp negocia MCP e registra `scribe_report`/`scribe_ask`.

| Rota | Comportamento nesta fase |
| --- | --- |
| POST `/v1/hooks/{event}` | Valida contrato, grava estado e responde 204 vazio; nunca aprova |
| GET `/v1/state` | Snapshot higienizado, exclusivo da ponte Rust da interface |
| GET `/v1/events` | Snapshot inicial, deltas e atualização de estados por tempo |
| POST `/mcp` | Relato de sessão conhecida; perguntas retornam sem resposta, indisponível |
| GET `/v1/health` | Versão e disponibilidade, sem dados de sessão |
| POST `/v1/decisions/{id}` | Não existe; será implementada na Fase 4 |

Bearer é obrigatório em todas as rotas. Estado/SSE exigem uma segunda
credencial efêmera, nunca entregue ao plugin ou serializada nos snapshots.
A UI usará a ponte Rust do Tauri; o webview não precisa fazer fetch local.
Só IPv4 loopback; Host deve corresponder à porta; qualquer Origin é rejeitado;
nenhum CORS. Corpo até 1 MB, leitura de corpo até 500 ms, cinquenta requisições
autenticadas por segundo. Credenciais inválidas são rejeitadas antes do corpo.

## Estado e privacidade

SQLite embarcado no diretório privado dedicado do app. Unix: diretório 0700,
arquivo 0600. Windows: DACL protegida com acesso exclusivo do usuário atual.
Não passar uma pasta compartilhada ao `Core::open`: ele restringe permissões.
O teste Windows verifica a ACL por PowerShell, isolando PSModulePath para que
PowerShell 7 e Windows PowerShell não misturem seus módulos.

Só projeto, caminho encurtado, origem documentada, forma/ação, horários e até
vinte passos são persistidos. Prompt, transcript, ambiente, conteúdo de arquivo
e saída de ferramenta são ignorados. Segredos comuns e valores de variáveis
inline são redigidos antes de truncar. Após a primeira atribuição, o restante
do texto é omitido: sem interpretar shell, não há como distinguir argumentos
seguintes de valores dotenv com espaços ou múltiplas linhas. O prefixo e o nome
da ferramenta permanecem; comandos sem atribuições mantêm seus alvos úteis.
Texto que menciona `.env` é omitido por inteiro, inclusive sem atribuição
literal: comandos podem codificar ou construir o sinal de igual, e podem
escrever valores vindos de argumentos. Não se executa nem interpreta shell
para higienizar. A omissão se aplica também a caminhos `.env.local`/`.env.example`
e a relatos; pode esconder textos inofensivos que mencionam esses arquivos.
Authorization e chaves sensíveis também omitem todo o restante do texto,
incluindo aspas concatenadas, escapes PowerShell e argumentos de linha de
comando. O núcleo não tenta descobrir onde termina a credencial. Caminhos
colados a operadores como `<`/`>` e flags como `-I`/`-L` são encurtados,
além dos entre aspas. Caminhos em comandos e relatos também são encurtados.
Retenção de quatorze dias configurável entre 1 e 365, aplicada ao horário
de cada passo e da última atividade da sessão. Eventos recentes não renovam
o prazo dos passos antigos. Snapshots, relatos e mudanças de política limpam
dados vencidos; com o servidor aberto, manutenção ao iniciar e a cada minuto
limpa o SQLite mesmo sem hooks ou conexões da interface. Alterar a retenção
grava política e limpeza na mesma transação; falhas preservam ambas. Uma
consulta inicial evita transações de escrita quando não há dados vencidos.
Visibilidade
de concluídas de dez minutos configurável entre 1 e 1440. Apagar histórico
remove registros numa única transação e publica snapshot vazio após o commit.
`secure_delete=ON` sobrescreve as células apagadas; o banco pode conservar o
espaço alocado para reutilizar nas próximas gravações. Alterar a janela
de concluídas recarrega imediatamente os registros visíveis do banco, com até
256 sessões e prioridade para as vivas. O setter recebe o horário atual como
o setter de retenção, conserva o estado em memória das vivas e seus subagentes,
e só aplica a mudança após persistir a política.

Sem notícias por dez minutos produz Ampulheta, exceto Mancha: uma falha
permanece nessa forma até novo evento. Reinício conserva histórico,
mas coloca sessões não encerradas em espera, sem fingir subagentes ativos.
Sessões concluídas saem da memória e não são reabertas por eventos atrasados.
Até 256 sessões visíveis e 256 subagentes por sessão; excesso rejeitado sem
decisão. Gravações são serializadas e mudanças publicadas só após sucesso.
Falha de banco não anuncia um estado que não foi persistido.

## Verificação reproduzível

Builds locais são feitos em `D:\RexIA\projetos\scribe`; fonte versionada está
na pasta do projeto em C:. Antes de testar, espelhar os arquivos da biblioteca
e o cliente nativo. A variável abaixo aponta apenas para os 46 fixtures públicos
versionados, evitando capturas históricas extras da pasta de runtime.

```powershell
$env:SCRIBE_TEST_FIXTURES_ROOT = 'C:/Users/engmo/OneDrive/RexIA/RexIA/projetos/scribe/app/src-tauri/tests/fixtures/hooks'
cargo build --release --manifest-path app/hook-client/Cargo.toml --locked
cargo fmt --manifest-path app/src-tauri/Cargo.toml --check
cargo test --manifest-path app/src-tauri/Cargo.toml --locked -- --nocapture --test-threads=1
cargo clippy --manifest-path app/src-tauri/Cargo.toml --locked --all-targets -- -D warnings
cargo audit --file app/src-tauri/Cargo.lock --deny warnings
```

Em checkout limpo, omitir a variável: o caminho padrão contém os mesmos
fixtures versionados. O teste do helper usa o executável de release real;
se faltar, falha em vez de pular. O CI constrói o helper antes desses testes
e repete a biblioteca em Windows, macOS e Ubuntu, com lockfile e auditoria.
Os testes da biblioteca são executados em sequência para que medições de
latência e abertura do helper não disputem disco/CPU com outros testes de
capacidade e SQLite. Os cenários de concorrência dentro dos testes continuam
concorrentes; os limites de 200 ms e um segundo não foram alterados.
No Linux, cargo-llvm-cov 0.9.1 exige pelo menos 85% de linhas da biblioteca;
usa somente o alvo de integração `--test core`, excluindo arquivos de teste
do relatório e não compilando módulos unitários no denominador. As regressões
dos formatos de segredo, histórico, retomada, visibilidade e silêncio encontrados
nas quatro primeiras revisões são exigidas.

Os testes cobrem estado de cada fixture real, onze eventos, silêncio, limite
de vinte passos, reinício, retenção e limpeza; concorrência, falha/recuperação
de SQLite, ACL, capacidade de memória; Host/Origin/token inválidos, sem CORS,
corpo excessivo/incompleto, limite de taxa e ausência da rota de decisões;
MCP, SSE e helper real; porta ocupada e liberação no encerramento/descarte.
O teste HTTP mede p95 de 32 eventos até estado gravado, com limite de 200 ms.
Ele não mede atualização de janela, memória/CPU/FPS de um app ainda inexistente.

Nenhum teste desta fase comprova permitir, negar ou responder pela janela.
O limite de uso do modelo Claude observado na Fase 1 também não é contornado.

## Modelo de ameaça nesta fase

Páginas de navegador não têm acesso por Origin/Host/token; processos com
credencial de hook não podem ler estado/SSE nem produzir allow. Outro usuário
do sistema não recebe acesso ao arquivo de banco. O mesmo usuário com controle
do processo, depurador ou acesso ao diretório privado está fora dessa barreira;
não há promessa de isolamento contra um usuário que controla a própria conta.
Payloads com segredos são reduzidos antes de armazenamento/publicação. Binários
e transporte continuam locais, sem requisição a modelos ou atualização remota.

[ADR 0007](adr/0007-servidor-local.md) registra arquitetura, limites e fontes.
O [relatório da primeira rodada](reviews/fase-2-rodada-1.md) está preservado:
reprovou três formatos de segredo e dois casos de histórico/retomada. Foram
adicionadas regressões para os cinco casos. A
[segunda rodada](reviews/fase-2-rodada-2.md) reprovou valores dotenv com espaços,
mudança de visibilidade sem reinício e perda da forma Mancha por silêncio.
As correções têm regressões versionadas.
Antes do veredito da terceira rodada, um ensaio do construtor reproduziu outro
caso: escrita de `.env` com `=` codificado. A omissão completa acima e quatro
variantes no teste de integração cobrem essa lacuna; a revisão usa o novo commit.
Os nove testes independentes antigos e os oito da segunda rodada também
passaram contra as correções. O harness original da segunda rodada foi
preservado; numa cópia, somente a chamada ao setter recebeu o timestamp atual
exigido pela nova assinatura. Isso é uma verificação do construtor, não uma
nova aprovação independente.
A [terceira rodada](reviews/fase-2-rodada-3.md) encontrou Authorization
concatenado em Bash, escape por crase em relato e caminhos junto a
redirecionamento. As correções têm regressões nos caminhos de hook, relato e
SQLite, incluindo outras chaves e operadores.
Os oito testes do harness da terceira rodada também passaram sem alteração
do harness, numa verificação do construtor após a revisão reprovada.
A [quarta rodada](reviews/fase-2-rodada-4.md) reprovou caminhos junto a flags
de compilador e retenção sem hooks ou com passos antigos em sessões ativas.
As correções têm regressões para caminhos, expiração por passo, limpeza ociosa
e rollback da política e do histórico. Vinte e dois testes Rust passaram;
os oito casos do harness original da quarta rodada passaram sem alterações
em verificação do construtor, sem substituir a nova revisão independente.
Cobertura de produção local: 95,82% (849/886 linhas), usando somente testes
de integração e omitindo arquivos de teste. O CLI Claude Code real conectou ao
MCP em um ensaio com configuração isolada, sem chamar modelo nem modificar a
configuração pessoal; isso não comprova decisões humanas.
A [evidência](evidence/local-server-phase-2.json) separa esses resultados de
as verificações do construtor da aprovação independente.
A [quinta rodada](reviews/fase-2-rodada-5.md) aprovou o commit
`e374e1ebbad40e38b54c1fc323f40e4cd524f140`: 22 testes oficiais,
33 regressões e nove tentativas novas passaram, incluindo um minuto real
de manutenção ociosa. Ambos os CIs finais passaram nas três plataformas.
A falha temporal anterior no Windows permanece no relatório: a execução
sequencial dos testes foi avaliada sem alterar limites nem produção.
A revisão de segurança dedicada e cobertura do núcleo de decisões pertencem
às Fases 4 e 5; os instaladores, instalação limpa e release pertencem à Fase 6.
