# Solução de problemas

## Nenhuma sessão aparece

Confirme que o Scribe está aberto, que a configuração do plugin terminou e que você abriu uma sessão interativa nova do Claude Code. Políticas gerenciadas podem desativar hooks de usuário. Se necessário, peça à TI para verificar a política.

## Um alvo de permissão fica oculto ou é enviado ao terminal

Esse é o fallback de privacidade para conteúdo ambíguo, redigido, truncado ou incompatível. Responda no terminal do Claude Code; não trate a falta do botão como um problema a contornar.

## O script de configuração falha

Registre a etapa e o código de saída. A saída é ocultada de propósito para que credenciais não sejam impressas. Não envie tokens, arquivos privados de conexão nem conteúdo de conversas.

## Um arquivo baixado é bloqueado

O instalador e o script da beta não são assinados. Confira os valores SHA-256 com os checksums correspondentes da release e siga a política de segurança da organização. Não contorne um bloqueio corporativo.

## O plugin informa erro de caminho longo

Mantenha curto o caminho do checkout/cache e peça à TI para verificar o suporte a caminhos longos do Git. O script não altera configurações do Git.
