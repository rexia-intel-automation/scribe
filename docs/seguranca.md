# Segurança do Scribe

O Scribe transforma eventos locais em informação visível e escolhas explícitas
da pessoa. Os principais ativos protegidos são a decisão de permissão, as chaves
de transporte e a privacidade das sessões. Esta documentação descreve o código
e os testes; não atribui a nota C10 nem substitui a revisão independente da Fase 5.

## Fronteiras e defesa

O servidor escuta em 127.0.0.1. Host deve corresponder à porta vinculada; qualquer
Origin é rejeitado, inclusive vazio. A webview não faz HTTP direto: usa comandos
Tauri restritos à janela e origem locais. CSP e navegação bloqueiam conteúdo remoto.

Health exige Bearer. Rotas de estado, eventos e decisões exigem também uma
credencial efêmera privada, mantida no bridge Rust. Um hook não resolve um cartão.
Seu canal usa chave HMAC independente do Bearer: o helper comprova o servidor
antes de enviar o input, e pedido e resposta são assinados com domínio, nonces
do cliente e do servidor, caminho e corpo; a resposta inclui também status.
O desafio e o POST usam o mesmo socket, sem pool, retry ou reconexão.
Nenhuma dessas chaves vai em argv ou nos
pedidos do helper. O connection.json é a raiz de confiança e tem permissão
restrita ao usuário. O onboarding envia somente o caminho do helper à CLI;
nem Bearer nem chave HMAC fazem parte da configuração nova do plugin.

No build de produção, app e helper resolvem essa raiz pela identidade da conta
do sistema operacional. No Windows, consultam o Known Folder Roaming com o token
explícito do processo, preservando o redirecionamento configurado para a conta.
No Unix, obtêm o home do cadastro do UID, exigindo UID real e efetivo iguais.
`SCRIBE_CONNECTION_FILE`, `SCRIBE_DATA_DIR`, `HOME`, `USERPROFILE`, `APPDATA`,
`LOCALAPPDATA` e `XDG_CONFIG_HOME`/`XDG_DATA_HOME` não escolhem a raiz de produção.
Assim, um ambiente herdado de configuração de projeto não substitui o arquivo
de confiança. Overrides Scribe existem somente com a feature explícita
`test-fixture`; builds debug comuns não a habilitam automaticamente. A feature é
usada em artefatos release separados sob `target/fixture`.
Builds release de produção não incluem essa feature e ignoram os overrides;
artefatos com `test-fixture` não devem ser distribuídos.
Configurações Linux com XDG personalizado e instalações portáteis com overrides
precisam usar os diretórios fixos documentados; não há fallback para esses valores.

O MCP externo usa o helper em stdio. Inicialização e descoberta de ferramentas
funcionam mesmo com o app fechado; uma chamada indisponível retorna erro, sem
inventar resposta ou consentimento. O endpoint interno `/mcp` exige assinatura,
não aceita mais somente Bearer, e usa domínios HMAC exclusivos do MCP. O helper
verifica a prova do servidor e seu nonce fresco antes de enviar o corpo da
ferramenta, pelo mesmo socket HTTP estabelecido, sem pool ou reconexão. O nonce
do servidor é consumido uma vez e liga corpo, pedido e resposta; reproduzir um
GET não recria a autorização do POST anterior. Cancelamento aborta o socket.
App, helper e plugin devem ser atualizados juntos; o plugin HTTP da beta.1 é
incompatível. O modo `--mcp-check` identifica a capacidade do helper, sem
comprovar que o app está aberto ou atualizado.

O GET do desafio exige uma prova HMAC no header `x-scribe-proof`, sobre os campos
`hook-challenge-request` e nonce. Ela não contém chave, Bearer nem input. Só provas
válidas ocupam o mapa e a quota dos desafios; provas inválidas de GET ou POST
não consomem a quota legítima. A resposta do servidor usa o domínio separado
`hook-challenge`, incluindo um nonce aleatório novo do servidor e impedindo
refletir a prova do cliente como prova do servidor.

Challenges têm prazo monotônico de dois segundos, capacidade e quota separadas,
e são consumidos atomicamente somente depois de conferir a assinatura do pedido.
Um GET pendente duplicado é recusado; depois do consumo, reemitir o GET gera
outro nonce do servidor, que não autoriza o POST capturado. Um POST antigo ou
inválido não consome o par novo. Pedidos sem par reservado são recusados antes
de coletar o corpo. O driver limita a 32 conexões ativas antes do parsing HTTP,
com até 32 cabeçalhos, buffer de 16 KiB e prazo de 2 segundos para completar
cada conjunto de cabeçalhos. Conexões excedentes são fechadas antes do parsing;
o prazo não limita respostas SSE/MCP em andamento nem troca o socket entre o
desafio e o POST. O corpo continua limitado a 1 MiB e 500 ms. Esses limites
reduzem o consumo por entradas incompletas; não garantem disponibilidade diante
de ocupação contínua das vagas por processos locais. Não há prova de carga
concorrente neste lote.
Há limite de corpo de 1 MiB, quota autenticada e capacidade
de cartões. Windows usa bind exclusivo; Unix usa SO_REUSEADDR sem SO_REUSEPORT.

