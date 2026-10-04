# Fase 0 — revisão adversarial, rodada 2

Data: 2026-10-04. Novo revisor independente, sem participação na implementação.
Estado: concluída. **Reprovada na catraca da Fase 0.**

## Escopo e método

Recebidos somente `prompt.md`, `scripts/verification/*`, `docs/adr/*`,
`docs/fase-0.md`, `docs/evidence/*`, fixtures de hooks, `CHANGELOG.md`, `.gitignore`
e o relatório histórico da rodada 1. Não há Git; o conjunto novo constitui o diff.
Somente este relatório foi escrito pelo revisor. Nenhum modelo foi chamado,
software instalado ou configuração do usuário alterada nesta revisão.

Os testes executaram em `D:\RexIA\projetos\scribe`, Node 24.11.0. Comparação
SHA-256 confirmou igualdade dos doze arquivos de instrumentação da fonte e do
runtime antes dos ataques. Inventário e auditoria apontaram explicitamente para
a fonte no OneDrive, pois as capturas adicionais do runtime não estão publicadas.

Para testar o handler HTTP, foi extraído literalmente o bloco
`const server = createServer` de `capture.mjs:24` até antes do primeiro
`await new Promise` que inicia o servidor. A execução recebeu as dependências
originais, bearer artificial e `mkdir`/`writeFile` interceptados em memória.
Assim, a validação e o caminho de serialização originais foram exercitados sem
criar fixtures falsas, chamar o CLI ou modificar os artefatos recebidos.
O observador foi lançado como processo real contra servidores locais controlados.

## Verificações executadas

- `node --test scripts/verification/lib.test.mjs scripts/verification/gate.test.mjs`:
  oito testes passaram, zero falhas.
- `node scripts/verification/check-fixtures.mjs <raiz-da-fonte>`: 46 fixtures;
  contagens 4/4/12/6/2/4/2/2/2/2/6 na ordem dos eventos de `lib.mjs:3`.
- Comparação independente do inventário com `captured[].file` dos resultados:
  46 referências únicas, 46 arquivos, nenhuma duplicata, referência ausente ou
  fixture órfã. Isso prova rastreabilidade, não autenticidade criptográfica.
- `node scripts/verification/audit-evidence.mjs <raiz-da-fonte>`:
  `{"rewrite":false,"changedFiles":0}`. Resultado observado diretamente.
  A auditoria usa o mesmo redator; zero mudanças não prova ausência de vazamentos
  que esse redator desconhece.
- Assertivas independentes em `permissions-1791145859174.json`: cinco cenários
  na ordem esperada; `auto`, regra temporária Write, exitCode zero, stderr vazio,
  destino ausente, uma PermissionRequest de Write por cenário. O servidor alvo
  recebeu uma chamada nos quatro cenários abertos e zero no cenário fechado.
  Os cinco stdout contêm `DENIED`. As conversas não foram repetidas.
- Assertivas em `mcp-1791144782320.json`: validação e execução com código zero;
  duas chamadas autenticadas, `scribe_report` e `scribe_ask`, ambas com alias de
  sessão igual ao hook. O resultado deliberado de pergunta é timeout imediato.

## Tentativas deliberadas de quebra

Todos os valores com aparência de credencial são marcadores artificiais.

