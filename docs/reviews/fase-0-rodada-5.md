# Fase 0 — revisão adversarial, rodada 5

Data: 2026-10-04. Revisor independente, sem participação na implementação.
Estado: concluída. **Aprovada na catraca da Fase 0, com um achado baixo.**

## Escopo e método

Recebidos somente `prompt.md`, `scripts/verification/*`, fixtures de hooks,
`docs/adr/*`, `docs/fase-0.md`, `docs/evidence/*`, `CHANGELOG.md`, `.gitignore`
e os quatro relatórios históricos. Não há Git; esses artefatos constituem o
conjunto da fase. Somente este relatório foi escrito na fonte pelo revisor.
As quatro revisões anteriores permanecem intactas.

Fonte examinada: `C:\Users\engmo\OneDrive\RexIA\RexIA\projetos\scribe`.
Testes e servidores executaram em `D:\RexIA\projetos\scribe`, Node 24.11.0.
A comparação SHA-256 confirmou igualdade dos 14 arquivos de instrumentação
entre fonte e runtime. Inventário e auditoria apontaram para a fonte; as duas
fixtures extras do D: não receberam crédito.

Nenhum modelo foi chamado, software instalado ou configuração do usuário
alterada pelo revisor. Não foram repetidas as conversas reais históricas.
Os ataques HTTP executaram o callback original de `capture.mjs`, extraído desde
`const server = createServer` até o primeiro `await new Promise` que inicia o
servidor. Apenas as dependências de filesystem foram interceptadas em memória.
Validação, anonimização, serialização e resposta são as originais. As chamadas
usaram `node:http.request`, permitindo controlar literalmente Host e Origin.

A auditoria CLI foi executada também em diretório temporário separado, contendo
somente dados artificiais. Esse diretório foi removido após verificar que estava
dentro da raiz temporária. Não foram publicadas fixtures sintéticas. Os ataques
ao observador lançaram o arquivo original como processo real contra servidores
locais controlados, encerrados ao final.

## Evidências conferidas

- `node --test scripts/verification/*.test.mjs`: 14 testes passaram, zero
  falhas, skips ou cancelamentos. Inclui callback original, auditoria CLI e gate
  de fixtures ausentes/malformadas. As regressões de tipos estão em
  `lib.test.mjs:110`, `capture.test.mjs:35` e `audit.test.mjs:25`.
- `node scripts/verification/check-fixtures.mjs <raiz-da-fonte>`: código zero;
  46 capturas válidas. Contagens 4/4/12/6/2/4/2/2/2/2/6 na ordem dos onze
  eventos de `lib.mjs:3`. Todos têm pelo menos duas capturas.
- Inventário independente: 13 JSONs de evidência, 46 referências
  `captured[].file` únicas e 46 fixtures na fonte. Nenhuma duplicata, referência
  ausente ou fixture órfã. Rastreabilidade não é assinatura criptográfica de origem.
- `node scripts/verification/audit-evidence.mjs <raiz-da-fonte>`:
  `{"rewrite":false,"changedFiles":0}`, código zero, sem reescrita. Esse
  resultado é específico do histórico existente; R1 demonstra um caso sintético
  no qual a reexecução não é idempotente. O auditor compartilha o redator e seu
  resultado isolado não certifica ausência de vazamentos desconhecidos.
- Assertivas independentes em `permissions-1791145859174.json`: cinco cenários
  na ordem saudável/fechado/travado/JSON inválido/HTTP 503; modo auto, ask Write
  temporário, código zero, stderr vazio e destino inexistente. Cada cenário tem
  uma PermissionRequest real de Write testemunhada. O alvo recebeu uma chamada
  nos quatro cenários abertos e nenhuma no fechado. Os stdout estão omitidos;
  a palavra DENIED não pode ser reconferida diretamente nesses artefatos.
- `mcp-1791144782320.json`: validação e execução com código zero; duas chamadas
  tools/call autenticadas, scribe_report e scribe_ask, com
  `sessionMatchesHook: true` e alias igual ao hook. O produtor carrega o arquivo
  explicitamente com `--mcp-config` e responde timeout deliberado imediatamente.
- `native-build.json`: código 1, diagnóstico seguro de linker MSVC ausente,
  `nativeFailureMatrixExecuted: false`. Nenhuma execução nativa/app recebeu
  crédito. A preparação independente de Build Tools não muda essa evidência.

