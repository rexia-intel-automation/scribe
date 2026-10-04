# Fase 0 — revisão adversarial, rodada 3

Data: 2026-10-04. Terceiro revisor independente, sem participação na implementação.
Estado: concluída. **Reprovada. Parar e escalar ao humano.**

## Escopo e método

Recebidos `prompt.md`, `scripts/verification/*`, fixtures de hooks,
`docs/adr/*`, `docs/fase-0.md`, `docs/evidence/*`, `CHANGELOG.md`, `.gitignore`
e os relatórios históricos das rodadas 1 e 2. Não há Git; o conjunto novo
constitui o diff da Fase 0. Somente este relatório foi escrito pelo revisor.
Não foram chamados modelos, instalados programas, alteradas configurações do
usuário ou publicadas fixtures artificiais. Os relatórios anteriores permanecem
intactos.

Testes e servidores executaram em `D:\RexIA\projetos\scribe`, conforme a regra
da raiz RexIA. A fonte é
`C:\Users\engmo\OneDrive\RexIA\RexIA\projetos\scribe`. Comparação SHA-256
confirmou igualdade dos treze arquivos de `scripts/verification/` entre fonte
e runtime. Node observado: 24.11.0. Inventário e auditoria apontaram
explicitamente para a fonte; fixtures extras do D: não receberam crédito.

Os ataques HTTP executaram literalmente o callback de `capture.mjs:24–57`,
extraído até antes do primeiro `await new Promise` que inicia o servidor.
Somente `mkdir` e `writeFile` foram substituídos por interceptadores em memória.
`anonymize`, validação dos headers, montagem do nome, serialização e resposta
vieram do código original. O servidor escutou em loopback e foi encerrado ao
terminar. Os valores `SYNTHETIC_*` são exclusivamente marcadores artificiais.

## Evidências conferidas

- `node --test scripts/verification/lib.test.mjs scripts/verification/gate.test.mjs scripts/verification/capture.test.mjs`:
  dez testes passaram, zero falhas, zero skips.
- `check-fixtures.mjs <raiz-da-fonte>`: código zero; 46 fixtures válidas.
  Contagens na ordem de `lib.mjs:3–7`: 4/4/12/6/2/4/2/2/2/2/6.
- Inventário independente: 46 arquivos na fonte, 46 referências
  `captured[].file` únicas nos treze registros de evidência, nenhuma duplicata,
  referência ausente ou fixture órfã. Os aliases de sessão têm a forma esperada.
  O runtime tem 48 fixtures; as duas extras não compõem o conjunto publicado.
  Essa rastreabilidade não é autenticação criptográfica da origem histórica.
- `audit-evidence.mjs <raiz-da-fonte>` retornou
  `{"rewrite":false,"changedFiles":0}`. Não houve reescrita. O auditor usa o
  mesmo redator; este resultado mede idempotência e não detecta independentemente
  os vazamentos que esse redator desconhece.
- Assertivas independentes em `permissions-1791145859174.json`: cinco cenários
  na ordem saudável, fechado, travado, JSON inválido e HTTP 503; modo auto,
  regra temporária Write, código zero, stderr vazio, destino inexistente,
  uma PermissionRequest de Write por cenário e `DENIED` nos cinco stdout.
  O alvo recebeu uma chamada nos quatro cenários abertos e zero no fechado.
  Conferidos também o roteiro produtor e o observador; não foram repetidas
  conversas com modelo.
- `mcp-1791144782320.json`: validação e execução com código zero; duas chamadas
  de ferramenta autenticadas, `scribe_report` e `scribe_ask`, com o mesmo
  identificador do hook. O script carrega `.mcp.json` explicitamente por
  `--mcp-config`. A pergunta retorna timeout imediato deliberado.
- `native-build.json:5–12` agora preserva argumentos públicos, código 1,
  `msvc_linker_missing` e `linker link.exe not found`. A perda de diagnóstico
  apontada na rodada 2 foi corrigida. A matriz nativa continua não executada.
  Não foi repetida compilação cuja falha conhecida não altera este veredito.

