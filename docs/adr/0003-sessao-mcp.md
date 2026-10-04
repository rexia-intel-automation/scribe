# ADR 0003 — associação explícita das ferramentas MCP à sessão

- Estado: mecanismo comprovado em spike; alteração do contrato proposta.
- Data: 2026-10-04.

## Contexto

O contrato original das ferramentas não inclui sessão. Um projeto pode conter
várias sessões simultâneas; associar só por cwd é ambíguo. A documentação confirma
substituição de `${CLAUDE_SESSION_ID}` em skills, mas não assegura que esse ID seja
exportado automaticamente para headers de um MCP HTTP.

## Decisão proposta

A skill informa o ID substituído e as ferramentas recebem `session_id` explícito
além de seus argumentos originais. O servidor valida que a sessão existe e não
associa arbitrariamente a outra sessão. Ausência de ID exige instrução para invocar
a skill; não adivinhar a sessão mais recente. Esse identificador é correlação,
nunca credencial de autorização.

## Evidência

O spike usou a skill temporária `/scribe-phase-zero-probe:context` e ferramentas
MCP HTTP. As chamadas de scribe_report e scribe_ask apresentaram o mesmo ID do
hook SessionStart, verificado no servidor. Ambas foram autenticadas. A ferramenta
de pergunta devolveu timeout deliberado; nenhuma escolha humana foi simulada.
Ver `docs/evidence/mcp-1791144782320.json`.

## Espera e retomada de perguntas

A documentação atual registra background automático de chamadas longas da
conversa principal após dois minutos; `timeout: 610000` por si só não evita esse
comportamento. O ID da decisão deve permanecer associado à sessão mesmo quando
a chamada sair do primeiro plano. Resolução, timeout e cancelamento terão
resultado único e explícito; a skill não deverá repetir a pergunta enquanto
a primeira continuar pendente nem inventar uma escolha.

Se a continuidade estritamente síncrona for necessária, a configuração
documentada `CLAUDE_CODE_MCP_AUTO_BACKGROUND_MS=0` é uma opção do usuário, sem
edição automática de sua configuração. Na Fase 4, testar background, resposta
tardia, cancelamento e dez minutos reais nos modos interativo e não interativo.
O spike atual devolve timeout imediatamente e não comprova esses caminhos.
Fonte: [MCP — chamadas longas](https://code.claude.com/docs/en/mcp#automatic-backgrounding-of-long-tool-calls).

## Alternativas e consequências

cwd sozinho não resolve concorrência. `MCP-Session-Id` identifica a conexão MCP,
não é o identificador de sessão do Claude Code. Não usar nome de variável de
ambiente não documentado. O novo argumento precisa entrar no contrato antes da
Fase 1 e ser coberto por teste com duas sessões no mesmo cwd na Fase 4.
