# Validação nativa isolada da beta.2 — 2026-10-18

Autor: Codex. Evidência técnica, sem aceite humano ou encerramento de fases.

Um build Windows de desenvolvimento do SHA
`7fca254205bff8f37aba050430127afdff77fc70`, com `desktop,test-fixture` e
`tauri/custom-protocol`, foi aberto em perfil, diretório de dados, porta,
credenciais sintéticas e identificador exclusivos. Não é binário distribuível.
Instalação, plugin, configuração e histórico reais foram preservados.

A janela foi inspecionada pela árvore de acessibilidade do Windows e operada
por teclado, sem capturas de tela. Foram conferidos:

- estado vazio e ajuda de integração imediata;
- recolher e expandir pela interface e pelo atalho exclusivo do ensaio;
- abrir Configurações, ler Sobre e fechar o diálogo por Escape;
- versão `0.1.0-beta.2` e revisão `7fca254205bf` na tela Sobre;
- três sessões sintéticas e seus marcos chegando pelo helper autenticado;
- pergunta MCP com duas opções, seleção de `Green` na janela, confirmação
  “Answer sent” e retorno de `Green` no cliente MCP em stdio.

O health autenticado apresentou a mesma versão e revisão. O cliente deste
ensaio era sintético: isso não comprova uma sessão interativa completa do
Claude Code, notificações do sistema, desempenho de clique/IPC ou aceite
humano. O processo isolado foi encerrado ao fim, antes da medição de referência.

A configuração posterior do número MSI não altera esse código de execução;
seu empacotamento e instalação são verificados separadamente no CI.