## Tentativas deliberadas de quebra

Para os ataques HTTP, resposta sem corpo e ausência de CORS foram verificadas
com assertivas independentes. Os ataques rejeitados não chegaram à escrita.

| # | Entrada / ataque | Resultado observado |
| --- | --- | --- |
| 1 | Origin presente e vazio | HTTP 403, zero escritas. |
| 2 | Origin de página atacante | HTTP 403, zero escritas. |
| 3 | Host `attacker.example` | HTTP 403, zero escritas. |
| 4 | Bearer incorreto, mesmo comprimento | HTTP 403, zero escritas. |
| 5 | POST `/v1/decisions/a` | HTTP 404, zero escritas; nenhuma rota de decisão. |
| 6 | Rota PermissionRequest com evento Stop no corpo | HTTP 400, zero escritas. |
| 7 | JSON malformado `{` | HTTP 400, zero escritas. |
| 8 | Corpo de 1.048.577 bytes | HTTP 413, zero escritas. |
| 9 | Basename `backup_sk-SYNTHETIC_KEY123.txt` | HTTP 200; basename omitido. Correção confirmada. |
| 10 | Basename `backup_ghp_SYNTHETIC_KEY123.txt` | HTTP 200; basename omitido. Correção confirmada. |
| 11 | Nome arbitrário em caminho Windows | HTTP 200; nome omitido. |
| 12 | Command com chave JSON composta `db_password` | HTTP 200; command integralmente omitido. |
| 13 | Command com JSON escapado | HTTP 200; command integralmente omitido. |
| 14 | Command com texto privado arbitrário | HTTP 200; command integralmente omitido. |
| 15 | Description com prefixos sk-/ghp_ após underscore | HTTP 200; marcadores mascarados. |
| 16 | Description com atribuição inline e valor entre aspas com espaços | HTTP 200; valor inteiro mascarado. |
| 17 | Description com JSON composto simples | HTTP 200; valor inteiro mascarado. |
| 18 | Description com JSON e aspas escapadas dentro do valor da senha | HTTP 200; `SYNTHETIC_B` chegou à escrita. R1. |
| 19 | Description `password: "SYNTHETIC_C SYNTHETIC_D"` | HTTP 200; `SYNTHETIC_D` chegou à escrita. R1. |
| 20 | Description com email e UUID literal | HTTP 200; ambos omitidos. |
| 21 | Reaplicar anonimização a um alias de caminho | Mesmo alias e mesmo nome omitido; idempotência confirmada. |

Os ataques 9–20 produziram doze escritas interceptadas e doze registros de
captura em memória. Nenhum desses objetos virou fixture em disco.

## Achados

### R1 — alto: descrições ainda gravam fragmentos de credenciais reconhecíveis

Omitir `command` e basenames fecha os ataques específicos da rodada 2. Porém
`description` não pertence a `TEXT_FIELDS` (`lib.mjs:10–13`) e segue para
`redact` em `lib.mjs:50`. Description é campo documentado de ferramentas; também
existe nas capturas reais de Agent, por exemplo
`PreToolUse/1791144079584-e076566b-7.json:13`. Não é necessário inventar um campo
para alcançar o caminho de gravação.

Em `lib.mjs:18`, remover globalmente escapes de aspas antes da redação destrói
a distinção entre uma aspa interna do valor e seu delimitador. O padrão de
`lib.mjs:22` então para cedo. Para uma senha textual com chave sem aspas e valor
com espaços, o padrão de `lib.mjs:25` mascara somente até o primeiro espaço.
Ambas as formas conservam parte da senha.

Entradas e saídas observadas diretamente:

```js
redact('{"db_password":"SYNTHETIC_A\\"SYNTHETIC_B"}');
// '{"db_password":••••SYNTHETIC_B"}'
redact('password: "SYNTHETIC_C SYNTHETIC_D"');
// 'password: •••• SYNTHETIC_D"'
```

