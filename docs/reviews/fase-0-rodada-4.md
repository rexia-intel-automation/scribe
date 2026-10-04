# Fase 0 — revisão adversarial, rodada 4

Data: 2026-10-04. Revisor independente, sem participação na implementação.
Estado: concluída. **Reprovada na catraca da Fase 0.**

## Escopo e método

Recebidos somente `prompt.md`, `scripts/verification/*`, `docs/adr/*`,
`docs/fase-0.md`, `docs/evidence/*`, fixtures de hooks, `CHANGELOG.md`,
`.gitignore` e os três relatórios históricos. Não há Git; o conjunto recebido
constitui o diff da fase. Somente este relatório foi escrito pelo revisor.
Nenhum modelo foi chamado, dependência instalada ou configuração do usuário
alterada pelo revisor. Os ataques não geraram fixtures públicas artificiais.

Testes e servidores executaram em `D:\RexIA\projetos\scribe`, Node 24.11.0.
A fonte pública examinada foi
`C:\Users\engmo\OneDrive\RexIA\RexIA\projetos\scribe`.
SHA-256 confirmou igualdade dos 14 arquivos de `scripts/verification/`
entre fonte e runtime. Inventário e auditoria apontaram explicitamente para a
fonte; as duas fixtures adicionais do D: não receberam crédito.

Os ataques HTTP executaram o callback original de `capture.mjs`, extraído
desde `const server = createServer` até antes do primeiro `await new Promise`
que inicia o servidor. Apenas `mkdir` e `writeFile` foram interceptados em
memória. Validação, anonimização, serialização e resposta são as originais.
As requisições finais usaram `node:http.request`, incluindo o ataque ao Host,
para controlar literalmente os headers. Um ensaio inicial com fetch foi
descartado porque não preservou o Host solicitado; não foi tratado como falha
do servidor. Os processos do observador usaram o arquivo original contra
servidores locais controlados, encerrados após os testes.

## Evidências conferidas

- `node --test scripts/verification/*.test.mjs`: 13 testes passaram,
  zero falhas, zero skips. Inclui callback original com escrita em memória,
  auditoria CLI em temporário e gate que rejeita capturas ausentes/malformadas.
- `check-fixtures.mjs <raiz-da-fonte>`: código zero; 46 fixtures válidas.
  Contagens na ordem dos eventos de `lib.mjs:3–7`:
  4/4/12/6/2/4/2/2/2/2/6. Todos os onze eventos têm pelo menos duas capturas.
- Inventário independente: 13 arquivos de evidência; 46 referências
  `captured[].file` únicas e 46 fixtures na fonte, sem referência ausente,
  duplicata ou fixture órfã. O D: contém 48 fixtures. Rastreabilidade não
  equivale a assinatura criptográfica da origem histórica.
- `audit-evidence.mjs <raiz-da-fonte>`:
  `{"rewrite":false,"changedFiles":0}`, sem reescrita.
  Este resultado demonstra idempotência do auditor, que compartilha o redator;
  não demonstra ausência de tipos que ambos preservam indevidamente.
- Assertivas independentes em `permissions-1791145859174.json`: cinco cenários
  reais, modo auto, regra temporária Write, código zero, stderr vazio, destino
  inexistente e uma PermissionRequest de Write testemunhada por cenário.
  O alvo recebeu uma chamada nos quatro cenários abertos e zero no fechado.
  Os stdout agora estão omitidos; não se pode reconferir a palavra DENIED
  diretamente no artefato sanitizado. A ausência de escrita e os flags permanecem.
- `mcp-1791144782320.json`: validação e execução com código zero; duas chamadas
  autenticadas, scribe_report e scribe_ask, com `sessionMatchesHook: true` e
  alias de sessão igual ao hook. O produtor carrega `.mcp.json` explicitamente
  com `--mcp-config` e retorna timeout deliberado imediatamente.
- `native-build.json` preserva comando público e diagnóstico seguro de
  `link.exe` ausente. Não há execução da matriz nativa nem prova funcional
  do cliente Rust. Nenhum novo crédito nativo foi atribuído.

## Tentativas deliberadas de quebra

Os nomes PRIVATE_* e o número 731947204681 são marcadores artificiais, sem
relação com credenciais reais. Nos 18 ataques HTTP finais foram verificadas
resposta vazia e ausência de Access-Control-Allow-Origin. Nove chamadas foram
entregues ao interceptador de escrita; requisições rejeitadas não escreveram.

