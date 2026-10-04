# Fase 0 — revisão adversarial, rodada 1

Data: 2026-10-04. Revisor independente, sem participação na implementação.
Estado: concluída. **Reprovada na catraca da Fase 0.**

## Escopo e método

Foram recebidos `prompt.md`, todos os arquivos de `scripts/verification/`,
`docs/adr/`, `docs/fase-0.md`, `docs/evidence/`, fixtures de hooks, `CHANGELOG.md`
e `.gitignore`. Não havia Git; esses arquivos novos constituem o diff da fase.
Somente este relatório foi editado pelo revisor. Os testes executaram no espelho
`D:\RexIA\projetos\scribe`, com Node 24.11.0, sem chamar modelos, instalar
dependências ou alterar configurações do usuário. As matrizes `--init-only`
gravaram resultados temporários no D:, mediante aprovação automática do sandbox.

Os dez arquivos iniciais de instrumentação da fonte e do espelho tinham hashes
iguais antes dos ataques. O verificador de fixtures foi executado explicitamente
contra a fonte: o espelho tinha duas capturas adicionais de inicialização e não
foi tomado como inventário publicado.

O teste dos handlers HTTP extraiu literalmente o bloco de criação do servidor
de `capture.mjs:25` até antes de `const settingsFile`, fornecendo as dependências
originais, token artificial e funções de escrita em memória. Portanto exercitou
o callback real, sem duplicar sua validação, sem chamar o CLI e sem criar fixtures
sintéticas nos diretórios publicados. Os ataques ao observador lançaram o
`command-observer.mjs` original contra servidores HTTP locais controlados.

## Verificações executadas

- `node --test scripts/verification/lib.test.mjs scripts/verification/gate.test.mjs`:
  cinco testes passaram, zero falhas. Inclui rejeição de inventário incompleto
  e fixture malformada. Não certifica autenticidade histórica.
- `node scripts/verification/check-fixtures.mjs <raiz-da-fonte>`: 46 fixtures;
  contagens 4/4/12/6/2/4/2/2/2/2/6 na ordem dos onze eventos de `lib.mjs:3`.
- Auditoria por leitura de JSON: todas as 46 fixtures têm referência em
  `docs/evidence/*`; zero referências duplicadas, caminhos ausentes ou fixtures
  órfãs. A concordância é evidência de rastreabilidade, não assinatura de origem.
- `node scripts/verification/fail-safe.mjs command` e `... http`: todos os
  processos encerraram com código zero. Resultados temporários:
  `.verification/failure-1791145515270/result.json` (comando) e
  `.verification/failure-1791145520472/result.json` (HTTP), no D:.

| Cenário de ciclo de vida | Comando: ms / stderr | HTTP: ms / stderr |
| --- | --- | --- |
| Sem hooks | 550 / vazio | 558 / vazio |
| Saudável | 758 / vazio | 601 / vazio |
| Fechado | 755 / vazio | 573 / ECONNREFUSED |
| Travado | 1261 / vazio | 1573 / cancelamento |
| JSON inválido | 761 / vazio | 604 / erro de formato |
| HTTP 503 | 752 / vazio | 605 / erro HTTP |

Esses tempos incluem o processo inteiro e não são latência por hook ou p95.
Os cenários usam `--init-only` (`fail-safe.mjs:41`), não geram PermissionRequest
e não comprovam retorno ao terminal depois de uma decisão expirada.

### Evidência adicional recebida antes do fechamento

Foi revisado o novo `scripts/verification/permission-fail-safe.mjs` e conferido
`docs/evidence/permissions-1791145859174.json`. O nome foi confirmado no disco;
difere do nome inicialmente informado na mensagem do autor. Um script de
assertivas independente confirmou cinco cenários na ordem esperada, código zero,
stderr vazio, destino inexistente, uma PermissionRequest real testemunhada por
cenário com `permission_mode: auto`, e recepção no servidor testado nos quatro
cenários em que estava aberto; no fechado a recepção foi corretamente ausente.