O callback real aceitou essas strings em `tool_input.description`, respondeu
200 sem corpo e entregou a `writeFile` os respectivos objetos:

```json
{"tool_input":{"description":"{\"db_password\":••••SYNTHETIC_B\"}"}}
{"tool_input":{"description":"password: •••• SYNTHETIC_D\""}}
```

São recortes do JSON efetivamente entregue ao interceptador, não resultados
montados pelo teste. A origem do arquivo continuava sendo
`memory-only/PermissionRequest/synthetic-round3-<ordinal>.json`.
`capture.mjs:49–50` publica exatamente esse objeto no fluxo real.

O teste demonstra um caminho de vazamento futuro; não prova que exista uma
senha real desse tipo nas 46 fixtures publicadas. A limitação documentada de
redação por padrões não torna segura a preservação parcial de um valor já
identificado como senha. O problema não exige detectar uma credencial arbitrária
sem formato: as chaves password/db_password estão explicitamente reconhecidas.

Correção necessária após decisão humana: omitir texto livre remanescente que
não seja necessário ao contrato de fixtures ou tratar os delimitadores sem
desescapar o valor antes da redação. Cobrir as duas formas no caminho original
de gravação e revisar evidência afetada. Uma aprovação desta rodada seria
incompatível com a exigência de ausência de achados altos.

### R2 — médio: regressões não cobrem valores escapados nem descrições

`capture.test.mjs:25–32` cobre somente file_path e command. O teste de
`lib.test.mjs:53` cobre escapes nas aspas das chaves, mas não uma aspa escapada
dentro do valor. Assim, todos os dez testes passam enquanto os ataques 18 e 19
gravam os marcadores. O novo teste de integração é válido e fecha a lacuna
metodológica anterior; falta estender seus casos a campos textuais preservados
e a delimitadores internos do segredo. Não usar o próprio redator como oráculo.

## Prova reproduzível da gravação

Executar em `D:\RexIA\projetos\scribe`, sem CLI ou modelo:

```js
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { anonymize, EVENTS, validProbeHeaders } from './scripts/verification/lib.mjs';
const src = await readFile('scripts/verification/capture.mjs', 'utf8');
const block = src.slice(src.indexOf('const server = createServer'),
  src.indexOf('\nawait new Promise((ok, fail) =>'));
const writes = [];
const server = new Function('createServer', 'validProbeHeaders', 'token', 'EVENTS',
  'join', 'fixtureRoot', 'runId', 'mkdir', 'writeFile', 'anonymize', 'captured',
  'sequence', block + '\nreturn server;')(
  createServer, validProbeHeaders, 'TEST', EVENTS, join, 'memory-only',
  'synthetic-round3', async () => {},
  async (path, body) => writes.push({ path, body }), anonymize, [], 0);
await new Promise(ok => server.listen(0, '127.0.0.1', ok));
try {
  for (const description of [
    '{"db_password":"SYNTHETIC_A\\"SYNTHETIC_B"}',
    'password: "SYNTHETIC_C SYNTHETIC_D"',
  ]) {
    const response = await fetch(
      `http://127.0.0.1:${server.address().port}/v1/hooks/PermissionRequest`, {
        method: 'POST', headers: { Authorization: 'Bearer TEST' },
        body: JSON.stringify({ hook_event_name: 'PermissionRequest',
          session_id: 'synthetic-session', cwd: '/test', tool_name: 'Bash',
          tool_input: { description } }),
      });
    console.log(response.status, await response.text());
  }
  console.log(writes.map(w => JSON.parse(w.body).tool_input));
} finally {
  server.closeAllConnections();
  await new Promise(ok => server.close(ok));
}
```

Resultado desta versão: duas respostas 200 e os fragmentos `SYNTHETIC_B` e
`SYNTHETIC_D` preservados nos objetos entregues à gravação.

## Conformidade e limites

Fontes oficiais consultadas diretamente em 2026-10-04:

- [Hooks](https://code.claude.com/docs/en/hooks): os onze eventos existem;
  SessionStart aceita comando/MCP; exec form passa args sem shell; headers HTTP
  permitem variáveis autorizadas. Sugestões e destinos persistentes são distintos.
  Description é entrada documentada. ADR 0001 representa esses limites.
- [MCP](https://code.claude.com/docs/en/mcp#automatic-backgrounding-of-long-tool-calls):
  chamadas longas podem ir ao background após dois minutos; ADR 0003 registra
  limiar, controle opcional do usuário e testes futuros.
- [Skills](https://code.claude.com/docs/en/skills#available-string-substitutions):
  a substituição de sessão usada no spike é documentada.
- [Manifesto](https://code.claude.com/docs/en/plugins-reference): configuração
  por usuário e validação do manifesto são mecanismos documentados.

Os achados específicos R1/R2 da rodada 2 foram corrigidos para basenames e
command; Origin vazio, prefixos embutidos, emails e UUIDs também foram contidos.
O diagnóstico público nativo e a documentação de background MCP estão adequados.
As notas não concedem crédito a um app pronto, ao cliente nativo, à instalação
automática do MCP, à escolha humana ou à espera de dez minutos.

A matriz real de permissões comprova continuidade não interativa até negação
em auto. Não comprova clique, retorno ao terminal interativo de um pedido
pendente, 120 segundos, cancelamento, reinício ou parser de decisões de produção.
O observador Node descarta todos os corpos; seus resultados não validam o
cliente Rust futuro. ADR 0002 está adotado pelo humano, com compilação e testes
multiplataforma pendentes. Não foram exigidos como entregas já prontas da Fase 0.

## Notas e veredito

Notas somente da Fase 0. E/G/H/I/K não se aplicam. Nenhuma nota 10.

| Área | Nota | Mínimo | Evidência e limite |
| --- | ---: | ---: | --- |
| A — Conformidade com Claude Code | 9 | 9 | Fontes oficiais conferidas; ADRs 0001/0003; chamadas MCP reais autenticadas e correlacionadas. Divergências de HTTP exclusivo e background registradas. |
| B — Correção funcional | 8 | 8 | 46 fixtures e referências únicas; cinco cenários PermissionRequest e duas chamadas MCP conferidos; FR-22/FR-25/6.5 tratados nos ADRs. Nenhum crédito de produto pronto. |
| C — Segurança | 6 | 8 | Ataques 1–17 e 20 contidos; 18/19 preservam fragmentos de senha até writeFile, lib.mjs:18/22/25/50 e capture.mjs:49–50. R1 alto. |
| D — Robustez e falha segura | 8 | 8 | Matriz real auto conferida, código zero/stderr vazio/sem destino; command-observer.mjs limita espera HTTP e descarta decisões. Limites do Node e nativo explicitados; não é FR-03 completo. |
| F — Testes | 7 | 7 | Dez testes verdes, inventário/proveniência e 21 tentativas independentes. R2 mostra valores escapados e descriptions sem regressão automatizada. |
| J — Documentação | 8 | 8 | Roteiro, ADRs, changelog e diagnóstico seguro distinguem observação de produção; fonte/runtime e limitações de evidência explícitos. |

**Veredito: REPROVADA. A 9 · B 8 · C 6 · D 8 · F 7 · J 8.**
Um achado alto e um médio. Segurança abaixo de 8. A rodada cumpre as tentativas
mínimas e a exigência de evidência; não incorre na regra contra inflação porque
as notas não são todas 9/10.

Esta é a terceira reprovação. Conforme `prompt.md`, seção 13.1, item 6,
**parar e escalar ao humano**. Não iniciar a Fase 1 nem abrir uma quarta rodada
automaticamente. O resumo da escalada é: vazamentos anteriores de command e
basename foram fechados, mas descriptions com valores de senha escapados ou
com espaços ainda chegam parcialmente intactas à gravação; os dez testes não
cobrem essas equivalências. Preservar as três revisões e solicitar a decisão
humana sobre a retomada, sem reduzir a catraca.
