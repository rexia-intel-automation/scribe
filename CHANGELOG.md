# Changelog

Todas as alterações relevantes serão registradas aqui. Versionamento SemVer.

## [Não lançado]

### Adicionado

- Candidato de migração do MCP para stdio nativo: plugin `0.1.1` inicia o helper
  Rust sem servidor HTTP MCP. `initialize` e `tools/list` continuam disponíveis
  com o app fechado; `tools/call` informa indisponibilidade nesse estado e pode
  voltar a funcionar na mesma sessão depois de reabrir o app. O número do
  pacote app/helper continua `0.1.0`; compatibilidade é identificada pelo
  metadado `source_sha` e pela capacidade `attested-stdio-v1`. Este candidato
  ainda aguarda CI e ensaio externo; não é uma release publicada ou aceita.
- Paleta da gota nas configurações: terracota (padrão), azul, verde, vinho e
  ocre, persistida no perfil local e aplicada também à bandeja. A forma indica
  o estado; a cor permanece a escolhida pelo usuário. Ainda fora da beta.1.
- Sugestões documentadas de permissões do Claude: alcance e mudança visíveis,
  escolha explícita e confirmação vinculada antes de ecoar `updatedPermissions`.
  Sem escrita direta de regras pelo app; fora da beta.1 e com ensaio interativo
  ainda pendente.

- Respostas pela janela: permissões por hook nativo, perguntas pelo MCP,
  confirmação separada para ações de risco, decisões concorrentes e prazos.
  Prazo de permissões configurável de 1 a 120 segundos; perguntas até 10 minutos.
  Decisões encerradas ou de um processo anterior não podem ser reutilizadas.
  Aprovação, negação e pergunta verificadas com Claude Code real no Windows.

- Instalação local de desenvolvimento autorizada: app/cliente no perfil do
  usuário e plug-in configurado pelo CLI oficial, com conexão MCP privada.
  Não é release; aceite visual foi adiado para priorizar o fluxo de decisões.
- Núcleo da Fase 2 em implementação: HTTP local autenticado, onze contratos,
  estados, SSE, MCP oficial e persistência SQLite de metadados higienizados.
  Aprovado na quinta revisão independente; não é um app publicado.
- Aprovação da Fase 2: A9 B9 C9 D9 E8 F9 I8 J8; 22 testes oficiais,
  33 regressões, nove tentativas novas e CI em três plataformas passaram.
- Aprovação independente da Fase 0 na rodada 5; preparo nativo Windows verificado.
- Aprovação independente da Fase 1 na rodada 3; esqueleto instalável, dezoito
  testes Node, um Rust e CI verde em três plataformas com auditoria.
- Marketplace e plugin Scribe com onze hooks, MCP local, skill de contexto e
  comando; manifestos passaram na validação estrita.
- Cliente observador Rust com HTTP mantido, sem proxy/redirect; teste do
  executável de release para todos os eventos e falhas; instalação local pelo CLI.
- Instrumentação da Fase 0 para coletar hooks reais com autenticação e anonimização.
- Verificador que falha quando faltam duas capturas por evento obrigatório.
- Testes de redação e configuração; roteiro de coleta e falha segura.

### Segurança

- Configuração do candidato atualiza marketplace/plugin pela CLI oficial e
  confere a versão `0.1.1` habilitada no escopo do usuário antes de configurar.
  JSON inválido, plugin antigo ou versão de pasta divergente falham sem
  mensagem de sucesso e sem expor a saída da CLI.
- Projetos/caminhos com texto invisível recebem rótulo neutro; relatórios com
  apresentação ambígua são recusados. Alertas de risco incluem refspec Git
  forçado, limpeza forçada, `find -delete`, upload de arquivo pelo curl e
  `Remove-Item -Force`. Dependabot acompanha também os dois projetos npm.
- MCP stdio e hooks usam nonce novo por troca autenticada e mantêm desafio e
  requisição no mesmo socket. O token privado da conexão não vai para o
  `userConfig` do Claude Code. EOF e cancelamento encerram o fluxo stdio sem
  reutilizar uma resposta anterior. Regressões verificam replay, cancelamento e
  enquadramento JSON por linha UTF-8. Testes inspecionam os bytes do banco e dos
  arquivos auxiliares após limpar o histórico ou eliminar sessões vencidas.
- Abertura do app pelo cliente não mantém os canais do comando chamador:
  stdio separado e herança dos handles padrão removida no Windows. Regressão
  confirma aplicativo vivo, EOF de stdin e ausência de saída capturada.
- Correções da quarta revisão da Fase 2: caminhos junto a flags de compilador
  são encurtados; retenção elimina sessões e passos vencidos sem depender de
  novos hooks. Servidor ocioso limpa o banco a cada minuto. Política e limpeza
  são atômicas. Vinte e dois testes Rust passam; relatórios anteriores preservados.
- Correções da terceira revisão da Fase 2: Authorization e chaves sensíveis
  omitem o restante ambíguo, protegendo concatenação Bash, escapes PowerShell e
  flags de comandos. Caminhos colados a operadores são encurtados. Dezenove
  testes Rust passam; os três relatórios reprovados permanecem preservados.