| Cenário com PermissionRequest real | Processo completo, ms | Resultado |
| --- | ---: | --- |
| Saudável | 5824 | Negação normal, destino ausente |
| Fechado | 4265 | Negação normal, destino ausente |
| Travado | 5040 | Negação normal, destino ausente |
| JSON inválido | 6248 | Negação normal, destino ausente |
| HTTP 503 | 4589 | Negação normal, destino ausente |

O autor executou essas conversas; o revisor examinou código e resultado, sem
chamar modelos novamente. A regra `ask: ['Write']` está somente no JSON temporário
(`permission-fail-safe.mjs:45`). Os dois observadores são paralelos e nenhum
devolve decisão. O teste é real, porém **não interativo**, com `-p` (`:52`):
comprova continuidade até a negação esperada e ausência de escrita; não comprova
apresentação de prompt no terminal, clique humano, espera de 120 s, cancelamento
do cliente nativo ou recuperação de uma decisão já pendente no app.

## Tentativas deliberadas de quebra

Todos os valores com aparência de credencial abaixo são marcadores artificiais.

| # | Ataque / reprodução | Resultado observado |
| --- | --- | --- |
| 1 | POST de hook sem bearer, mantendo Host válido | HTTP 403, corpo vazio. Contido. |
| 2 | Bearer incorreto do mesmo tamanho | HTTP 403. Contido; comparação em `capture.mjs:30`. |
| 3 | Host `attacker.example`, token correto | HTTP 403. Contido. |
| 4 | Origin `https://attacker.example`, token correto | HTTP 403. Contido. |
| 5 | Header Origin presente com valor vazio | HTTP 200 e captura. Falha da promessa de rejeitar Origin em `docs/fase-0.md:33`. |
| 6 | POST `/v1/decisions/a` no coletor | HTTP 404. Não há rota de decisão exposta. |
| 7 | Evento desconhecido `/v1/hooks/Unknown` | HTTP 404. Contido. |
| 8 | Rota PermissionRequest com payload `hook_event_name: Stop` | HTTP 400. Contido. |
| 9 | JSON malformado `{` | HTTP 400. Contido. |
| 10 | Corpo de 1 MB + 1 byte | HTTP 413. Contido. |
| 11 | GET na rota de PermissionRequest | HTTP 404. Contido. |
| 12 | PermissionRequest válido no handler real | HTTP 200, corpo vazio; escrita em memória sem `behavior`. Não aprova. |
| 13 | Observador contra porta fechada | Código 0, stdout/stderr vazios, 94 ms. Contido. |
| 14 | Observador contra servidor que nunca responde | Código 0, saídas vazias, 346 ms incluindo startup. Contido. |
| 15 | Servidor envia bytes continuamente a cada 25 ms | Código 0, saídas vazias, 349 ms. Prazo absoluto funciona. |
| 16 | Servidor responde JSON inválido | Código 0, saídas vazias, 97 ms. Observador descarta resposta; não testa parser de decisões. |
| 17 | Servidor responde `hookSpecificOutput.decision.behavior: allow` | Código 0, stdout vazio, 90 ms. Nenhuma decisão foi encaminhada. |
| 18 | Servidor responde HTTP 503 | Código 0, saídas vazias, 91 ms. Contido. |
| 19 | HTTP 302 para `http://localhost:1/secret` | Código 0, saídas vazias, 92 ms. O observador não segue redirect. |
| 20 | `anonymize({tool_input:{file_path:'/tmp/sk-testprivate123.txt'}})` | Preserva `sk-testprivate123.txt` no caminho salvo. Falha de higienização. |
| 21 | `anonymize({cwd:'/home/person/person@example.com'})` | Preserva `person@example.com`. Falha de anonimização. |
| 22 | Caminho de arquivo terminado em UUID `.txt` | Preserva UUID, embora redação genérica o remova. Mesmo desvio de fluxo do item 20. |
| 23 | `anonymize({tool_input:{command:'env COMPANY_CREDENTIAL=synthetic-private node build.js'}})` | Preserva `synthetic-private`. A redação de atribuições arbitrárias só cobre início de linha. |
| 24 | Cruzar todas as fixtures publicadas com os manifests de execução | 46/46 referenciadas; nenhuma órfã. Tentativa não encontrou divergência de inventário. |
| 25 | Conferir matriz real de Write com regra ask temporária e alvo saudável/fechado/travado/JSON inválido/503 | Cinco cenários consistentes com negação normal; código 0, stderr vazio, destino ausente e PermissionRequest testemunhada. Evidência do autor verificada por assertivas independentes, sem repetir chamadas a modelo. |