## Tentativas deliberadas de quebra

PRIVATE_* e 864295731028 são marcadores artificiais. Foram 32 requisições ao
callback original: 20 respostas 200 com gravação interceptada e 12 rejeições
sem escrita. Todas tiveram corpo de resposta vazio; as 20 respostas aceitas
também tiveram assertiva explícita de ausência de Access-Control-Allow-Origin.
Nenhuma escrita continha PRIVATE_* ou o número artificial.

| # | Ataque ou verificação | Resultado observado |
| --- | --- | --- |
| 1 | `_meta.clientInfo.name` numérico | HTTP 200; valor omitido antes de writeFile. Fecha o vazamento da rodada 4. |
| 2 | Enum name com array de número/texto | HTTP 200; campo inteiro omitido. |
| 3 | Enum name com objeto `{duration_ms:25,name:"scribe_report"}` | HTTP 200; objeto inteiro omitido, inclusive metadata válida interna. |
| 4 | agent_id/tool_use_id numéricos | HTTP 200; valores omitidos. |
| 5 | agent_id em array e tool_use_id em objeto | HTTP 200; containers omitidos. |
| 6 | file_path/transcript_path numéricos | HTTP 200; valores omitidos. |
| 7 | file_path em array e scratchpad_dir em objeto | HTTP 200; containers omitidos. |
| 8 | Description com aspa interna e command com JSON escapado | HTTP 200; texto integralmente omitido. |
| 9 | text em objeto e question em array | HTTP 200; cada campo integralmente omitido. |
| 10 | Chaves PRIVATE_FIELD, __proto__ e constructor em JSON | HTTP 200; chaves removidas; sem poluição de estrutura publicada. |
| 11 | Chaves privadas aninhadas em _meta.clientInfo/arguments | HTTP 200; chaves removidas e texto desconhecido omitido. |
| 12 | Diretório/basename Windows privados | HTTP 200; alias de caminho e nome omitido. |
| 13 | password objeto, environment array, token número | HTTP 200; máscara/omissão integral. |
| 14 | Número em background_tasks/options/form/arguments/is_interrupt | HTTP 200; números omitidos, inclusive elementos de options. |
| 15 | Strings privadas em source/reason/tool_name/name | HTTP 200; valores fora dos enums omitidos. |
| 16 | Booleanos nos quatro campos declarados | HTTP 200; somente os valores legítimos testados permanecem. |
| 17 | limit=10000 e duration_ms=3600000 | HTTP 200; limites superiores admitidos preservados. |
| 18 | limit=10001 e duration_ms=3600001 | HTTP 200; ambos omitidos. |
| 19 | limit=-1 e duration_ms=0.5 | HTTP 200; ambos omitidos. |
| 20 | ID/path com formato de alias fornecido à captura nova | HTTP 200; recebe novo alias; não é preservado como histórico. |
| 21 | Origin presente com valor vazio | HTTP 403; zero escritas. |
| 22 | Origin externo | HTTP 403; zero escritas. |
| 23 | Host attacker.example com bearer correto | HTTP 403; zero escritas. |
| 24 | Bearer incorreto com mesmo comprimento | HTTP 403; zero escritas. |
| 25 | Authorization vazio | HTTP 403; zero escritas. |
| 26 | POST /v1/decisions/one | HTTP 404; zero escritas ou decisões. |
| 27 | Evento Stop no corpo, rota PermissionRequest | HTTP 400; zero escritas. |
| 28 | JSON malformado | HTTP 400; zero escritas. |
| 29 | Corpo de 1.048.577 bytes | HTTP 413; zero escritas. |
| 30 | Raiz JSON null | HTTP 400; zero escritas. |
| 31 | session_id numérico na raiz | HTTP 400; zero escritas. |
| 32 | /v1/hooks/../PermissionRequest | HTTP 404; zero escritas e nenhum caminho derivado dessa rota. |
| 33 | Anonymize: NaN, infinidades, inteiro inseguro, fração e negativo em campos numéricos | Todos omitidos; zero preservado em limit/duration_ms. |
| 34 | Anonymize: número/bool/null/array/objeto em enums, IDs e paths | Todos omitidos antes de recursão. |
| 35 | Alias histórico válido e transcript .jsonl | Alias preservado somente no modo histórico; categoria transcript.jsonl sem basename privado. |
| 36 | Auditor CLI: methods número/array/objeto; params aninhados; stdout objeto/stderr array | Valores privados omitidos; methods inteiros omitidos; referências, flags, tempos e aliases válidos preservados. |
| 37 | Segunda auditoria após reescrever IDs/paths inválidos em temporário | Ainda changedFiles=2: marcador de omissão vira alias. R1 baixo. Após segunda reescrita, changedFiles=0. |
| 38 | Observador contra porta fechada | Código 0, stdout/stderr vazios, 94 ms. |
| 39 | Observador contra servidor que nunca responde | Código 0, saídas vazias, 347 ms. |
| 40 | Observador contra resposta parcial sem fim | Código 0, saídas vazias, 369 ms. |
| 41 | Servidor devolve behavior allow | Corpo descartado; código 0, saídas vazias, 95 ms. |
| 42 | Servidor devolve JSON inválido | Corpo descartado; código 0, saídas vazias, 96 ms. |
| 43 | HTTP 302 para outro servidor local controlado | Código 0, saídas vazias, 97 ms; zero chamadas ao destino do redirect. |
| 44 | Comparar inventário público, referências e extras do runtime | 46/46 únicos na fonte; runtime 48; extras excluídos. |

