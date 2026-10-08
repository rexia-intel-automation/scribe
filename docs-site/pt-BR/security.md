# Segurança e privacidade

O Scribe foi projetado para manter seu serviço em `127.0.0.1` e o fluxo de eventos no mesmo computador. O app não chama modelos de IA nem envia telemetria. O plugin envia somente os dados necessários para atualizar as sessões e mostrar decisões compatíveis; alvos exibidos são higienizados, e conteúdo ambíguo ou oculto deve ser tratado no terminal do Claude Code.

## Segurança das decisões

Cartões de permissão exigem uma ação humana. Pedidos de risco exigem uma confirmação separada após um intervalo. Expiração, desconexão e falha não significam aprovação. Os fluxos de pergunta nativa e plano são limitados às entradas compatíveis; um ensaio em sessão interativa nova ainda está pendente para aceite.

## Dados e limites

O Scribe armazena metadados de sessão higienizados localmente, com retenção padrão de 14 dias. Não armazena envelopes brutos de hooks nem resultados completos de ferramentas. A fronteira de segurança não protege contra malware executado pelo mesmo usuário do sistema, administradores ou um processo hospedeiro comprometido. O Scribe não substitui regras de permissão do Claude Code, políticas da organização ou sandbox.

O instalador não é assinado. Um checksum detecta divergência em relação a uma fonte confiável de checksums, mas não prova sozinho quem criou o arquivo. Siga a política da organização.

Esta página resume o projeto e os testes documentados; não declara certificação de segurança independente nem aceite da versão final. Consulte a [política de segurança](https://github.com/rexia-intel-automation/scribe/blob/main/SECURITY.md) para reportar uma vulnerabilidade.