Uma primeira sequência de ataques HTTP reutilizou a conexão após o corpo grande
e terminou com ECONNRESET ao enviar o pedido seguinte. O teste positivo e Origin
vazio foram repetidos com `agent: false`: ambos retornaram 200. O reset não foi
interpretado como aprovação de uma defesa nem como falha do produto final.

## Achados

### R1 — alto: caminhos escapam da higienização antes de chegar ao disco

`scripts/verification/lib.mjs:41–43` retorna o basename antes de executar
`redact` e a remoção de emails das linhas 45–47. Os ataques 20–22 demonstram o
desvio usando strings sintéticas. `capture.mjs:52–53` grava esse resultado em
fixtures destinadas ao repositório. Viola `prompt.md:415` e a afirmação de
anonimização em `docs/fase-0.md:46–48`. Não foi encontrada credencial real nos
artefatos; o risco demonstrado é a persistência literal de padrões reconhecidos
quando aparecem em nomes de arquivo ou de projeto.

Correção exigida: aplicar a higienização também ao basename ou substituí-lo por
alias; acrescentar regressões para credencial, email e identificador no caminho
e auditar novamente as evidências existentes antes de publicá-las.

### R2 — médio: atribuições de ambiente no meio de comandos continuam visíveis

O padrão de `lib.mjs:23` só remove `NOME=valor` no início de linha. O ataque 23
mostrou atribuição depois de `env` preservada. Não é necessário armazenar esse
conteúdo para provar o protocolo. A coleta futura de Bash, PowerShell ou ferramenta
MCP pode trazer argumentos sensíveis que a lista de campos omitidos não cobre.
Ampliar os casos de redação ou omitir os conteúdos livres da evidência da Fase 0;
não declarar proteção universal a partir dos testes de prefixos conhecidos.

### R3 — médio: evidência MCP publicada preserva IDs originais

`docs/evidence/mcp-1791144782320.json:80` e `:100` contêm valores originais de
`claudecode/toolUseId`, apesar do alias implementado atualmente em `lib.mjs:40`
e prometido em `docs/fase-0.md:46`. IDs não são credenciais, mas permitem
correlação com material original e contradizem o contrato de anonimização.
Reaplicar o procedimento às evidências antigas mantendo as correlações.

O espelho também continha UUIDs originais no basename `transcript_path` durante
a leitura inicial. Na inspeção posterior da fonte, esses nomes já eram
`transcript.jsonl`. Esta constatação não é atribuída como vazamento atual da
fixture publicada; registra a diferença entre inventários ao longo da revisão.

### R4 — baixo: Origin vazio é aceito

`capture.mjs:29` testa a veracidade do valor, não a presença do header. Ataques
5 e repetição isolada retornaram 200. O bearer continua obrigatório e não foi
demonstrado CSRF de navegador comum com Origin vazio; por isso o achado é baixo.
Ajustar a validação ou tornar a declaração de `docs/fase-0.md:33` precisa.

### R5 — médio: espera longa de MCP tem comportamento documentado ainda ausente do ADR