| # | Ataque / teste | Resultado observado |
| --- | --- | --- |
| 1 | Origin presente com valor vazio, bearer e Host corretos | HTTP 403, corpo vazio, sem CORS. Correção confirmada. |
| 2 | Origin de página atacante | HTTP 403. Contido. |
| 3 | Host `attacker.example`, bearer correto | HTTP 403. Contido. |
| 4 | Authorization ausente/vazio | HTTP 403. Contido. |
| 5 | Bearer incorreto do mesmo tamanho | HTTP 403. Contido. |
| 6 | POST `/v1/decisions/a` | HTTP 404. Nenhuma rota de decisão. |
| 7 | PermissionRequest na rota, `hook_event_name: Stop` no corpo | HTTP 400. Contido. |
| 8 | JSON malformado `{` | HTTP 400. Contido. |
| 9 | Corpo de 1.048.577 bytes | HTTP 413. Contido. |
| 10 | PermissionRequest válido | HTTP 200 com corpo vazio. Não gera decisão. |
| 11 | Basename `/tmp/sk-testprivate123.txt` | Mascarado. Regressão publicada confirmada. |
| 12 | Basename `/tmp/backup_sk-testprivate123.txt` | Preservado integralmente. HTTP 200 e conteúdo entregue a writeFile. R1. |
| 13 | Basename `/tmp/backup_ghp_testprivate123.txt` | Preservado integralmente por anonymize. R1. |
| 14 | Basename contendo email e UUID literal | Ambos omitidos. Correção confirmada. |
| 15 | `env COMPANY_CREDENTIAL="synthetic private value" node build.js` | Valor inteiro mascarado. Correção confirmada. |
| 16 | `echo {"token":"synthetic-private","password":"synthetic-private"}` | Valores mascarados. Regressão publicada confirmada. |
| 17 | `echo {"access_token":"synthetic-private","db_password":"synthetic-private"}` | Valores preservados. HTTP 200 e conteúdo entregue a writeFile. R2. |
| 18 | String de comando `echo "{\"token\":\"synthetic-private\"}"` | Valor preservado por anonymize. R2. |
| 19 | Observador contra servidor sem resposta | Código zero, stdout/stderr vazios, 361 ms no processo completo. |
| 20 | Observador contra resposta parcial que nunca termina | Código zero, stdout/stderr vazios, 347 ms. Prazo absoluto funciona. |
| 21 | Observador contra porta fechada | Código zero, stdout/stderr vazios, 99 ms. |
| 22 | Servidor devolve JSON com `behavior: allow` | Observador descarta corpo; código zero, stdout/stderr vazios, 97 ms. |
| 23 | Servidor devolve JSON inválido | Observador descarta corpo; código zero, stdout/stderr vazios, 96 ms. |

Os tempos dos ataques 19–23 incluem inicialização do Node. Não são p95, latência
por hook ou prova de desempenho do cliente Rust.

## Achados

### R1 — alto: padrão de chave vaza quando precedido por underscore

`lib.mjs:19` exige fronteira de palavra antes de `sk-` e `ghp_`. Underscore é
caractere de palavra, portanto nomes comuns como `backup_sk-...` escapam.
`lib.mjs:45` aplica o redator ao basename, mas o resultado permanece sensível.
`capture.mjs:49–50` serializa esse resultado em uma fixture pública.

Reprodução mínima com o módulo original:

```js
anonymize({ tool_input: { file_path: '/tmp/backup_sk-testprivate123.txt' } });
// { tool_input: { file_path:
//   '/anonymous/path-fe361003067f/backup_sk-testprivate123.txt' } }
anonymize({ tool_input: { file_path: '/tmp/backup_ghp_testprivate123.txt' } });
// O basename também permanece integralmente.
```

A prova do handler interceptou esta chamada da função original:

```json
{
  "path": "memory-only\\PermissionRequest\\synthetic-adversarial-2.json",
  "tool_input": {
    "file_path": "/anonymous/path-fe361003067f/backup_sk-testprivate123.txt"
  }
}
```

O trecho `tool_input` acima foi lido do JSON passado a writeFile, não montado
separadamente pelo teste. O servidor respondeu 200. Não foi gravado no disco
um fixture artificial. Não foram encontrados segredos reais desse tipo nos
artefatos publicados; o achado é o caminho demonstrado de vazamento futuro.

### R2 — alto: credenciais em JSON dentro de command escapam à redação

