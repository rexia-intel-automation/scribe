# Fase 0 — coleta e verificação

Este diretório ainda não contém um app instalável. `prompt.md` é a especificação;
`scribe-conceito.html` é uma referência recebida, ainda não aprovada para a Fase 3.

## Execução

O código-fonte fica no OneDrive. Os testes e o servidor local devem rodar no
espelho `D:\RexIA\projetos\scribe`, conforme o `CLAUDE.md` da raiz RexIA.
Node.js 24 e Claude Code 2.1.289 estão disponíveis nesta máquina. As primeiras
capturas usaram 2.1.286; cada resultado registra a versão histórica quando disponível.

```powershell
robocopy 'C:\Users\engmo\OneDrive\RexIA\RexIA\projetos\scribe\scripts' 'D:\RexIA\projetos\scribe\scripts' /E
Set-Location D:\RexIA\projetos\scribe
node --test scripts/verification/*.test.mjs
node scripts/verification/capture.mjs init --command
node scripts/verification/fail-safe.mjs
node scripts/verification/fail-safe.mjs command
node scripts/verification/permission-fail-safe.mjs
node scripts/verification/mcp-probe.mjs
node scripts/verification/check-fixtures.mjs
```

`init` usa `--init-only` e não inicia conversa com modelo. `turn` e `interactive`
iniciam conversas reais no Claude Code, autorizadas pelo humano nesta sessão.
O Scribe não chama modelos; o CLI é o participante do teste.
Não usar prompts com código privado, dados pessoais ou segredos. O limite de
orçamento do modo `turn` é US$ 0,50 por execução. `interactive` não aceita esse
limite do CLI; o coletor encerra seu processo filho após 180 segundos. O humano
solicitou modo `auto` para as próximas conversas. As capturas de permissão já
realizadas usaram modo `manual` antes dessa instrução e permanecem como evidência.

O coletor é um instrumento descartável da Fase 0 em Node, não uma mudança da
arquitetura Tauri/Rust da aplicação. Ele escuta em `127.0.0.1`, em porta aleatória,
exige token temporário, rejeita `Origin` e valida `Host`, rota, evento e tamanho.
Não tem rotas para decidir permissões e responde com corpo vazio. As configurações
passadas por `--settings` só valem para aquele processo. Não instalar o plug-in
nem alterar arquivos de configuração do usuário durante esta coleta.

## Evidência

As capturas sanitizadas são escritas diretamente em
`app/src-tauri/tests/fixtures/hooks/<evento>/`. Os resultados de execução ficam em
`.verification/<execução>/result.json` no D:. Copiar apenas fixtures sanitizadas e
resultados revisados para a fonte. Não copiar tokens ou configurações locais para
documentação pública. O token fica somente na memória e no ambiente dos filhos.

Identificadores e caminhos recebem aliases estáveis para preservar correlações.
Campos precisam constar da lista permitida; campos desconhecidos são removidos
porque seus nomes podem conter segredos. Strings de metadados precisam corresponder
a valores enumerados. Todo texto livre é omitido, incluindo description, comandos,
conversa, stdout/stderr não vazios e conteúdo de arquivos. O nome fixo
transcript.jsonl identifica somente a categoria do arquivo. A coleta continua
limitada a texto artificial público. Essas capturas não permitem
testar resumo ou alvo exato; testes sintéticos adicionais terão identificação própria.
Fixtures sintéticas nunca contam para a exigência de duas capturas reais por evento.

O teste de integração extrai o callback original de capture.mjs e intercepta a
gravação em memória. Verifica marcadores proibidos com assertivas independentes,
sem criar fixtures artificiais. A rodada 2 demonstrou falhas com underscore,
chaves JSON compostas e JSON escapado; quatro testes falharam antes da correção
e todos os dez passaram depois. A auditoria histórica foi repetida, preservando
aliases e referências de origem. Zero mudanças nessa auditoria é idempotência,
não uma certificação independente de ausência de segredos.

Após a rodada 3, o humano autorizou em 2026-10-04 substituir o teto de revisões
por correção e revisão até cumprir os mesmos mínimos. A instrumentação passou
a omitir todo texto livre, sem tentar reconhecer formatos de credenciais.
Três regressões falharam antes da mudança; os testes posteriores também cobrem
nomes de campos privados, valores falsos em campos de metadados e auditoria de
evidências históricas. Os campos administrativos dos relatórios (contagens,
flags, tempos, argumentos públicos de compilação e referências de origem)
são produzidos pela instrumentação; somente subárvores do protocolo e saídas
externas passam pela política restritiva. Isso preserva a rastreabilidade.

A rodada 4 identificou tipos inesperados contornando enums/aliases. A validação
passa a verificar tipos antes de percorrer containers. Números são preservados
somente em limit (0–10000) e duration_ms (0–3600000), inteiros seguros; booleanos
somente em is_interrupt, run_in_background, stop_hook_active e listChanged.
Valores de outros tipos em enums, IDs e caminhos são omitidos. Três regressões
falharam antes da correção e os quatorze testes passaram depois, incluindo
callback HTTP e auditoria histórica. Os testes numéricos são sintéticos.

O registro native-build.json contém argumentos públicos e a classificação segura
de uma nova tentativa de compilação. Para reproduzir no D: (ainda exige MSVC):

```powershell
rustc --edition 2021 -O scripts/verification/native-observer.rs -o .verification/native-observer.exe
```

`check-fixtures.mjs` encerra com código 1 enquanto qualquer evento tiver menos de
duas capturas. Passar o verificador comprova presença e estrutura mínima, não
autenticidade histórica: esta depende dos resultados de execução e da revisão.

## Roteiro interativo

1. Iniciar `node scripts/verification/capture.mjs interactive --command '<prompt com texto público>'` no D:.
2. Usar apenas o diretório de teste confiável. O CLI pode apresentar o diálogo
   de confiança antes dos hooks. A autenticação existente é reutilizada.
3. Usar somente texto artificial. Solicitar uma leitura bem-sucedida, uma leitura
   de arquivo inexistente e um subagente que retorne texto público.
4. Solicitar uma ação inofensiva que exija permissão; aguardar a notificação;
   responder no terminal. O coletor nunca aprova. O modo `auto` pode decidir antes
   de haver um pedido; não contar eventos que não ocorreram.
5. Encerrar a sessão normalmente com `/exit` para registrar `SessionEnd`.
6. A matriz `permission-fail-safe.mjs` já verificou cinco cenários reais em modo
   auto, com regra ask de Write apenas no processo de teste. Isso confirma a
   continuidade não interativa até a negação normal; não comprova clique humano
   nem retorno de um pedido pendente para o terminal interativo.

## Catraca

Nenhuma Fase 1 começa antes de: duas capturas reais de cada um dos onze eventos;
testes reais de falha segura para permissões; decisão de transporte sustentada por
evidência; confirmação de associação das ferramentas MCP à sessão; revisão
independente conforme a seção 13 do prompt. Nomes do repositório e marketplace
devem ser definidos pelo humano antes da Fase 1.