| # | Ataque ou verificação | Resultado observado |
| --- | --- | --- |
| 1 | Description com JSON e aspa interna escapada na senha | HTTP 200; description integralmente omitida, sem fragmentos. |
| 2 | Description com senha entre aspas e espaços | HTTP 200; description integralmente omitida. |
| 3 | Nome de campo desconhecido PRIVATE_UNKNOWN_KEY | HTTP 200; chave e valor removidos. |
| 4 | Texto privado em `_meta.clientInfo` e `_meta.arguments` aninhados | HTTP 200; strings livres omitidas e chaves desconhecidas removidas. |
| 5 | Valores privados em source/reason/tool_name/agent_type | HTTP 200; strings fora dos enums omitidas. |
| 6 | Command com JSON composto e escapado | HTTP 200; comando integralmente omitido. |
| 7 | Caminho Windows com diretório e basename privados | HTTP 200; somente alias e nome omitido. |
| 8 | Password numérico, environment e description objeto | HTTP 200; número não preservado nesses campos sensíveis. |
| 9 | Origin presente e vazio | HTTP 403; zero escritas. |
| 10 | Origin de página externa | HTTP 403; zero escritas. |
| 11 | Host attacker.example, bearer correto | HTTP 403; zero escritas. |
| 12 | Bearer incorreto com mesmo comprimento | HTTP 403; zero escritas. |
| 13 | Authorization vazio | HTTP 403; zero escritas. |
| 14 | POST `/v1/decisions/one` | HTTP 404; nenhuma decisão ou escrita. |
| 15 | Rota PermissionRequest, evento Stop no corpo | HTTP 400; zero escritas. |
| 16 | JSON malformado | HTTP 400; zero escritas. |
| 17 | Corpo de 1.048.577 bytes | HTTP 413; zero escritas. |
| 18 | `_meta.clientInfo.name` numérico em tool_input | HTTP 200; 731947204681 chega intacto a writeFile. R1. |
| 19 | Observador contra servidor sem resposta | Código zero, stdout/stderr vazios, processo completo em 348 ms. |
| 20 | Observador contra resposta parcial que nunca termina | Código zero, stdout/stderr vazios, 360 ms. |
| 21 | Servidor devolve decisão com behavior allow | Corpo descartado; código zero, stdout/stderr vazios, 109 ms. |
| 22 | Servidor devolve JSON inválido | Corpo descartado; código zero, stdout/stderr vazios, 132 ms. |
| 23 | Observador contra porta fechada | Código zero, stdout/stderr vazios, 128 ms. |
| 24 | Anonymize recebe array ou objeto no campo enum name | `[731947204681]` e `{duration_ms:731947204681}` preservados. R1. |
| 25 | Anonymize recebe ID ou file_path numérico | Número preservado, sem alias nem omissão. R1. |
| 26 | Anonymize recebe número em is_interrupt/background_tasks | Número preservado sem validação do tipo esperado. R1. |
| 27 | Sanitizador histórico original recebe calls.method e params.name numéricos | Ambos preservados; stdout omitido, referências e aliases mantidos. R1. |
| 28 | Confrontar inventário fonte, referências e runtime extra | 46/46 únicos na fonte, sem órfãos; extras do runtime excluídos. |

Os tempos 19–23 incluem inicialização do Node. Não são p95, latência por hook
ou prova de desempenho do cliente Rust. Nenhum processo Claude foi iniciado
para repetir conversas históricas.

## Achados

### R1 — médio: valores de tipos inesperados contornam a política de campos permitidos

`lib.mjs:60–65` recorre em arrays/objetos e retorna qualquer valor não string
antes de consultar `PUBLIC_VALUES` em `:76`. Assim, a enumeração restringe
somente strings. `name`, que em `:39` tem três valores públicos exatos,
aceita um número arbitrário, um array de números ou um objeto com outra chave
permitida. O mesmo retorno antecede o tratamento de identificadores e caminhos
em `:66–74`. Números também passam em campos destinados a booleanos.

O callback original aceita o corpo abaixo e entrega a writeFile um JSON que
preserva o número artificial. Não é somente um resultado de função isolada:

```json
{
  "hook_event_name": "PermissionRequest",
  "session_id": "PRIVATE_SESSION",
  "cwd": "C:/PRIVATE_DIRECTORY",
  "tool_name": "Write",
  "tool_input": {"_meta": {"clientInfo": {"name": 731947204681}}}
}
```

Recorte efetivamente recebido pelo interceptador:

```json
{"tool_input":{"_meta":{"clientInfo":{"name":731947204681}}}}
```

A auditoria histórica tem a mesma classe de falha: `params` usa anonymize
(`audit-evidence.mjs:14`), mas `method` numérico retorna em `:20` antes da
validação de `:22`. O ensaio executou a função sanitize extraída literalmente
do arquivo original, sem reescrever os artefatos.

Classificação média: a prova exige uma entrada autenticada de tipo malformado;
não demonstra credencial real no histórico nem falha do caminho de decisão.
Ainda assim, contradiz a fronteira explícita de enums com valores exatos e
aliases de IDs/paths e conserva informação arbitrária no caminho público de
gravação. É um problema relevante na política recém-adotada, não um detalhe
cosmético. Não se afirma que toda metadata numérica legítima deva ser omitida.

Correção necessária: validar enums, IDs e paths antes da recursão; descartar ou
omitir tipos não admitidos. Preservar números/booleanos somente em campos de
metadata com tipos e limites definidos. Aplicar a regra também a calls.method
histórico, antes do retorno genérico. Não alterar metadados administrativos
autoria dos scripts nem perder aliases e referências de origem.

### R2 — médio: os testes da política verificam strings, mas não os tipos alternativos

`lib.test.mjs:102–108` só substitui strings de metadados por outra string.
`capture.test.mjs` cobre descriptions, commands e chaves desconhecidas, mas
não número/array/objeto em enum, ID/path numérico ou método MCP não string.
`audit.test.mjs` usa method válido. Os 13 testes passam com R1 reproduzível.

Adicionar regressões com assertivas independentes de ausência do número
artificial e de preservação somente dos metadados legítimos. Cobrir callback
original e auditoria CLI em temporário, preservando proveniência/aliases.
Fixtures sintéticas de teste não contam para as duas capturas reais por evento.

## Reprodução mínima do caminho de gravação

Executar no D: com Node, sem CLI ou modelo. O script abaixo não grava fixtures:

```js
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { anonymize, EVENTS, validProbeHeaders } from './scripts/verification/lib.mjs';
const src = await readFile('scripts/verification/capture.mjs', 'utf8');
const start = src.indexOf('const server = createServer');
const end = src.indexOf('\nawait new Promise((ok, fail) =>', start);
const writes = [];
const server = new Function('createServer', 'validProbeHeaders', 'token', 'EVENTS',
  'join', 'fixtureRoot', 'runId', 'mkdir', 'writeFile', 'anonymize', 'captured',
  'sequence', src.slice(start, end) + '\nreturn server;')(
  createServer, validProbeHeaders, 'REVIEW', EVENTS, join, 'memory-only',
  'round4-reproduction', async () => {}, async (path, body) => writes.push(body),
  anonymize, [], 0);
await new Promise(ok => server.listen(0, '127.0.0.1', ok));
try {
  const response = await fetch(
    `http://127.0.0.1:${server.address().port}/v1/hooks/PermissionRequest`, {
      method: 'POST', headers: { Authorization: 'Bearer REVIEW' },
      body: JSON.stringify({ hook_event_name: 'PermissionRequest',
        session_id: 'PRIVATE_SESSION', cwd: '/PRIVATE_DIRECTORY', tool_name: 'Write',
        tool_input: { _meta: { clientInfo: { name: 731947204681 } } } }),
    });
  assert.equal(response.status, 200);
  assert.equal(await response.text(), '');
  assert.equal(writes.length, 1);
  const actual = JSON.parse(writes[0]);
  assert.equal(actual.tool_input._meta.clientInfo.name, 731947204681);
  console.log(actual.tool_input);
} finally {
  server.closeAllConnections();
  await new Promise(ok => server.close(ok));
}
```

## Conformidade e limites

Fontes oficiais consultadas diretamente nesta rodada, em 2026-10-04:

- [Hooks](https://code.claude.com/docs/en/hooks): os onze eventos existem;
  SessionStart suporta comando/MCP, exec form usa args sem shell, headers HTTP
  admitem variáveis permitidas e updatedPermissions distingue destinos.
  O ADR 0001 registra corretamente o descarte de HTTP exclusivo.
- [Manifesto](https://code.claude.com/docs/en/plugins-reference): validação
  estrita, componentes e userConfig são mecanismos documentados.
- [Skills](https://code.claude.com/docs/en/skills#available-string-substitutions):
  CLAUDE_SESSION_ID é substituição documentada para correlação.
- [MCP](https://code.claude.com/docs/en/mcp#automatic-backgrounding-of-long-tool-calls):
  background automático de chamadas longas e controle de limiar constam da
  documentação; ADR 0003 não confunde timeout configurado com espera comprovada.

A política de omitir todo texto livre fecha os vazamentos textuais demonstrados
na rodada 3 e os de command/basename das rodadas anteriores. Omitir texto das
fixtures públicas é compatível com a Fase 0 e exige testes sintéticos próprios
para resumo/alvo no produto, como documentado.

A matriz de PermissionRequest comprova observação real e continuidade não
interativa sem escrita em auto; não comprova clique humano, fallback de decisão
pendente ao terminal interativo, espera de 120 s, cancelamento ou reinício.
O observador Node descarta inclusive allow; isso não valida um parser futuro.
O spike MCP comprova protocolo e correlação da sessão, sem escolha humana,
dez minutos de espera ou descoberta automática do plug-in instalado.
O Rust não recebe crédito de execução, robustez ou desempenho. Esses limites
estão nos ADRs; não foram tratados como entregas já prontas da Fase 0.

ADRs 0001/0004 registram a confirmação humana de nomes e consultas 404, sem
afirmar reserva ou publicação. Não foram repetidas consultas de disponibilidade
nem exigida criação de Git nesta revisão. A seção 13.1 atual autoriza corrigir
e revisar até aprovação mantendo mínimos; os relatórios anteriores representam
seus momentos históricos e permanecem intactos.

## Notas e veredito

Somente A/B/C/D/F/J se aplicam à Fase 0. E/G/H/I/K não avaliadas. Nenhuma nota
10. As notas não concedem crédito a app instalável ou v0.1 pronta.

| Área | Nota | Mínimo | Evidência e limite |
| --- | ---: | ---: | --- |
| A — Conformidade com Claude Code | 9 | 9 | Fontes oficiais conferidas; ADRs 0001–0003; 46 capturas dos onze eventos; MCP autenticado e correlacionado; divergências registradas. |
| B — Correção funcional | 8 | 8 | 46 referências únicas/46 fixtures; cinco cenários PermissionRequest reais; respostas aos FR-22, FR-25 e 6.5 nos ADRs. Produto/nativo sem crédito. |
| C — Segurança | 7 | 8 | Ataques textuais e HTTP contidos; tipo alternativo no ataque 18 conserva informação arbitrária até writeFile; `lib.mjs:60–76`, `audit-evidence.mjs:14–22`. R1 relevante. |
| D — Robustez e falha segura | 8 | 8 | Cinco processos Node originais silenciosos e menores que 1 s; matriz histórica real conferida. Limite restrito à observação; decisões e nativo pendentes. |
| F — Testes | 7 | 7 | 13 testes verdes, regressões textuais/callback/auditoria, 28 tentativas independentes; R2 identifica formas alternativas ausentes. |
| J — Documentação | 8 | 8 | Roteiro e ADRs delimitam protocolo, produção, fonte/runtime e versões; retomada humana e nomes registrados. A promessa de enums precisa da correção R1. |

**Veredito: REPROVADA. A 9 · B 8 · C 7 · D 8 · F 7 · J 8.**
Dois achados médios, nenhum crítico ou alto. Segurança não atinge o mínimo 8.
Ausência de achados altos não dispensa os mínimos de todas as áreas. A rodada
é válida pela seção 13: tentativas e evidências suficientes; não há notas todas
9/10 nem inflação para obter aprovação.

Não iniciar a Fase 1. Corrigir validação de tipos e regressões, revisar a
sanitização histórica sem fabricar capturas ou perder proveniência, então abrir
rodada 5 com outro revisor independente. A autorização humana atual permite
essa continuidade sem uma nova aprovação e sem reduzir a catraca.