App e helper devem ser atualizados juntos: um helper antigo sem os novos domínios
e o nonce do servidor
é recusado pelo app novo e devolve o controle ao terminal. A instalação beta.1
existente não é alterada por este endurecimento do protocolo.

Decisões têm transporte vivo, sessão, prazo monotônico e uso único. Aprovação
depende de campos completos e visíveis. Entradas redigidas, desconhecidas,
truncadas ou ambíguas voltam ao terminal. Ações de risco e aprovação de plano
exigem armar e confirmar em outro botão, após um segundo. Perguntas não têm
resposta padrão. Falha, expiração ou cancelamento nunca representam consentimento.

Espaços não ASCII e preenchimentos invisíveis Hangul/Braille também são tratados
como ambíguos. Permissões com esses caracteres exigem o terminal; perguntas
ambíguas são recusadas. Espaços ASCII e texto Unicode visível permanecem aceitos.
Rótulos de projeto e caminhos ambíguos recebem `?` em vez de texto invisível;
relatórios cuja apresentação ainda seja ambígua após a higienização são recusados.
Os alertas de risco também incluem refspec forçado de Git, limpeza forçada,
`find -delete`, upload de arquivo pelo curl e `Remove-Item -Force`. A lista é
um aviso conservador, não uma análise completa do shell nem uma barreira de segurança.

SQLite guarda metadados higienizados e o conteúdo seguro apresentado dos cartões
nativos, com retenção padrão de 14 dias. Não guarda raw envelopes, ambiente,
resultado completo de ferramenta, resposta livre ou feedback. Input de eco
permanece em memória enquanto o cartão está pendente e é descartado ao resolver
ou expirar. Arquivos privados usam 0600/0700 no Unix e DACL do usuário no Windows.
Planos são texto inerte na UI; o app não executa HTML nem lê planFilePath.

## Tentativas de ataque cobertas

As linhas abaixo são cenários distintos, exercitados nos testes indicados. Uma
função de teste pode conter vários cenários. A quantidade não é uma pontuação
de segurança, e os testes não representam todos os ataques possíveis.

| Tentativa | Resultado esperado | Evidência automatizada |
| --- | --- | --- |
| Host único estrangeiro ou URI com autoridade divergente, em todas as rotas | 403 antes da rota, sem cabeçalhos CORS | tests/core.rs, http_foreign_hosts_authorities_and_browser_origins_are_rejected_on_every_surface |
| Host duplicado | Rejeitar antes da rota | tests/core.rs, http_boundaries_auth_body_rate_mcp_and_protected_decision_route |
| Origin de página, null ou vazio; GET, POST, DELETE e preflight OPTIONS em todas as rotas | 403 sem cabeçalhos CORS | http_foreign_hosts_authorities_and_browser_origins_are_rejected_on_every_surface |
| Bearer ausente ou incorreto | Não ler estado nem resolver | Mesmo teste HTTP |
| Bearer válido sem credencial privada de UI | Não resolver cartão | Mesmo teste e signed_native_hooks_wait_for_private_ui_and_terminal_returns_no_decision |
| Bearer usado diretamente como autorização de hook | Não criar/cancelar cartão | bearer_only_hooks_are_rejected_and_challenge_flood_does_not_spend_auth_quota |
| Servidor falso ou assinatura com o Bearer como chave | Não enviar input ao impostor | scripts/verification/native-client.test.mjs |
| Resposta sem assinatura ou assinada com outra chave | Nenhum stdout de decisão | Mesmo teste de processo |
| Reprodução de resposta com outro nonce | Nenhum stdout de decisão | Mesmo teste e native_hooks_authenticate_both_peers_and_reject_replay |
| GET capturado reemitido depois do consumo, seguido do POST antigo | POST antigo recusado sem consumir o par novo | native_hooks_authenticate_both_peers_and_reject_replay |
| Duas cópias concorrentes do mesmo pedido válido | Exatamente uma aceita | Mesmo teste de hooks |
| Par ausente com corpo ainda não enviado | 401 antes da leitura do corpo | Mesmo teste de hooks |
| Socket fechado depois de um desafio válido | Sem reconexão nem envio de conteúdo | scripts/verification/native-client.test.mjs |
| Cabeçalhos incompletos | Encerrar a conexão após 2 segundos, mantendo o listener utilizável | tests/core.rs, incomplete_headers_are_closed_without_stopping_the_listener |
| Segunda conexão quando uma única vaga de teste está ocupada | Fechar antes de parsing e liberar a vaga ao encerrar a primeira | server.rs, one_reserved_connection_rejects_an_excess_socket_and_releases_on_close |
| Alteração de evento, status ou corpo da resposta | Nenhum stdout de decisão | Mesmo teste de processo |
| Questions ou plan alterados, mesmo com HMAC válido | Nenhum stdout de decisão | Mesmo teste de processo |
| Redirect ou proxy de ambiente | Não seguir nem enviar conteúdo ao destino | Mesmo teste de processo |
| Ambiente aponta para outro perfil existente ou inexistente | Resolver a mesma raiz da conta, sem ler conexão de teste | hook-protocol/src/profile.rs, account_paths_ignore_project_environment; hook-client/src/main.rs, release_configuration_ignores_project_environment (release) |
| Payload grande, JSON malformado ou stdin sem fim | Encerrar helper sem decisão | Mesmo teste de processo |
| Flood de challenges/provas falsas | Não ocupar desafios nem consumir quota legítima de hooks/MCP/health | unauthenticated_challenge_flood_cannot_block_a_native_hook e teste bearer_only_hooks |
| Prova do desafio com chave/nonce errado, duplicada ou refletida | Nenhum desafio reservado; nenhum payload enviado ao servidor falso | challenge_proof_binds_the_nonce_and_cannot_reflect_the_server_proof e native-client.test.mjs |
| Alvo oculto, campo ignorado, segredo ou Unicode ambíguo | Não permitir aprovação | tests/decisions.rs e tests/interactive.rs |
| Projeto ou relatório com direção de texto ou preenchimento invisível | Rótulo neutro ou relatório recusado, sem persistir o texto ambíguo | tests/core.rs, ambiguous_project_labels_and_reports_never_enter_visible_or_stored_metadata |
| Clique tardio, repetido, sem armar ou antes de um segundo | Não permitir novamente | tests/decisions.rs e tests/interactive.rs |
| Desconexão, SessionEnd, reinício ou timeout | Cancelar sem inventar resposta | Mesmos testes de decisões |

