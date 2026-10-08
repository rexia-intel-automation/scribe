# ADR 0011 — Eco explícito de sugestões de permissão

Status: implementação proposta; validação no Claude Code interativo pendente.
Data: 2026-10-08. Requisito: FR-22, condicionado a mecanismo documentado.

## Evidência e mudança da decisão anterior

O ADR 0001 registrou a ausência de prova de regra persistente por projeto nas
capturas iniciais. A [referência atual de hooks](https://code.claude.com/docs/en/hooks#permission-update-entries)
documenta `permission_suggestions`, o eco por `updatedPermissions` em uma
decisão `allow` e os destinos `session`, `localSettings`, `projectSettings`
e `userSettings`. A condição documental de FR-22 agora tem evidência; isso
não comprova que cada diálogo da versão local ofereça a mesma sugestão.

## Decisão

Oferecer apenas entradas originais reconhecidas e integralmente visíveis.
“Somente esta chamada” continua sendo a escolha inicial. A pessoa seleciona
uma sugestão, vê seu JSON completo, efeito e alcance, arma a escolha e confirma
em outro botão depois de um segundo. O índice armado vincula a confirmação;
trocar a escolha não reaproveita o gesto. Atalhos não aplicam sugestões.

O backend aceita os seis tipos documentados de atualização. Campos desconhecidos,
texto ambíguo, segredos, entradas incompletas e limites excedidos não são
oferecidos. Limites: até oito sugestões/8.000 bytes no pedido; cada atualização
até 2.048 bytes e oito regras/pastas, com nomes até 128 bytes e conteúdo até
1.024 bytes. Se o próprio alvo não puder ser aprovado com segurança, as
sugestões também ficam no terminal.

Uma resposta aplica apenas a entrada escolhida, sem alterar destino, padrões
ou modo. O helper verifica o schema e sua igualdade com uma sugestão do stdin
original, além da assinatura do transporte. Não há escrita direta de regras
do Claude pelo Scribe. Negar, expirar e responder no terminal nunca aplicam
`updatedPermissions`.

## Significado e limites

`session` é memória da sessão; `localSettings` é configuração privada do projeto;
`projectSettings` é configuração compartilhada do projeto; `userSettings` vale
para os projetos do usuário. Um `setMode` não vira um botão “Sempre neste projeto”.
Uma regra sem `ruleContent` cobre a ferramenta inteira e recebe aviso explícito.

Sugestões não são uma cópia das opções de cada diálogo. O Claude aplica suas
políticas e regras deny/ask; alguns modos podem resultar em nenhuma mudança.
Em particular, a documentação restringe `bypassPermissions` conforme a sessão
e a política, e esse modo não é persistido como `defaultMode`.

Os testes usam pedidos sintéticos para validar schema, confirmação, igualdade
e rejeições. O ensaio interativo de uma sugestão real e seu efeito continua
necessário antes do aceite do FR-22. Esta entrega não está na beta.1 publicada.
