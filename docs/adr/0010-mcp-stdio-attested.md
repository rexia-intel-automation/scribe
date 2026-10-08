# ADR 0010 — MCP por stdio com chamadas locais atestadas

O protocolo negociado entre o Claude e o helper é independente do salto
privado helper → app. Nesse salto, o header `mcp-protocol-version` é sempre
`2025-11-25`: o RMCP já consumiu os metadados inline do cliente ao montar o
contexto. Isso permite chamadas modernas (`2026-07-28`, sem `initialize`) sem
enviar ao app um corpo legado acompanhado de um header que exige `_meta`.
Os testes Node verificam o header e a prova; a integração Rust verifica
relatório persistido, recuperação offline e pergunta concorrente no app real.
O smoke da CLI real continua cobrindo descoberta; o ensaio do Claude cobre
chamadas reais, e essas evidências são registradas separadamente.

Status: implementado no candidato; revisão cruzada, CI e ensaios reais pendentes.

## Contexto

O plugin HTTP enviava Bearer e conteúdo da ferramenta ao processo que ocupasse
a porta local antes de comprovar sua identidade. Além disso, iniciar o Claude
com o app fechado podia deixar o MCP indisponível naquela sessão.

## Decisão

O plugin inicia `scribe-hook --mcp` por stdio. O SDK RMCP implementa o servidor;
inicialização e lista de ferramentas são locais. Os esquemas ficam no pacote
compartilhado e um teste compara a lista completa com a gerada pelo app.
Somente chamadas de ferramentas são encaminhadas ao app, concorrentes entre si.
App fechado ou incompatível resulta em erro de ferramenta, sem consentimento.

As duas superfícies MCP emitem `ttlMs: 0` e `cacheScope: "private"` em
`tools/list`, inclusive quando negociam `2025-11-25`. O Claude Code 2.1.294
rejeitou a listagem sem esses campos no ensaio real do candidato 7dfaec7.
São os campos de cache retrocompatíveis do
[SEP-2549](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/seps/2549-TTL-for-list-results.md),
já disponíveis no RMCP 3.5.0. A lista deve ser tratada como imediatamente
desatualizada e restrita ao cliente solicitante; isso não muda autenticação,
esquemas ou versão negociada, nem declara suporte integral ao protocolo novo.

Cada chamada estabelece um socket HTTP1 com Hyper. Um GET autenticado obtém
nonce fresco e prova do servidor. O corpo só é enviado depois de verificar
essa prova, pelo mesmo socket: não há pool, redirects, proxy ou retry. O app
exige assinatura MCP, com domínios separados dos hooks, TTL de dois segundos e
consumo único do par de nonces. Pedido e resposta vinculam seus bytes exatos.

Cancelamento aborta o driver do socket. EOF, erro de leitura ou linha acima de
1 MiB cancelam o serviço e as chamadas pendentes. O app expira a pergunta ao
perder seu transporte; o cartão pode permanecer no histórico como expirado.
O limite também vale para corpos HTTP. stdout contém somente JSON-RPC no modo
MCP; mensagens de falha não imprimem argumentos, respostas ou credenciais.

## Migração

O plugin sobe de `0.1.0` para `0.1.1`, com `client_path` como única opção.
App e helper continuam com versão de pacote `0.1.0`; esse número isolado não
distingue a beta.1 do candidato. Identifique o candidato pelo commit de origem
dos artefatos e pela capacidade `attested-stdio-v1`. `--mcp-check` informa essa
capacidade sem abrir o app, ler credenciais ou comprovar disponibilidade.
O onboarding executa essa checagem antes de alterar o plugin.

App/helper e plugin devem ser atualizados juntos. A beta.1 é incompatível;
plugin HTTP antigo com app novo recebe 401. Seu token antigo deixa de ser usado
pelo plugin novo. O script usa a CLI oficial e não edita ou apaga perfis reais.
O pacote de release registra a versão própria do plugin, mantendo a identidade
exata da tag para app/desktop e os checks de origem, plataformas e hashes.

## Verificação

Os testes de integração usam o helper de produção e o servidor real em DB,
configuração e porta temporárias. Cobrem descoberta offline, recuperação,
pergunta concorrente com relatório, entrega da escolha, cancelamento e EOF sem
resposta inventada. Testes de transporte conferem socket único, ausência de
corpo diante de prova inválida, recusa de reconexão e resposta adulterada.
Testes do servidor cobrem recusa de Bearer e replay após reemitir o desafio.
O onboarding tem executáveis simulados e perfis temporários em PowerShell 5.1/7.

O CI Windows também executa `claude mcp add` e `claude mcp list` com a CLI
2.1.294 e o helper de produção. Usa configuração, cwd e diretórios de perfil
temporários vazios, remove variáveis de credenciais e não chama o modelo.
Exige o servidor de teste como conectado, sem erro de listagem de ferramentas.
O helper recebe um caminho de conexão inexistente: descoberta não depende de
app instalado, dados reais ou login. O mesmo smoke reproduziu a rejeição do
helper anterior e passou com os campos corrigidos na CLI nativa local.

Essas provas não substituem sessões interativas do Claude, ensaio do instalador,
aceite humano ou nota da Fase 5. O protocolo dos hooks permanece neste lote;
as pendências independentes de replay/confidencialidade dele continuam abertas.
