# ADR 0010 — respostas de permissões e perguntas

- Data: 2026-10-07.
- Estado: implementado na compilação local; não é aprovação da Fase 4 nem release.

## Contexto

O humano pediu executar até o Scribe conseguir devolver respostas ao Claude Code.
O transporte, servidor e janela anteriores apenas observavam eventos. O hook
descartava respostas e `scribe_ask` retornava indisponível imediatamente.

## Decisão

Uma fila no núcleo liga cada cartão a uma sessão viva e a um canal de resposta
de uso único. Só a ponte Tauri da janela local com foco, ou a rota HTTP com as
credenciais separadas da interface, resolve um cartão. Tokens de hooks/MCP
não bastam para resolver decisões. O alvo mostra apenas comando ou metadados de
caminho, com redação de segredos; conteúdo de Write/Edit e ambiente são excluídos.
O comando completo higienizado fica disponível ao expandir o cartão.

`PermissionRequest` mantém a requisição aberta até a escolha ou o prazo.
O prazo padrão é 120 segundos, configurável entre 1 e 120 na janela. O cliente
aguarda até 125 segundos, abaixo dos 130 do manifesto. Ele valida e reconstrói
somente `hookSpecificOutput.decision.behavior` allow/deny, imprimindo o JSON
em stdout. Sem decisão, falha ou resposta inválida, sai silenciosamente.
Outros hooks conservam o orçamento de 250 ms e a saída vazia.

`scribe_ask` valida a sessão explícita, pergunta e opções; aguarda até dez
minutos e devolve a opção selecionada no resultado MCP. Pergunta duplicada
na mesma sessão é rejeitada enquanto a original estiver pendente.
Cancelamento MCP descarta o canal e invalida o cartão. `Stop` não cancela uma
pergunta, pois uma chamada longa pode continuar em segundo plano.

Pedido resolvido, expirado, cancelado ou restaurado após reinício nunca concede
uma nova permissão. Encerramento/retomada de sessão e conclusão da ferramenta
invalidam pedidos antigos sob o mesmo lock que atualiza a sessão. Gravação
SQLite deve ter sucesso antes de liberar allow/deny; falha mantém a espera.
Dados restaurados pendentes viram expirados, sem recriar canais de aprovação.

Padrões de risco usam o alvo anterior à redação. Permitir exige duas ações
separadas (`arm`, depois `allow`), e o atalho A fica desabilitado. A/D só atuam
no cartão com foco. “Sempre neste projeto” continua fora desta implementação,
conforme ADR 0001; nenhuma regra pessoal é escrita.

## Verificação e consequências

Testes do núcleo, ponte e cliente cobrem escolha única, sessões concorrentes,
tipo/índice inválido, redação, falha de banco, risco, expiração e cancelamento.
O instrumento `app/ui/test/native-decisions.mjs` usa cliques automatizados
na webview nativa e chamadas reais do Claude exclusivamente em arquivos públicos
de uma pasta isolada. Evidências e limites são registrados em `docs/fase-4.md`.

Scribe continua sem chamar modelos. O instrumento de teste invoca o Claude CLI;
o aplicativo somente transporta as decisões. O aceite humano, notificações
nativas, auditoria final e empacotamento multiplataforma permanecem entregas
separadas do fluxo local de respostas.

Referência: [hooks do Claude Code](https://code.claude.com/docs/en/hooks#permissionrequest-decision-control).
