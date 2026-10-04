# ADR 0004 — retomada e nomes

- Data: 2026-10-04, America/Sao_Paulo.
- Estado: autorizado pelo humano.

## Contexto

A terceira revisão reprovou a Fase 0 por fragmentos de credenciais em texto
livre. O teto de três rodadas da seção 13.1 impediu novas correções. A estratégia
de reconhecer cada sintaxe de segredo não oferece uma fronteira confiável para
capturas públicas.

## Decisão

O humano autorizou substituir o teto por correção e revisão até aprovação,
mantendo as notas mínimas, independência e proibição de avançar fase reprovada.
O prompt foi atualizado e os três relatórios históricos preservados.

A instrumentação retém somente campos conhecidos, metadados enumerados e
aliases. O restante do texto e nomes de campos desconhecidos são omitidos.
Isso vale para fixtures públicos, não substitui requisitos do app futuro sobre
prévia higienizada de permissões e resumos. As fontes reais permanecem
rastreáveis; testes sintéticos ficam em diretórios temporários separados.

O humano confirmou repositório `rexia-intel-automation/scribe` e marketplace
`rexia-scribe`. A conta autenticada corresponde ao owner escolhido. Consultas
em 2026-10-04 a GitHub API e npm Registry retornaram 404 para esses nomes.
Uma consulta não reserva o nome nem autoriza afirmar publicação existente.

O humano também confirmou usar as referências locais HTML/ZIP/vídeo e a gota
em argila (`#d97757`). Certificados e destino da documentação foram perguntados
em conjunto e aguardam resposta; são decisões da Fase 6.

## Consequências

A Fase 0 precisa de nova revisão independente antes da Fase 1. São necessários
testes sintéticos específicos para o conteúdo removido dos fixtures. O cliente
nativo, o app e a instalação só receberão crédito quando testados.
