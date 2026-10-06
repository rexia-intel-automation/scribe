# ADR 0007 — servidor local e persistência

- Data: 2026-10-04.
- Estado: aprovado na quinta revisão da Fase 2, em 2026-10-06.

## Contexto

As Fases 0 e 1 passaram. O servidor precisa receber os onze eventos reais,
persistir apenas os dados necessários e continuar sem produzir decisões.
Uma credencial de hook não deve autorizar operações exclusivas da interface.

## Decisão

Rust axum/tokio, SQLite rusqlite embarcado e SDK Rust oficial rmcp 3.5.0 para
MCP Streamable HTTP, sem cliente HTTP externo nem recurso de modelos. A versão
do SDK suporta discovery do protocolo 2026-07-28 e clientes anteriores.
Lockfile versionado e auditoria no CI antes da catraca.

Bind exclusivamente 127.0.0.1, porta padrão 7717. Host inclui a porta correta;
todo Origin é rejeitado. A interface utilizará uma ponte Rust no Tauri, sem
fetch direto do webview, portanto não precisa de exceção CORS. Token Bearer
é obrigatório em todas as rotas, comparado em tempo constante. Estado/SSE
exigem também uma credencial efêmera da interface, mantida no processo e
distinta do token entregue ao plugin. O fluxo humano e a ponte serão
implementados nas Fases 3 e 4; a rota de decisões não existe nesta fase.

Corpo limitado a 1 MB, taxa limitada a 50 requisições por segundo. O SQLite
guarda sessões e vinte passos já higienizados, nunca o payload original,
ambiente, transcript, prompt, saída de ferramenta ou conteúdo de arquivo.
Retenção padrão de quatorze dias. Operações de banco usam trabalho bloqueante
separado do executor assíncrono; publicar mudança somente após gravação.

O limite de taxa conta requisições autenticadas, após rejeitar Host/Origin e
credenciais inválidos, antes de ler o corpo. Tentativas sem credencial não
consomem a cota de sessões legítimas nem entram no banco. A memória conserva
até 256 sessões visíveis e até 256 subagentes por sessão; excesso falha sem
decisão. Sessões concluídas saem da memória após a janela configurada e
continuam no histórico. Eventos atrasados não reabrem sessões encerradas.
SessionStart reinicia o tempo da sessão observada e o contador de subagentes.
O encerramento cancela streams e libera a porta; Drop também cancela o serviço.

A higienização do produto preserva ferramenta e alvo útil, redigindo padrões
de segredo antes de resumir. É distinta da anonimização pública da Fase 0,
que omite todo conteúdo. Caminhos são encurtados para a interface.
Usa-se `…/projeto/arquivo`, sem prefixo `~` fictício para caminhos que podem
estar fora do diretório pessoal. Caminhos em comandos e relatos também são
encurtados; URLs permanecem úteis. O alvo completo de permissões pertence à
Fase 4 e será higienizado sem truncar antes de oferecê-lo para expansão.
Reinício não restaura pedidos pendentes nem subagentes como se ainda ativos.
O filtro de visibilidade é aplicado no SQLite antes do limite de carga, com
sessões vivas primeiro. Usa json_extract do SQLite embarcado, disponível por
padrão desde 3.38. Novos eventos atualizam cwd/projeto mantendo os passos.
Valores de atribuições reconhecem nomes válidos em ambos os casos.
Depois da primeira atribuição de variável, todo o restante do texto é omitido,
inclusive múltiplas linhas: sem executar ou interpretar o shell, os argumentos
seguintes são ambíguos com valores dotenv que contêm espaços. Esta opção perde
detalhe de alguns comandos em favor de não persistir caudas de credenciais.
Texto que menciona `.env` é omitido por inteiro, sem diferenciar maiúsculas:
escritas podem construir/codificar a atribuição, sem `=` literal reconhecível.
Inclui `.env.local`/`.env.example` e menções inofensivas; esta perda de detalhe
evita depender de interpretar comandos para não persistir valores dotenv.
Authorization e chaves sensíveis delimitadas, inclusive flags de comandos,
omitem todo o texto seguinte em vez de tentar reconhecer o fim de um valor
por aspas/escapes. Concatenação Bash e escapes PowerShell não deixam caudas
visíveis. Caminhos após operadores de shell e flags de compilador como
`-I`/`-L` também são encurtados.
Retenção usa o horário de cada passo: renovar a sessão não renova passos
antigos. O SQLite filtra o array JSON mantendo a ordem e elimina sessões
vencidas, na mesma transação da mudança de política. A memória só muda após
sucesso. Uma consulta de existência evita escrita sem dados vencidos.
Snapshots e operações do núcleo fazem a limpeza; o servidor também executa
manutenção ao iniciar e a cada minuto, sem depender de novos hooks ou da UI.
O desligamento cancela essa tarefa junto com o serviço HTTP.
Mudar a duração das concluídas recarrega a lista limitada diretamente do banco,
sem exigir reinício e preservando o estado atual das vivas e seus subagentes.
Mancha não é substituída pelo silêncio; continua até novo evento.

scribe_report requer sessão conhecida e texto de até 140 caracteres.
scribe_ask valida 200/40 caracteres e duas a quatro opções, mas retorna
scribe_unavailable nesta fase: ainda não existe janela para responder.
PermissionRequest continua observador, com resposta vazia e fluxo normal no
terminal. Nenhum teste desta fase recebe crédito por aprovação humana.

## Alternativas e consequências

Implementar o MCP manualmente duplicaria negociação e ciclo de vida do
protocolo. Usar o SDK oficial reduz esse risco e mantém as ferramentas
restritas às duas previstas. O app Tauri e a criação/sincronização do token
continuam pendentes. A credencial de interface não protege contra controle
do processo ou depuração pelo mesmo usuário do sistema operacional.

## Fontes

[SDK Rust oficial](https://github.com/modelcontextprotocol/rust-sdk),
[rmcp 3.5.0](https://docs.rs/rmcp/3.5.0/rmcp/),
[axum 0.8.9](https://docs.rs/axum/0.8.9/axum/),
[rusqlite 0.40.2](https://docs.rs/rusqlite/0.40.2/rusqlite/),
[funções JSON do SQLite](https://www.sqlite.org/json1.html),
[comparação constante](https://docs.rs/subtle/latest/subtle/trait.ConstantTimeEq.html).
