# ADR 0001 — verificação do Claude Code

- Data: 2026-10-04, America/Sao_Paulo.
- Estado: Fase 0 aprovada na rodada 5, em 2026-10-04.
  Notas A9 · B8 · C8 · D8 · F8 · J8. Fase 1 autorizada pela catraca.
- Especificação: `prompt.md`, seções 0, 5.3, 6.3, 6.5 e 13.

## Contexto

A pasta inicial continha apenas a especificação e `scribe-conceito.html`. O CLI
real estava autenticado. A versão inicial foi 2.1.286; ao final da coleta o CLI
informava 2.1.289. Os payloads de MCP também identificam 2.1.289. Não se atribuem
resultados de uma versão a outra. Os testes usaram configurações por processo,
texto artificial público e o espelho de execução em `D:\RexIA\projetos\scribe`.

O humano autorizou acesso completo e testes com a assinatura existente, depois
solicitou modo `auto`. As duas conversas iniciais e a coleta de notificações
ocorreram em `manual` antes dessa instrução. Os próximos processos usam `auto`.
Nenhum instrumento devolveu `allow`, alterou permissões persistentes ou chamou
modelo por conta própria. O modelo foi chamado pelo Claude Code participante do
teste. O teste interativo foi encerrado pelo limite de 180 segundos, após duas
notificações reais; sua saída nula é uma interrupção, não sucesso do cenário.

## Fontes oficiais

Consultadas em 2026-10-04:

- [Referência de hooks](https://code.claude.com/docs/en/hooks): eventos, campos,
  exec form, autorização HTTP, falhas, respostas e limites de tipos por evento.
- [Manifesto do plug-in](https://code.claude.com/docs/en/plugins-reference):
  `userConfig`, caminhos, componentes, variáveis e validação estrita.
- [MCP no Claude Code](https://code.claude.com/docs/en/mcp): configuração HTTP,
  `timeout`, isolamento com `--strict-mcp-config` e servidores de plug-ins.
- [Skills](https://code.claude.com/docs/en/skills#available-string-substitutions):
  substituição do identificador da sessão no corpo da skill.
- [Marketplaces](https://code.claude.com/docs/en/plugin-marketplaces): localização
  dos manifestos e caminhos relativos à raiz do marketplace.
- [Modos de permissão](https://code.claude.com/docs/en/permission-modes): modo
  `auto` e opção do CLI para iniciar a sessão nesse modo.
- [Transporte MCP](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)
  e [ferramentas MCP](https://modelcontextprotocol.io/specification/2025-11-25/server/tools).

Os nomes dos onze eventos da seção 6.3 existem e foram recebidos do CLI real.
Não foram criados fixtures a partir dos exemplos da documentação.

## Evidência real

`app/src-tauri/tests/fixtures/hooks/` contém 46 capturas sanitizadas:

| Evento | Capturas |
| --- | ---: |
| SessionStart | 4 |
| UserPromptSubmit | 4 |
| PreToolUse | 12 |
| PostToolUse | 6 |
| PostToolUseFailure | 2 |
| PermissionRequest | 4 |
| Notification | 2 |
| SubagentStart | 2 |
| SubagentStop | 2 |
| Stop | 2 |
| SessionEnd | 6 |

Os números por evento são a referência verificável. Resultados completos e
caminhos de fixtures estão em `docs/evidence/`.
As conversas `1791144079584-e076566b` e `1791144222333-408dc3f2` cobrem leitura,
falha, subagente e escrita sem decisão pelo coletor. A execução interativa
`1791144266489-f0381fab` contém as duas notificações `permission_prompt`.

### Comparação do transporte

Medições exploratórias de uma execução por cenário, incluindo todo o processo
CLI. Não são p95 nem benchmarks do aplicativo final:

| Cenário | HTTP: ms / stderr | Comando Node: ms / stderr |
| --- | --- | --- |
| Sem hooks | 887 / vazio | 705 / vazio |
| Servidor saudável | 1257 / vazio | 1010 / vazio |
| Servidor fechado | 975 / erro ECONNREFUSED | 1118 / vazio |
| Servidor sem responder | 1870 / erro de cancelamento | 1496 / vazio |
| Resposta não JSON | 855 / erro de formato | 1348 / vazio |
| HTTP 503 | 720 / erro HTTP | 952 / vazio |

Fonte: `failure-1791143884454.json` e `failure-1791144006053.json`.
Todos esses processos encerraram com código zero. Os testes são de ciclo de
vida com `--init-only`, não de permissões interativas com o app de produção.
O cliente de teste ignora todas as respostas; seu silêncio diante de JSON inválido
não valida o parser de decisões futuro. Não se afirma FR-03 completo nem suporte
multiplataforma a partir destas medições.

A coleta complementar `docs/evidence/permissions-1791145859174.json` verificou
PermissionRequest real em modo auto com ask de Write somente no processo de
teste. Nos cinco cenários (saudável, fechado, travado, JSON inválido, HTTP 503),
houve evento autenticado no observador testemunha, código zero, stderr vazio e
destino de escrita inexistente. O CLI seguiu para a negação normal em modo `-p`.
Essa evidência confirma falha silenciosa em observação de permissões; não testa
clique, espera de 120 segundos nem fallback de uma decisão pendente da UI.

## Decisões e divergências

1. **HTTP exclusivo é inviável:** `SessionStart` aceita comando ou MCP, conforme
   a seção de tipos de hook; HTTP não é suportado nesse evento. A ausência inicial
   de `SessionStart` na coleta HTTP não era divergência da documentação: a leitura
   da referência estava incompleta. A coleta por comando confirmou o evento.
2. **Falha HTTP não é silenciosa nesta instalação:** o fluxo prossegue, mas escreve
   erros em stderr. O transporte por comando é o candidato compatível com FR-03.
   Recomendação de distribuição: cliente nativo Rust incluído no app, conforme ADR
   0002; o cliente Node é instrumento de teste. O humano autorizou essa escolha.
3. **FR-22:** a documentação oferece `updatedPermissions` e regras com destino
   de projeto. As capturas reais de Write sugeriram apenas mudança de modo da
   sessão, não regra persistente por projeto. Deixar “Sempre neste projeto” fora
   da v0.1 até teste específico comprovado. Não converter `setMode` em regra.
4. **FR-25 / MCP:** o manifesto temporário passou na validação estrita e o cliente
   realizou handshake HTTP, lista de ferramentas e duas chamadas autenticadas.
   A skill forneceu o ID correto da sessão nas duas chamadas, conforme ADR 0003.
   O servidor respondeu `answer: null, reason: timeout` intencionalmente; escolha
   humana e espera real de dez minutos pertencem à Fase 4.
5. **Cobertura de permissões:** pedidos de rede de comandos sandboxed podem não
   gerar `PermissionRequest`. A notificação sinaliza espera, mas não oferece o
   mesmo canal de decisão. Nesses casos, encaminhar ao terminal sem fingir resposta.
6. **Sem CORS:** a UI não deve depender de fetch cross-origin direto da webview.
   Avaliar na Fase 2 um intermediário Rust/IPC com capacidades Tauri restritas.
   Validar Origin e possuir bearer token não comprova que quem chamou é humano;
   processos maliciosos do mesmo usuário permanecem no modelo de ameaças.

## Limitações e catraca

- Quatorze testes automatizados passaram; o verificador de estrutura encontrou pelo
  menos duas capturas por evento. Ele não certifica sozinho a origem histórica.
- Na coleta inicial, o observador nativo Rust falhou por ausência de
  `link.exe`/MSVC. Essa falha permanece em native-build.json. Após a retomada,
  Microsoft Build Tools foi instalado e a compilação passou; ver ADR 0005.
- Não foram testados macOS, Linux, porta de produção ocupada, 120 segundos de
  decisão ou recuperação de permissões interativas do app fechado. Não extrapolar
  os testes de observação para uma implementação que espera decisões.
- O MCP usa `.mcp.json` explicitamente via `--mcp-config` para isolar servidores
  pessoais. Conexão automática do plug-in é teste de instalação da Fase 1.
- A primeira tentativa de MCP não carregou servidores porque a configuração
  estrita era vazia. A execução corrigida carrega explicitamente o arquivo validado.
- O humano confirmou repositório rexia-intel-automation/scribe e marketplace
  rexia-scribe. As consultas públicas GitHub/npm retornaram HTTP 404 em
  2026-10-04; não há registros públicos com esses nomes. Isso não constitui reserva.
- A rodada 1 reprovou segurança (C6) por redação incompleta de basenames. As
  regressões reproduziram dois erros antes da correção e passaram depois. Foram
  corrigidos basenames, emails, IDs, atribuições inline/valores entre aspas,
  metadados de ferramenta e rejeição de Origin presente com valor vazio. A nova
  revisão deve verificar essas correções sem alterar o relatório histórico.
- A rodada 2 também reprovou segurança (C6): basenames com underscore e JSON
  composto/escapado em command ainda vazavam. Quatro regressões falharam antes
  da correção. Comandos e basenames agora são omitidos integralmente; o teste do
  callback real intercepta a escrita em memória e confirma ausência dos marcadores.
  Os dez testes passaram depois. Foram sanitizados novamente 48 arquivos
  históricos sem mudar aliases/correlações ou acrescentar capturas sintéticas.
  A nova tentativa nativa confirmou link.exe ausente; native-build.json registra
  argumentos públicos e diagnóstico seguro. A rodada 3 deve verificar o conjunto.
- A rodada 3 confirmou as correções anteriores, mas reprovou segurança (C6):
  description com senhas contendo aspas escapadas ou espaços preserva fragmentos
  até a escrita. Dez testes passaram, sem cobrir essas equivalências. Notas finais:
  A9 · B8 · C6 · D8 · F7 · J8. Relatório: docs/reviews/fase-0-rodada-3.md.
  A seção 13.1 exige parar após três reprovações. Nenhuma nova correção ou fase
  foi iniciada. Proposta para retomada: permitir somente metadados definidos nas
  capturas públicas e omitir todo texto livre, seguida de nova revisão independente
  expressamente autorizada pelo humano, mantendo os mínimos da catraca.
- A Fase 0 só será declarada aprovada depois do relatório independente com as
  notas mínimas da seção 13.3 e resolução dos problemas críticos/altos.
- Em 2026-10-04, o humano autorizou retirar o teto de rodadas e retomar até
  finalizar, mantendo a catraca. Capturas agora retêm somente campos conhecidos,
  metadados enumerados e aliases. Todos os textos livres e nomes de campos
  desconhecidos são omitidos. Três testes falharam antes da mudança, incluindo
  a escrita real interceptada; a auditoria histórica reprocessou dez arquivos.
  O texto de description e saídas externas anteriores não integra mais os
  artefatos públicos. Os três relatórios antigos permanecem intactos.
  Treze testes passaram, incluindo auditoria histórica de aliases e proveniência.
- A rodada 4 confirmou que os ataques textuais foram contidos, mas reprovou
  segurança (C7) por tipos inesperados em enums, IDs e caminhos. Três regressões
  reproduziram isso antes da correção. A validação agora ocorre antes da recursão;
  números são retidos só para limit/duration_ms dentro de faixas explícitas e
  booleanos só em campos tipados. Quatorze testes passaram depois; o auditor
  também valida o tipo de calls.method. A auditoria histórica encontrou zero
  mudanças adicionais. A rodada 5 verifica o conjunto sem alterar o histórico.

## Consequências

A rodada 5 aprovou a verificação após 44 tentativas/verificações independentes,
incluindo 32 ataques de conteúdo. Relatório: docs/reviews/fase-0-rodada-5.md.
R1 baixo: marcadores de omissão em IDs/caminhos malformados podem virar aliases
numa segunda auditoria; não houve vazamento, e o inventário real é idempotente.
O achado fica registrado para correção com regressão de duas passagens.

A Fase 1 pode começar. O plug-in do teste MCP é temporário e existe somente no
espelho de execução. A v0.1 ainda não está pronta nem publicada.
