# Segurança do Scribe

O Scribe transforma eventos locais em informação visível e escolhas explícitas
da pessoa. Os principais ativos protegidos são a decisão de permissão, as chaves
de transporte e a privacidade das sessões. Esta documentação descreve o código
e os testes; não atribui a nota C10 nem substitui a revisão independente da Fase 5.

## Fronteiras e defesa

O servidor escuta em 127.0.0.1. Host deve corresponder à porta vinculada; qualquer
Origin é rejeitado, inclusive vazio. A webview não faz HTTP direto: usa comandos
Tauri restritos à janela e origem locais. CSP e navegação bloqueiam conteúdo remoto.

MCP e health exigem Bearer. Rotas de estado, eventos e decisões exigem também uma
credencial efêmera privada, mantida no bridge Rust. Um hook não resolve um cartão.
Seu canal usa chave HMAC independente do Bearer: o helper comprova o servidor
antes de enviar o input, e pedido e resposta são assinados com domínio, nonce,
evento e, na resposta, status e corpo. Nenhuma dessas chaves vai em argv ou nos
pedidos do helper. O connection.json é a raiz de confiança e tem permissão
restrita ao usuário. O onboarding envia o Bearer ao CLI oficial apenas por stdin.

O GET do desafio exige uma prova HMAC no header `x-scribe-proof`, sobre os campos
`challenge-request` e nonce. Ela não contém chave, Bearer nem input. Só provas
válidas ocupam o mapa e a quota dos desafios; provas inválidas de GET ou POST
não consomem a quota legítima. A resposta do servidor usa o domínio separado
`challenge`, impedindo refletir a prova do cliente como prova do servidor.

Challenges têm prazo monotônico de dois segundos, capacidade e quota separadas,
e são consumidos no pedido. A resposta fica ligada ao nonce escolhido pelo helper.
Isso rejeita a troca ou reprodução de respostas entre pedidos; não constitui um
cache eterno de nonces. Há limite de corpo de 1 MiB, quota autenticada e capacidade
de cartões. Windows usa bind exclusivo; Unix usa SO_REUSEADDR sem SO_REUSEPORT.

App e helper devem ser atualizados juntos: um helper antigo sem a prova do GET
é recusado pelo app novo e devolve o controle ao terminal. A instalação beta.1
existente não é alterada por este endurecimento do protocolo.

Decisões têm transporte vivo, sessão, prazo monotônico e uso único. Aprovação
depende de campos completos e visíveis. Entradas redigidas, desconhecidas,
truncadas ou ambíguas voltam ao terminal. Ações de risco e aprovação de plano
exigem armar e confirmar em outro botão, após um segundo. Perguntas não têm
resposta padrão. Falha, expiração ou cancelamento nunca representam consentimento.

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
| Host falso, duplicado ou URI com autoridade divergente | Rejeitar antes da rota | tests/core.rs, http_boundaries_auth_body_rate_mcp_and_protected_decision_route |
| Origin de página, inclusive vazio | Rejeitar sem CORS | Mesmo teste HTTP |
| Bearer ausente ou incorreto | Não ler estado nem resolver | Mesmo teste HTTP |
| Bearer válido sem credencial privada de UI | Não resolver cartão | Mesmo teste e signed_native_hooks_wait_for_private_ui_and_terminal_returns_no_decision |
| Bearer usado diretamente como autorização de hook | Não criar/cancelar cartão | bearer_only_hooks_are_rejected_and_challenge_flood_does_not_spend_auth_quota |
| Servidor falso ou assinatura com o Bearer como chave | Não enviar input ao impostor | scripts/verification/native-client.test.mjs |
| Resposta sem assinatura ou assinada com outra chave | Nenhum stdout de decisão | Mesmo teste de processo |
| Reprodução de resposta com outro nonce | Nenhum stdout de decisão | Mesmo teste e native_hooks_authenticate_both_peers_and_reject_replay |
| Alteração de evento, status ou corpo da resposta | Nenhum stdout de decisão | Mesmo teste de processo |
| Questions ou plan alterados, mesmo com HMAC válido | Nenhum stdout de decisão | Mesmo teste de processo |
| Redirect ou proxy de ambiente | Não seguir nem enviar conteúdo ao destino | Mesmo teste de processo |
| Payload grande, JSON malformado ou stdin sem fim | Encerrar helper sem decisão | Mesmo teste de processo |
| Flood de challenges/provas falsas | Não ocupar desafios nem consumir quota legítima de hooks/MCP/health | unauthenticated_challenge_flood_cannot_block_a_native_hook e teste bearer_only_hooks |
| Prova do desafio com chave/nonce errado, duplicada ou refletida | Nenhum desafio reservado; nenhum payload enviado ao servidor falso | challenge_proof_binds_the_nonce_and_cannot_reflect_the_server_proof e native-client.test.mjs |
| Alvo oculto, campo ignorado, segredo ou Unicode ambíguo | Não permitir aprovação | tests/decisions.rs e tests/interactive.rs |
| Clique tardio, repetido, sem armar ou antes de um segundo | Não permitir novamente | tests/decisions.rs e tests/interactive.rs |
| Desconexão, SessionEnd, reinício ou timeout | Cancelar sem inventar resposta | Mesmos testes de decisões |

Paths dos testes Rust são relativos a app/src-tauri. O CI exige >=85% de linhas
do núcleo, incluindo testes de perguntas nativas e títulos, sem excluir código
de produção novo. Tests/desktop exercitam origem/IPC e permissões privadas;
Vitest/axe e Playwright exercitam foco, ações explícitas e texto inerte.

## Limites de segurança e da validação

O mesmo usuário do sistema pode ler connection.json e operar o app. Malware
com essa autoridade, administrador e harness comprometido ficam fora da
proteção criptográfica deste canal. O compartilhamento de Bearer MCP permite
ao chamador nomear outra sessão; identidade por sessão ainda não é isolada.

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
o helper release atual. No espelho D: use SCRIBE_TEST_FIXTURES_ROOT apontando aos
46 fixtures versionados da fonte OneDrive; fixtures locais extras não pertencem
à suíte pública. Vereditos são ligados ao SHA. A release depende da revisão
independente, CI das três plataformas, cobertura e ensaio da instalação real.

Relate vulnerabilidades pelo canal privado descrito em SECURITY.md. Use
marcadores fictícios para reproduzir vazamentos e nunca anexe credenciais reais.