Paths dos testes Rust são relativos a app/src-tauri, exceto as referências
explícitas a hook-protocol e hook-client. O CI exige >=85% de linhas
do núcleo, incluindo testes de perguntas nativas e títulos, sem excluir código
de produção novo. Tests/desktop exercitam origem/IPC e permissões privadas;
Vitest/axe e Playwright exercitam foco, ações explícitas e texto inerte.

## Limites de segurança e da validação

O mesmo usuário do sistema pode ler connection.json e operar o app. Malware
com essa autoridade, administrador e harness comprometido ficam fora da
proteção criptográfica deste canal. O cliente MCP autenticado pode nomear outra
sessão; a chave local é compartilhada por usuário, e a identidade por sessão
ainda não é isolada.

O helper não atribui autoria humana à resposta só por ela ser assinada: o
servidor confiável e o bridge privado fazem parte da base de confiança. Sair
do planejamento pode restaurar um modo anterior do Claude Code. O Scribe não
substitui deny/ask rules, política corporativa nem sandbox do harness.

O scanner de segredos é conservador: texto como x = y, menções a token/secret
e planos extensos pode exigir o terminal. Isso reduz a usabilidade e não deve
ser resolvido omitindo conteúdo que altere o significado da aprovação.
O ensaio Claude Code 2.1.293 em -p não ofereceu AskUserQuestion; suporte nativo
headless não está validado. Um ensaio interativo real permanece necessário.

As exceções GTK estão documentadas em dependencias-desktop.md. A inferência de
não alcance de VariantStrIter não corrige glib nem constitui prova formal.
Instaladores sem certificado não estão assinados. Conferir SHA-256 detecta
alteração em relação ao checksum confiável; não estabelece sozinho a autoria.
Nenhuma proteção do CI ou alerta é contornada para publicar.

## Como verificar e reportar

Execute os testes com lockfiles, como no CI, e os testes Node de processo contra
o helper release de fixture, compilado com `test-fixture` em
`app/hook-client/target/fixture`; não use esse artefato como produção. O resolver
do helper release de produção deve ser verificado sem a feature, e a descoberta
real no Claude Code usa o release de produção. No espelho D: use SCRIBE_TEST_FIXTURES_ROOT apontando aos
46 fixtures versionados da fonte OneDrive; fixtures locais extras não pertencem
à suíte pública. Vereditos são ligados ao SHA. A release depende da revisão
independente, CI das três plataformas, cobertura e ensaio da instalação real.

Relate vulnerabilidades pelo canal privado descrito em SECURITY.md. Use
marcadores fictícios para reproduzir vazamentos e nunca anexe credenciais reais.
