# ADR 0011: desafio fresco e socket único para hooks

Status: candidato; depende de revisão cruzada e CI. Não aprova a Fase 5.

## Problema confirmado

O protocolo anterior consumia o nonce do cliente, mas permitia reservar o mesmo
nonce novamente com um GET capturado. Assim, o POST capturado voltava a ser
aceito. O helper também usava agentes HTTP distintos para desafio e POST, sem
garantir que o socket que recebeu o conteúdo fosse o que provou sua identidade.

Um teste isolado contra `dbda655` reproduziu a primeira falha: depois de aceitar
um `SessionEnd` público, reemitir o GET fez o mesmo POST receber 204 quando o
teste exigia 401. A reprodução e o log ficam localmente em
`.artifacts/coordenacao/hook-replay-red.rs` e `hook-replay-red.log`, preservados
como evidência do servidor anterior. Ela não toca a instalação ou sessões reais.

## Decisão

Hooks e MCP usam o mesmo cliente HTTP baseado em Hyper, com domínios HMAC
distintos. Cada chamada abre exatamente um socket para 127.0.0.1 e prova o
servidor antes de enviar o conteúdo. Sem pool, proxy, redirect, retry ou
reconexão; um socket fechado depois do desafio causa falha segura.

O desafio hook permanece em `GET /v1/hooks/challenge/<client_nonce>`:

- Pedido: `hook-challenge-request`, nonce do cliente.
- Resposta 204: `x-scribe-server-nonce` aleatório de 128 bits e prova sobre
  `hook-challenge`, nonce do cliente e nonce do servidor.
- POST: headers de ambos os nonces e prova sobre `hook-request`, os dois
  nonces, caminho exato `/v1/hooks/<event>` e corpo exato.
- Resposta: prova sobre `hook-response`, os dois nonces, caminho, status e corpo.

Campos em ordem para `scribe_hook_protocol::sign` e `verify`:

| Prova | Campos |
|---|---|
| Pedido do desafio | `[hook-challenge-request, client_nonce]` |
| Resposta do desafio | `[hook-challenge, client_nonce, server_nonce]` |
| Pedido hook | `[hook-request, client_nonce, server_nonce, path, body]` |
| Resposta hook | `[hook-response, client_nonce, server_nonce, path, status, body]` |

Cada campo usa seus bytes UTF-8; corpo usa os bytes recebidos e status é decimal
ASCII. O módulo compartilhado aplica a separação de campos pelo comprimento.
Query strings são recusadas em desafios e hooks: não existe conteúdo extra
fora desses campos. As notas da próxima release devem exigir app e helper do
mesmo pacote; misturar executáveis da beta.1 com este protocolo não funciona.

O mapa tem TTL monotônico de dois segundos e capacidade 256. Desafios pendentes
duplicados são recusados. A presença do par é verificada antes de ler o corpo;
o par só é consumido atomicamente depois da assinatura válida. Um pedido antigo
ou com assinatura errada não invalida o par novo. Reemitir um GET depois do
consumo produz outro nonce do servidor e não restaura a autorização anterior.

O helper mantém os prazos anteriores: 250 ms para observação, 125 s para decisão
interativa, stdin limitado a 1 MiB/250 ms e resposta hook limitada a 8192 bytes.
Ele constrói um runtime de uma thread para cada hook. Falhas continuam sem
stdout de decisão, devolvendo o controle ao terminal. Só respostas atestadas e
compatíveis com o input original podem produzir uma escolha.

O transporte e os limites MCP da ADR0010 permanecem: resposta de 1 MiB,
initialize/tools/list locais, cancelamento e EOF. Seu formato de MAC não muda.
O cliente comum remove a dependência ureq; o lockfile remove somente pacotes
que ela deixou de usar.

## Migração

App e helper exigem atualização pareada. O servidor novo recusa o desafio do
helper antigo; o helper novo recusa a prova do servidor antigo antes de mandar
conteúdo. Não há fallback para o protocolo anterior. A versão de pacote 0.1.0
isolada não identifica compatibilidade; confira origem e hashes do pacote.
Nenhum arquivo da beta.1 publicada é substituído por este lote.

## Evidência e limites

Os testes do servidor cobrem replay após reemissão, par novo preservado, MAC
inválido, cópias concorrentes, respostas assinadas e recusa de corpo incompleto
antes da autenticação. Um pedido com par reservado e corpo incompleto continua
coberto pelo timeout de leitura, separadamente. Host único estrangeiro, URI
absoluta divergente e OPTIONS têm casos em hooks, challenge e MCP.

Testes de processo cobrem os 11 eventos, respostas humanas suportadas, socket
único, nonce do servidor inválido/ausente, Connection: close após prova válida,
resposta com outro nonce, limites e ausência de segredos. A integração MCP real
confere que a extração do cliente não altera descoberta, concorrência, escolha,
cancelamento ou EOF. Evidências locais não substituem CI multiplataforma,
ensaio real do Claude Code, instalação ou aceite humano.

O controle pré-body fecha essa parte de F04. Não oferece limitação global de
conexões ou timeout curto de leitura de cabeçalhos, nem comprova disponibilidade
sob sobrecarga. F04 completo e demais pendências de segurança/desempenho seguem
sob revisão; este documento não atribui C10.
