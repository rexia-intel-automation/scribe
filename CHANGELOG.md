# Changelog

Todas as alterações relevantes serão registradas aqui. Versionamento SemVer.

## [Não lançado]

### Adicionado

- Núcleo da Fase 2 em implementação: HTTP local autenticado, onze contratos,
  estados, SSE, MCP oficial e persistência SQLite de metadados higienizados.
  A revisão independente ainda não foi concluída; não é um app publicado.
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