- Correções da segunda revisão da Fase 2: atribuições omitem o restante ambíguo,
  incluindo valores dotenv com espaços e múltiplas linhas. Mudanças no prazo de
  concluídas recarregam o histórico sem reiniciar, preservando sessões vivas;
  falhas permanecem em Mancha até novo evento. Ambos os relatórios reprovados
  foram preservados; dezessete testes Rust passam antes da terceira rodada.
- Menções a arquivos `.env` omitem o texto completo: ensaio adicional do
  construtor reproduziu vazamento quando o comando codificava o sinal de igual.
  Regressões incluem codificação, construção por argumentos e variantes do nome.
- Correções da primeira revisão da Fase 2: cabeçalhos Authorization com chaves
  entre aspas, valores com escapes e nomes minúsculos de variáveis .env redigidos.
  Regressões verificam snapshot e SQLite; cobertura do núcleo >=85% exigida no CI.
- Reabertura prioriza sessões visíveis antes do limite de carga; eventos atualizam
  cwd/projeto sem apagar passos. Relatório reprovado da primeira rodada preservado.
- Auditoria cargo no CI e Dependabot para crates/actions; limpeza do teste de
  instalação prossegue e registra falhas mesmo quando o CLI de remoção falha.
- Timer do subprocesso é liberado também em falha de spawn, com regressão
  de executável ausente, saída e timeout. Porta padrão alinhada ao PRD: 7717.
- O coletor não produz decisões de permissão nem modifica configurações do usuário.
- Correções após revisão independente: redação em nomes de arquivo, variáveis
  inline, valores entre aspas e IDs; rejeição de Origin vazio.
- Comandos e basenames omitidos nas capturas públicas; regressões de credenciais
  embutidas e teste do caminho real de gravação. Evidência histórica reprocessada.
- Transporte por comando com cliente Rust incluído no instalador adotado; a
  validação nativa ainda depende do linker MSVC.
- Fase 0 interrompida após a terceira reprovação: fragmentos de credenciais em
  description ainda escapam. Correção e nova revisão aguardam diretriz humana.
- Retomada autorizada: política de campos e valores permitidos; texto livre e
  nomes de campos desconhecidos omitidos. Mantidos os mínimos de revisão,
  removido o teto de rodadas; relatórios anteriores preservados.
- Tipos de enums, IDs e caminhos validados antes da recursão; números e booleanos
  limitados a campos tipados de metadados. Regressões de callback e auditoria.
- Fase 3 em verificação: janela nativa Tauri, painel de sessões, modo recolhido,
  bandeja e atalho global; traduções pt-BR/en, temas e dez formas Canvas2D com
  movimento reduzido. Fontes OFL locais e catálogo de 24/40/96 px.
- Testes de interface, teclado e contraste; observação da janela Windows com
  inputs públicos no servidor isolado. Decisões humanas ainda pertencem à Fase 4.
- Correções da segunda revisão da Fase 3: falhas anunciadas na gota recolhida,
  recuperação por captura/atalho e dica de conexão após sessões restauradas.
  Tinta interna separada do texto geral mantém contraste dos glifos nos dois
  temas; 22 testes Vitest e seis Playwright passam. Revisão ainda pendente.
- Correções da terceira revisão da Fase 3: foco acompanha a troca painel/gota,
  formas sem olhos mantêm repouso após o prazo de piscada e npm audit bloqueia
  vulnerabilidades no CI. 28 Vitest e sete Playwright passaram; recheck dos
  11 casos adversariais da rodada 3 passou, sem alterar a reprovação histórica.
- Correção da quarta revisão da Fase 3: fechar Configurações após recolher e
  reabrir devolve o foco ao botão atual. 29 Vitest, sete Playwright e recheck
  R4 com 38/38 passaram; reprodução Chromium do defeito também passou.
- Correção da quinta revisão da Fase 3: abrir/cancelar a confirmação do
  histórico mantém foco no controle atual. 31 Vitest e oito Playwright passaram,
  incluindo três ciclos pelo teclado sem apagar dados. Aceites humanos pendentes.
- Correção da sexta revisão da Fase 3: limpeza/salvamento recuperam foco perdido
  após falha assíncrona, preservando navegação posterior e controles desmontados.
  Regressões falham no candidato anterior; 32 Vitest e dez Playwright passam.
- Correção da sétima revisão da Fase 3: salvamento de modal fechado não encerra
  o novo editor nem descarta seu rascunho. Regressões falham antes da correção;
  33 Vitest e onze Playwright passam. Cobertura Rust no CI passa a executar
  testes serialmente, mantendo os limites de latência e cobertura.
- Rodada 8 da Fase 3 não confirmou defeitos novos: H9 e demais áreas8;
  G9 ainda depende dos aceites visual/arraste. Release Windows atual recompilado
  e observado sem alertas/violações axe A/AA; a fase não foi aprovada.
- Preferências de histórico e limpeza são gravadas na mesma transação; falhas
  não aplicam só parte da política. Token fica no Rust; IPC e navegação ficam
  restritos ao conteúdo local. Link de ajuda abre somente a URL fixa no navegador.
