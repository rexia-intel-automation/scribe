# Padrões adicionais de risco

As configurações permitem acrescentar textos que exigem confirmação em duas
etapas para novas permissões. Cada linha é um texto literal, comparado sem
distinguir maiúsculas de minúsculas. Não é uma expressão regular. Por exemplo,
`Restart-Service` marca uma permissão `restart-service spooler` como risco.

Os padrões incorporados ao app continuam ativos. Limpar a lista adicional não
remove alertas para comandos como `rm -rf` ou `git push --force`. Planos sempre
exigem a confirmação em duas etapas; responder perguntas não autoriza comandos.

A lista aceita até 32 entradas, 128 bytes UTF-8 por entrada e 2.048 bytes de
conteúdo no total. Espaços nas bordas são ignorados. Entradas vazias, duplicadas
sem distinguir maiúsculas ou com caracteres Unicode de controle/formatação são
rejeitadas. Se a validação falhar, a configuração anterior permanece ativa.

O campo `riskPatterns` fica no arquivo privado `preferences.json`. A alteração
vem da janela local com foco; os endpoints HTTP e MCP não configuram padrões.
O app carrega a lista no início e aplica alterações só a pedidos futuros. A
comparação usa o mesmo alvo bruto completo utilizado pelos padrões incorporados,
incluindo todos os campos conhecidos quando exibidos como JSON. Uma ação cujo
alvo é oculto, redigido, desconhecido ou truncado continua exigindo o terminal.

Esse recurso segue em revisão separada e não integra o instalador beta.1.