`lib.mjs:21` trata somente nomes exatos entre aspas, como `"token"`; o tratamento
de chave por substring em `lib.mjs:35` só funciona quando o JSON é um objeto
estruturado, não quando faz parte de uma string de comando. `access_token` e
`db_password` ficam intactos. A mesma limitação aparece com JSON escapado,
mesmo usando o nome exato `token`.

```js
anonymize({ tool_input: {
  command: 'echo {"access_token":"synthetic-private","db_password":"synthetic-private"}'
} });
// command permanece igual ao original.
anonymize({ tool_input: {
  command: 'echo "{\\"token\\":\\"synthetic-private\\"}"'
} });
// synthetic-private permanece na string.
```

O ataque 17 foi enviado no corpo de uma PermissionRequest válida. A chamada
interceptada a writeFile recebeu `tool_input.command` exatamente igual à primeira
string acima e o handler respondeu 200. Portanto a falha alcança a gravação,
e não apenas uma função isolada. Corrigir somente o exemplo exato do teste
`lib.test.mjs:39` deixa formatos equivalentes expostos.

### R3 — médio: regressões publicadas não cobrem equivalências nem integração

`lib.test.mjs:28–42` cobre a chave no começo do basename e JSON sem escape com
nomes exatos. Os oito testes passam enquanto R1 e R2 continuam reproduzíveis.
Não há teste versionado do callback de captura para verificar que um payload
sensível nunca chega à gravação. Adicionar os casos desta rodada e um teste do
handler real; não usar a própria função de redação como oráculo de segurança.
O teste de gate também valida somente presença/estrutura, como corretamente
explicado em `docs/fase-0.md:54–57`.

### R4 — baixo: sanitização remove diagnóstico útil da falha nativa

`docs/evidence/native-build.json:4` publica `--edition=••••`, e `:6` substitui
todo o erro por `[content omitted]`. O JSON confirma código 1 e matriz nativa
não executada, mas não permite reproduzir o comando literalmente nem conferir
diretamente a afirmação de ausência de `link.exe` em ADR 0001:129–130.
Preservar argumentos públicos conhecidos e uma classificação segura do erro,
sem restaurar caminhos ou saída privada. Esse problema de evidência não vira
crédito pela robustez de um executável que nunca foi testado.

## Prova reproduzível do caminho de gravação

Executar no runtime, com Node, sem CLI ou modelo. O trecho abaixo extrai o callback
original e intercepta somente o destino de escrita:

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
  'synthetic-adversarial', async () => {},
  async (path, body) => writes.push({ path, body }), anonymize, [], 0);