Os tempos 38–43 incluem inicialização do Node, são amostras individuais e não
medem p95 ou latência do cliente Rust. As assertivas dos ataques 33–35 usaram
a implementação original, sem escrever dados. Nenhuma tentativa permitiu ação.

## Achado

### R1 — baixo: marcador de omissão recebe alias numa segunda sanitização histórica

`lib.mjs:65` e `:70` omitem IDs/paths não string. Na próxima execução o marcador
`[content omitted]` é string; ele não corresponde ao alias reconhecido em `:66`
ou `:71` e recebe hash em `:67` ou `:73`. O auditor aplica esse caminho às
fixtures, witnessEvents e params (`audit-evidence.mjs:11–17`).

Reprodução mínima, somente em memória, executável no runtime D:.

```js
import assert from 'node:assert/strict';
import { anonymize } from './scripts/verification/lib.mjs';
for (const key of ['agent_id', 'file_path']) {
  const first = anonymize(864295731028, key, true);
  const second = anonymize(first, key, true);
  assert.equal(first, '[content omitted]');
  assert.notEqual(second, first);
  console.log({ key, first, second });
}
```

Resultado efetivamente observado:

```json
{"key":"agent_id","first":"[content omitted]","second":"agent_id-8da9043bc26c"}
{"key":"file_path","first":"[content omitted]","second":"/anonymous/path-8da9043bc26c/[name omitted]"}
```

A CLI original reproduziu o efeito em dois JSONs temporários. A primeira
reescrita removeu todos os valores/chaves privados; a auditoria seguinte saiu
com código 1 e changedFiles=2. Depois da segunda reescrita, código 0 e zero
mudanças. O histórico publicado já está estável e não foi reescrito.

Classificação baixa: não conserva o número original, não expõe texto livre,
não altera referências de origem nem aliases válidos e não aprova permissões.
O problema é a reexecução desnecessária e a aparência de identificador/caminho
para um valor que nunca teve esse tipo. Não equivale ao vazamento da rodada 4.
Recomendação: manter o marcador de omissão em modo histórico e adicionar
regressão de duas passagens para ID/path inválido; a captura nova deve continuar
tratando strings recebidas como entrada, mesmo quando parecem aliases.

## Conformidade e limites

Fontes oficiais consultadas diretamente em 2026-10-04:

- [Hooks](https://code.claude.com/docs/en/hooks): os onze eventos existem;
  SessionStart aceita command/mcp_tool, sem HTTP. Exec form recebe args sem
  shell. Headers HTTP admitem variáveis autorizadas; updatedPermissions
  distingue destino de sessão e configurações persistentes. Os ADRs refletem
  essas diferenças. O instrumento hookSettings inclui HTTP para comparação,
  mas a recomendação adotada é comando.
- [Manifesto](https://code.claude.com/docs/en/plugins-reference): validação
  estrita, layout dos componentes e userConfig são documentados. A validação
  histórica não comprova instalação futura.
- [Skills](https://code.claude.com/docs/en/skills#available-string-substitutions):
  CLAUDE_SESSION_ID é substituição documentada; o spike comprovou correlação.
- [MCP](https://code.claude.com/docs/en/mcp#automatic-backgrounding-of-long-tool-calls):
  timeout por servidor e background de chamadas longas são documentados,
  incluindo controle de limiar e exceções não interativas. ADR 0003 exige os
  testes de espera/retomada na Fase 4 e não recebe crédito antecipado.

A política restritiva pública é adequada à verificação do protocolo. A ausência
de conteúdo de arquivos, perguntas e comandos exige testes sintéticos próprios
para resumo e alvo exato nas fases de produto; isso está documentado. Os campos
administrativos dos relatórios são produzidos pela instrumentação. Não se
confundem com os objetos/params dos hooks nem com stdout/stderr externos.

A matriz PermissionRequest comprova observação real e continuidade não
interativa sem escrita em auto. Não comprova clique humano, fallback de pedido
pendente ao terminal interativo, 120 segundos, cancelamento ou reinício.
O observador Node descarta todas as respostas, inclusive allow; não valida um
parser de decisões. O spike MCP não comprova escolha humana, dez minutos reais
ou descoberta automática do plug-in instalado.

Rust, app, macOS/Linux, UI, desempenho de produção e instalação não receberam
crédito. A prova nativa antiga continua falha. Não foram feitas consultas novas
de disponibilidade dos nomes nem assumida publicação a partir de HTTP 404.
Prompt 13.1 e ADR 0004 registram autorização humana para revisar até aprovação
sem teto e mantendo os mínimos. As instruções históricas de parada representam
seus momentos e não foram alteradas.

## Notas e veredito

Somente A/B/C/D/F/J se aplicam. E/G/H/I/K não avaliadas. Nenhuma nota 10.
As notas avaliam os entregáveis de verificação da Fase 0.

| Área | Nota | Mínimo | Evidência e limite |
| --- | ---: | ---: | --- |
| A — Conformidade com Claude Code | 9 | 9 | Fontes oficiais conferidas; ADRs 0001–0003; onze eventos reais e MCP autenticado/correlacionado; divergências de transporte documentadas. |
| B — Correção funcional | 8 | 8 | 46 capturas/46 referências; cinco cenários PermissionRequest reais; FR-22, FR-25 e 6.5 respondidos com limites explícitos. R1 baixo afeta somente reprocessamento malformado sintético. |
| C — Segurança | 8 | 8 | Ataques 1–32 contidos até writeFile original; enums/IDs/paths restringidos antes de recursão em lib.mjs:61–73; números/booleanos restritos em :81–83; auditor method corrigido em :16. Nenhum vazamento demonstrado nesta rodada. |
| D — Robustez e falha segura | 8 | 8 | Seis processos Node originais silenciosos, 94–369 ms; matriz real histórica conferida; allow descartado e redirect não seguido. R1 baixo de idempotência; decisões e nativo permanecem fora da prova. |
| F — Testes | 8 | 7 | 14 testes verdes com callback/auditoria/gate e regressões de tipos; 44 tentativas/verificações independentes. Falta regressão permanente de dupla passagem para R1; não se alega cobertura de produto. |
| J — Documentação | 8 | 8 | Prompt, quatro ADRs, roteiro e changelog registram retomada, transporte, proveniência e limites. Nenhuma promessa de nativo, espera real ou publicação pronta. |

**Veredito: APROVADA. A 9 · B 8 · C 8 · D 8 · F 8 · J 8.**
Um achado baixo; nenhum médio, alto ou crítico aberto demonstrado nesta rodada.
Todos os mínimos foram atingidos. A rodada cumpre o mínimo de cinco ataques,
apresenta reprodução/evidências e não incorre na regra contra inflação: as notas
não são todas 9/10. As falhas de segurança demonstradas nas rodadas anteriores
foram contidas nos caminhos de gravação e auditoria examinados.

A catraca permite preparar a Fase 1. R1 pode ser corrigido com mudança pequena
e regressão própria, sem reescrever a origem histórica. A aprovação não dispensa
os testes de instalação, cliente nativo, decisões e plataformas nas fases
correspondentes; a v0.1 continua sem app instalável ou publicação comprovada.
