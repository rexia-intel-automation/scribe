# ADR 0013 — limites da aprovação visível

- Data: 2026-10-08.
- Estado: registro da restrição implementada; Fase 4 ainda sem aceite.

## Contexto

FR-20 exige mostrar a ação exata antes de permitir. A redação de segredos e a
exclusão de conteúdo de arquivos são necessárias para preservar a privacidade.
Por isso, mostrar somente o caminho de uma edição ou um resumo truncado não
basta para autorizar a operação original. A revisão independente da Fase 4
apontou que essa restrição precisava de um registro explícito de escopo.

## Decisão

A autorização pelo cartão fica disponível apenas para os schemas conhecidos
de Bash, PowerShell, Read, Glob e Grep, quando todos os campos recebidos são
metadados completos, reconhecidos e visíveis sem redação ou truncamento.
Os campos aceitos de cada ferramenta estão em Core::permission.

Write, Edit, WebFetch, ferramentas MCP arbitrárias e schemas com campos
desconhecidos seguem no terminal. O Scribe pode negar ou devolver o controle
sem produzir uma autorização; não mostra o conteúdo omitido para habilitar
o botão Permitir.

Strings com caracteres de controle ou formatação Unicode também seguem no
terminal. Isso inclui LF, CR e TAB em comandos multilinha. Substituir esses
caracteres por espaços altera a representação da ação e não permite aprová-la
com segurança pelo cartão atual. Essa restrição não significa que comandos
multilinha são proibidos no Claude Code.

## Verificação e consequências

approval_requires_complete_visible_known_metadata cobre conteúdo oculto,
schemas desconhecidos, Write, Edit, WebFetch, MCP, LF, CR, TAB, redação e
truncamento. Armar ou permitir esses cartões deve falhar no servidor.

Esta decisão registra uma limitação funcional da v0.1; não amplia a allowlist,
não substitui o ensaio humano de FR-20 e não declara a Fase 4 aprovada.
Uma ampliação futura exige representação integral e segura, testes e revisão.

O ADR 0009 registra o estado anterior à implementação das respostas.
O ADR 0010 documenta a implementação posterior de scribe_ask e permissões;
o ADR 0011 documenta as sugestões de atualização de permissões. Esses registros
históricos não são evidência de aceite do código atual.