await new Promise(ok => server.listen(0, '127.0.0.1', ok));
const port = server.address().port;
try {
  for (const tool_input of [
    { file_path: '/tmp/backup_sk-testprivate123.txt' },
    { command: 'echo {"access_token":"synthetic-private","db_password":"synthetic-private"}' },
  ]) {
    const response = await fetch(`http://127.0.0.1:${port}/v1/hooks/PermissionRequest`, {
      method: 'POST', headers: { Authorization: 'Bearer TEST' },
      body: JSON.stringify({ hook_event_name: 'PermissionRequest',
        session_id: 'synthetic', cwd: '/test', tool_input }),
    });
    console.log(response.status);
    await response.text();
  }
  console.log(writes.map(w => JSON.parse(w.body).tool_input));
} finally {
  server.closeAllConnections();
  await new Promise(ok => server.close(ok));
}
```

Os dois resultados esperados nesta versão são 200 e os dois marcadores
permanecem nos objetos enviados à gravação.

## Conformidade, correções e limites

A documentação oficial foi consultada diretamente nesta rodada:

- [Hooks](https://code.claude.com/docs/en/hooks): SessionStart suporta comando/MCP;
  exec form usa args sem shell; headers HTTP admitem variáveis permitidas;
  updatedPermissions distingue sessão e destinos persistentes. O ADR 0001
  representa corretamente esses limites.
- [MCP](https://code.claude.com/docs/en/mcp#automatic-backgrounding-of-long-tool-calls):
  a chamada longa pode sair do primeiro plano após dois minutos. ADR 0003:31–42
  agora registra esse comportamento, a opção do usuário e os testes futuros.
- [Skills](https://code.claude.com/docs/en/skills#available-string-substitutions):
  a substituição de sessão usada no spike é documentada.
- [Manifesto](https://code.claude.com/docs/en/plugins-reference): validação estrita
  e configuração por usuário são mecanismos documentados.

Origin vazio, emails, UUIDs, atribuições inline com valores entre aspas e os
exemplos básicos de basename/JSON estão corrigidos. O histórico permanece
identificado; oito testes e versão atual do roteiro foram atualizados.
O novo tratamento do background MCP fecha o problema documental da rodada 1.

A matriz PermissionRequest comprova observação de pedido real e continuidade
não interativa até a negação em auto. Não comprova resposta humana, prompt de
retorno ao terminal interativo, 120 segundos, cancelamento da decisão pendente,
reinício do app ou parser de respostas do produto. O observador Node descarta
todas as respostas, incluindo allow. A robustez observada pertence a esse
instrumento de coleta, não ao cliente de decisões futuro.

O nativo permanece sem matriz executada e sem crédito funcional ou de robustez.
Instalação automática do MCP pelo plug-in, macOS/Linux, escolha humana e espera
real pertencem às fases indicadas nos ADRs. Não foram exigidos nesta revisão
como se já estivessem implementados.

Não há exigência na seção 6.3 de preservar o texto de command ou basenames
arbitrários nos fixtures públicos. Omiti-los mantendo campos, tipos, eventos
e aliases é uma correção válida para a coleta. A perda de conteúdo deve ser
documentada, e os testes de resumo/alvo devem usar entradas sintéticas marcadas.
O requisito futuro de mostrar o alvo exato da permissão continua sendo do app.

## Notas e veredito

As notas avaliam somente a Fase 0. E, G, H, I e K não se aplicam. Nenhuma nota 10.

| Área | Nota | Mínimo | Evidência e limite |
| --- | ---: | ---: | --- |
| A — Conformidade com Claude Code | 9 | 9 | Fontes oficiais conferidas; ADR 0001:98–120, ADR 0003:15–42, chamadas MCP autenticadas e correlacionadas. Transporte HTTP exclusivo corretamente descartado. |
| B — Correção funcional | 8 | 8 | 46 fixtures e 46 referências únicas, respostas aos FR-22/FR-25/6.5 nos ADRs; cinco cenários reais de PermissionRequest conferidos. Produto e cliente nativo não recebem crédito. |
| C — Segurança | 6 | 8 | Ataques 1–10 contidos, porém 12/13/17/18 deixam credenciais artificiais intactas. Handler real entrega marcadores à gravação, `lib.mjs:19–21,45`, `capture.mjs:49–50`. R1 e R2 altos. |
| D — Robustez e falha segura | 8 | 8 | Cinco cenários reais publicados, mais processos originais nos ataques 19–23 silenciosos e limitados. Prova restrita ao observador Node; decisões de produção, 120 s e nativo pendentes. |
| F — Testes | 7 | 7 | Oito testes verdes, inventário/proveniência e 23 ataques independentes. R3 identifica equivalências e integração ausentes do conjunto automatizado. |
| J — Documentação | 8 | 8 | Roteiro e ADRs distinguem observação de decisão; versão e background corrigidos. R4 limita a reprodução do diagnóstico nativo. |

**Veredito: REPROVADA.** Notas: A 9 · B 8 · C 6 · D 8 · F 7 · J 8.
Segurança não atinge 8 e restam dois achados altos, um médio e um baixo.
Não iniciar a Fase 1. Corrigir os caminhos de vazamento e as regressões, revisar
a evidência afetada e solicitar rodada 3 com outro revisor independente.
A seção 13.1 permite no máximo três rodadas; uma terceira reprovação exige
escalar ao humano, sem reduzir a catraca.