O spike devolve timeout imediatamente (`mcp-probe.mjs:53`) e seu `timeout`
de 610000 ms não demonstra espera síncrona de dez minutos. Na versão atual,
chamadas da conversa principal podem ir para background após dois minutos.
A [documentação oficial de MCP](https://code.claude.com/docs/en/mcp#automatic-backgrounding-of-long-tool-calls)
descreve o limiar, exceções e controles. Registrar o efeito no contrato do
FR-25 e a forma de acompanhar a resposta tardia; testar a espera real na Fase 4.
Isso não invalida o handshake ou a associação de sessão observados.

### R6 — baixo: versão do ambiente no roteiro está desatualizada

`docs/fase-0.md:10` informa CLI 2.1.286. `docs/adr/0001-verificacao.md:10–11`
e `docs/evidence/mcp-1791144782320.json:23` registram 2.1.289 ao final.
Identificar a versão histórica de cada execução e atualizar a orientação atual.

## Notas e evidências

As notas não se referem ao app de produção. E, G, H, I e K não são avaliadas
na Fase 0, conforme `prompt.md`, seção 13.3. Nenhuma nota 10 foi atribuída.

| Área | Nota | Mínimo | Evidência e limite |
| --- | ---: | ---: | --- |
| A — Conformidade com Claude Code | 9 | 9 | Tipos de hook, exec form, atualização de permissões e associação por skill conferidos na documentação oficial; ADR 0001:92–108, ADR 0003 e chamadas reais autenticadas no resultado MCP. O HTTP exclusivo foi corretamente rejeitado. |
| B — Correção funcional | 8 | 8 | 46 fixtures dos onze eventos rastreadas; manifesto/handshake/chamadas MCP reais e respostas aos FR-22/FR-25/6.5 registradas nos ADRs. Nova matriz permissions-1791145859174 confirma cinco pedidos reais em falhas. Scribe de produção não está implementado nem validado; nativo pendente. |
| C — Segurança | 6 | 8 | Ataques de Host/token/rota/corpo contidos, mas ataque 20 vaza padrão de chave antes da gravação em disco: `lib.mjs:41–43`, `capture.mjs:53`. R1 permanece alto. |
| D — Robustez e falha segura | 8 | 8 | Ataques 13–19 e matriz real permissions-1791145859174 mostram observador silencioso, limitado e sem decisões em falhas. A prova é do transporte por comando de observação; terminal interativo, resposta de decisão, espera de 120 s e executável nativo permanecem pendentes. |
| F — Testes | 7 | 7 | Cinco testes automatizados verdes, inventário 46/46 rastreável e ataques executados nesta rodada. As regressões de R1/R2 e integração do handler ainda faltam no conjunto versionado. |
| J — Documentação | 8 | 8 | ADRs distinguem observação de produção e deixam nativo/MCP automático/espera real pendentes; roteiro de coleta reproduzível. R3, R5 e R6 exigem precisão adicional. |

## Conferência das fontes oficiais

Consultadas diretamente nesta revisão, em 2026-10-04:

- [Hooks](https://code.claude.com/docs/en/hooks): SessionStart aceita comando/MCP,
  exec form com args dispensa shell; ausência de decisão preserva o fluxo normal.
  A seção PermissionRequest documenta sugestões, destinos e respostas.
- [MCP](https://code.claude.com/docs/en/mcp): transporte HTTP, `.mcp.json`, timeout
  por servidor e comportamento de chamadas longas.
- [Manifesto de plug-in](https://code.claude.com/docs/en/plugins-reference):
  validação estrita, configuração por usuário e substituição segura de opções.
- [Skills](https://code.claude.com/docs/en/skills#available-string-substitutions):
  `${CLAUDE_SESSION_ID}` é substituição documentada para correlação.

## Limites e veredito

O compilador nativo falhou por falta de `link.exe`, conforme
`docs/evidence/native-build.json`. O executável Rust não foi validado nem recebeu
nota por desempenho ou falha segura. O observador Node descarta todos os corpos;
nenhum teste dele prova o parser ou a espera de decisões do produto final.

**Veredito: REPROVADA.** Notas finais: A 9 · B 8 · C 6 · D 8 · F 7 · J 8.
A área C não atinge 8 e resta o achado alto R1. Os testes reais adicionais
fecharam a lacuna de observação de PermissionRequest em falhas, sem validar
decisões de produção. Foram encontrados um problema alto, três médios e dois
baixos; nenhum crítico. A rodada cumpre o mínimo de tentativas e evidências,
sem notas 10 ou aprovação baseada apenas na contagem de arquivos.

Não iniciar a Fase 1. Corrigir R1 e revisar as regressões/evidências; documentar
o tratamento de R2–R6. Solicitar rodada 2 com outro revisor de contexto limpo,
conforme `prompt.md`, seção 13.1. Não reduzir a nota mínima nem tratar o espelho
desatualizado como artefato de release.
