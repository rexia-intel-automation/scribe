# Fase 2 — revisão adversarial independente, rodada 2

Data da revisão: 2026-10-05. Commit congelado:
`528ed6d7bbc28abe54dcd3baf58454b105f79477`.
Diff: `main..528ed6d7bbc28abe54dcd3baf58454b105f79477`.
PR: [#4](https://github.com/rexia-intel-automation/scribe/pull/4).

**Veredito: REPROVADA.** As cinco reproduções da rodada 1 foram corrigidas,
mas esta rodada encontrou um problema alto de higienização e dois médios
de estado. B, C, D e F ficam abaixo da catraca. Os dois runs de CI do commit
congelado estão verdes, inclusive a nova exigência de cobertura Linux.

## Escopo, independência e integridade

Revisor novo, sem participação em implementação ou revisões anteriores.
`prompt.md` foi lido integralmente. Foram examinados o diff congelado,
os testes, o relatório anterior e os artefatos versionados da Fase 2.
Escopo: API sem decisões, onze hooks/estado, SQLite, higienização e desempenho
do servidor. G, H e K não são avaliadas. Janela, decisões humanas e release
futuros não recebem crédito nem são cobrados nesta fase. Resposta vazia de
PermissionRequest e pergunta indisponível permanecem adequadas a esta etapa.

Builds e testes ocorreram somente em `D:\RexIA\projetos\scribe`, com
`C:\Program Files\PowerShell\7\pwsh.exe` e
`C:\Users\engmo\.cargo\bin\cargo.exe`. SHA-256 do Cargo.toml, lockfile,
sete arquivos Rust da biblioteca e `tests/core.rs` coincidiram entre fonte
e espelho; o diff desses arquivos contra o commit congelado estava vazio.
Nenhum arquivo de implementação foi modificado. Na fonte, somente este
relatório foi criado; a rodada anterior foi preservada.

## Verificação dos testes e do CI

- `cargo test --manifest-path app/src-tauri/Cargo.toml --locked -- --nocapture`:
  **1 unidade e 13 integrações passaram**, sem testes ignorados.
  `SCRIBE_TEST_FIXTURES_ROOT` apontou para
  `C:/Users/engmo/OneDrive/RexIA/RexIA/projetos/scribe/app/src-tauri/tests/fixtures/hooks`.
  O teste `rejected_inputs_do_not_change_state_and_public_real_fixtures_have_contracts`
  exige exatamente **46 fixtures públicos**; extras históricos em D: não entraram.
- `cargo fmt --manifest-path app/src-tauri/Cargo.toml --check`: passou.
- `cargo clippy --manifest-path app/src-tauri/Cargo.toml --locked --all-targets -- -D warnings`:
  passou.
- `cargo audit --file app/src-tauri/Cargo.lock --deny warnings`: passou,
  128 dependências, sem avisos reportados.
- O teste versionado do helper release real passou, com recebimento pelo
  servidor e stdout/stderr vazios. SSE, MCP, ACL, corpo excessivo/incompleto,
  taxa, concorrência, SQLite ocupado/recuperado e encerramento passaram.
- [Run push 37257159899](https://github.com/rexia-intel-automation/scribe/actions/runs/37257159899)
  e [run PR 37257162518](https://github.com/rexia-intel-automation/scribe/actions/runs/37257162518):
  consultados com `gh run view --json status,conclusion,headSha,url,jobs`;
  ambos **completed/success**, SHA igual ao congelado. Auditoria e jobs de
  Windows, macOS e Ubuntu terminaram com sucesso. Os logs Linux mostram
  cargo-llvm-cov 0.9.1, `--test core`, exclusão de `/tests/` e
  `--fail-under-lines 85`; **714/761 linhas de produção, 93,82%**, nos dois runs.

p95 local de evento HTTP até estado persistido: **24 ms, 32 amostras**.
Logs do push: Ubuntu 2 ms, macOS 1 ms, Windows 158 ms; do PR: 3, 2 e 146 ms.
O limite do servidor de 200 ms passou. São ensaios pequenos e não medem
evento até janela, latência de decisão, CPU/memória do app nem FPS.

Os JSONs dos dois runs e trechos dos logs estão no diretório de harness
abaixo: `ci-<run>.json` e `ci-<run>-metrics.log`.

## Correções da rodada 1

Os nove testes do harness anterior foram copiados, sem alteração, para
`tests/round1.rs` do harness próprio e executados contra a biblioteca real:
**9 passaram, 0 falharam**. Saída: `round1-regressions.log`.

| Achado anterior | Resultado nesta rodada |
| --- | --- |
| P2-01, Authorization delimitado | JSON e hashtable PowerShell redigidos; marcadores ausentes do estado e SQLite |
| P2-02, aspa escapada | A cauda antes vazada não aparece no relato nem no hook |
| P2-03, nome minúsculo em .env | A reprodução antiga com valor sem espaços está redigida |
| P2-04, 256 concluídas escondendo sessão viva | A sessão viva permanece após reinício; filtro precede limite em `store.rs:35` |
| P2-05, cwd de retomada | `new-project` aparece; `lib.rs:134` atualiza cwd e as regressões versionadas preservam passos |

Esses achados estão encerrados para as reproduções originais. O novo caso
de .env abaixo demonstra uma lacuna diferente; não invalida o resultado
positivo da reprodução antiga.

## Tentativas deliberadas adicionais

Harness: `D:\RexIA\projetos\scribe\.artifacts\review-phase2-2`.
Fonte: `src/lib.rs`; saída integral: `results.log`; manifesto e lockfile
no mesmo diretório. Dependência de caminho chama a biblioteca de produção,
sem copiar módulos ou modificar implementação. Todos os nomes/versões do
lockfile original estão no lockfile do harness; a única adição é o pacote
do próprio harness. Usaram-se somente marcadores sintéticos públicos.

Reprodução sob PowerShell 7, no espelho:

```powershell
& 'C:/Users/engmo/.cargo/bin/cargo.exe' test `
  --manifest-path .artifacts/review-phase2-2/Cargo.toml `
  --offline --locked --lib -- --nocapture
& 'C:/Users/engmo/.cargo/bin/cargo.exe' test `
  --manifest-path .artifacts/review-phase2-2/Cargo.toml `
  --offline --locked --test round1 -- --nocapture
```

Novas tentativas: **8 testes, 5 passaram e 3 falharam**. Para reprodução
individual, acrescentar o nome do teste antes de `--`. As falhas são
asserções do comportamento esperado, não erros de ambiente ou compilação.

| Teste / linha no harness | Resultado observado |
| --- | --- |
| `powershell_backtick_quoted_token_tail_is_redacted`, 27 | Bloqueado em hook PowerShell e relato; o escape de aspa com crase não expôs o marcador |
| `dotenv_unquoted_spaces_are_redacted`, 34 | Quebrou em hook Bash e relato: `PUBLIC_ENV_TAIL` permanece em ação, passos e bytes SQLite |
| `quoted_authorization_escaped_and_concatenated_values_are_redacted`, 41 | Bloqueados Authorization JSON, escape por barra, concatenação de aspas, aspas duplicadas e nome minúsculo, em ambos os caminhos |
| `visibility_extension_recovers_completed_history_without_restart`, 48 | Quebrou: política de 60 minutos mostra uma sessão; reiniciar com a mesma política mostra duas |
| `failure_shape_is_preserved_until_next_event`, 62 | Quebrou: após PostToolUseFailure e 10 minutos sem eventos, Mancha vira Ampulheta |
| `restart_capacity_prefers_live_over_expired_history`, 71 | Bloqueado o deslocamento de sessão viva por 256 concluídas retidas; somente `live` é restaurada |
| `browser_duplicate_auth_and_encoded_ui_paths_are_blocked`, 92 | Estado/SSE sem credencial de UI: 403; caminhos codificados/barra final: 404; Origin null e URI absoluta externa: 403; Authorization duplicado: 401; sem CORS |
| `permission_injection_cannot_emit_allow`, 104 | Payload com allow recebe 204 vazio, sem allow; tentativa de resolver decisão recebe 404 |

## Achados

### P2-06 — alto: valor de .env com espaços é redigido parcialmente

Evidência: `app/src-tauri/src/sanitize.rs:9`, `sanitize.rs:17`,
`sanitize.rs:41`, `sanitize.rs:75`, `lib.rs:253`; harness linha 34.
`WORD_VALUE` termina no primeiro espaço. O fato de a atribuição estar dentro
de uma string usada para escrever o .env não faz o algoritmo reconhecer
o restante do valor da variável.

Reprodução em `PreToolUse/Bash`, `tool_input.command`:

```text
printf 'GREETING=hello PUBLIC_ENV_TAIL\n' > .env
```

Resultado persistido e publicado:
`Bash: printf 'GREETING=•••• PUBLIC_ENV_TAIL\n' > .env`.
O mesmo marcador sobrevive por `Core::report`, caminho usado por scribe_report.
O teste procura o marcador tanto no snapshot como nos bytes do banco; ambos
contêm a cauda do valor.

A [documentação oficial Node.js para valores dotenv](https://nodejs.org/api/environment_variables.html#variable-values)
aceita valores sem aspas com espaços internos. O controle independente
`node .artifacts/review-phase2-2/dotenv-value.mjs`, usando `util.parseEnv`,
retornou `{"GREETING":"hello PUBLIC_ENV_TAIL"}`. Portanto o trecho inteiro
é valor de uma única variável, não argumento de shell fora da atribuição.
As aspas do printf não se tornam aspas no arquivo .env produzido.

Viola §8.4. A gravidade alta decorre de persistir/publicar uma parte
substancial de um valor de .env, incluindo frases secretas com
várias palavras; não foi comprovado acesso remoto nem vazamento fora da
máquina. Reconhecer escrita de dotenv de modo conservador ou omitir o alvo
quando o contexto não permitir garantir a redação completa. Exigir regressão
nos caminhos de hook, relato e armazenamento.

### P2-07 — médio: ampliar visibilidade depende de reiniciar o núcleo

Evidência: `app/src-tauri/src/lib.rs:114`, `lib.rs:280`,
`app/src-tauri/src/store.rs:35`; harness linha 48.

Reprodução: SessionEnd de `old-done` em t=0; SessionStart de `active` em
t=600001, que remove a concluída do mapa pela janela padrão; chamar
`set_completed_minutes(60)`; obter snapshot ainda em t=600001. Resultado:
somente `active`. Abrir outro Core sobre o mesmo banco e timestamp retorna
`active` e `old-done`.

O setter persiste a nova política, mas não recarrega registros que saíram
da memória. Assim, a lista não corresponde à configuração vigente até um
reinício, embora o banco preserve o histórico e a concluída tenha idade
inferior a uma hora. Afeta FR-10 e a política configurável já implementada
nesta fase. Reavaliar a carga limitada após a mudança, sem restaurar
subagentes ou decisões; testar também a sequência reduzir/ampliar.

### P2-08 — médio: silêncio remove a forma de falha sem evento novo

Evidência: `app/src-tauri/src/model.rs:108`, `model.rs:114`,
`app/src-tauri/src/lib.rs:172`; harness linha 62.

Reprodução: PostToolUseFailure em t=0; nenhum evento adicional; snapshot em
t=600000. Resultado: Ampulheta com mensagem de silêncio, em vez de Mancha.
`at_time` aplica o timeout a todas as sessões não encerradas, incluindo
estado de falha. A tabela §6.4 exige Mancha até o próximo evento, e FR-12
descreve a passagem de "pensando" para Ampulheta após silêncio. O passo de
falha permanece no histórico; a indicação prioritária é que desaparece.

Preservar a forma de falha até o próximo evento ou registrar uma mudança
explícita de contrato antes de tratar silêncio como substituto dessa forma.
Adicionar teste que ultrapasse o timeout sem enviar outro hook.

## Notas e catraca

| Área | Nota | Mínimo | Evidência e justificativa |
| --- | --- | --- | --- |
| A — conformidade Claude Code | 9 | 9 | Onze eventos documentados, 46 fixtures públicos e estados imediatos passam em `tests/core.rs:397`; MCP usa SDK oficial e testes HTTP. Resposta vazia conserva fluxo normal. P2-08 é discrepância com o mapeamento do produto, não evento inventado; recursos novos da documentação não ampliam os onze exigidos |
| B — correção funcional | 7 | 9 | API e correções anteriores funcionam; P2-07 faz política aplicada produzir lista diferente após reinício e P2-08 viola duração da forma de falha |
| C — segurança | 7 | 9 | Bind/Host/Origin, duas credenciais, comparação constante, ACL e ausência de allow passaram (`server.rs:55`, `server.rs:150`, testes HTTP). P2-06 deixa valor de .env em estado e banco; barreiras de transporte não corrigem conteúdo persistido |
| D — robustez/falha segura | 8 | 9 | Helper silencioso, corpo limitado/incompleto, SQLite ocupado, concorrência e liberação de porta passaram. P2-07 mantém incoerência entre memória e banco após mudança normal de configuração; não há travamento do Claude comprovado |
| E — qualidade de código | 8 | 8 | Módulos curtos com transporte, core, modelo e store separados; fmt/clippy verdes. `lib.rs:234` salva antes da publicação, erros HTTP são fixos. A redação dependente de contexto e a atualização de políticas ainda requerem ajustes localizados |
| F — testes | 7 | 9 | 1 unidade, 13 integrações e 9 regressões antigas verdes; CI exige e comprova 93,82% de linhas Linux. Os três novos casos determinísticos não são cobertos, incluindo vazamento. Cobertura alta não basta para nota 9 com essas expectativas falhando |
| I — desempenho | 8 | 8 | `tests/core.rs:781` e logs: p95 de 32 eventos <200 ms local e nas três plataformas; capacidades de 256 e spawn_blocking limitam trabalho/memória. Amostra pequena, Windows com menor margem; nenhuma inferência sobre janela, CPU/FPS |
| J — documentação | 8 | 8 | `docs/fase-2.md:1`, ADR 0007 e evidência descrevem escopo, comandos, limitações e correções anteriores. P2-06 limita a alegação de valores inline redigidos; P2-07/P2-08 precisam alinhar comportamento e contrato. Site/release completos pertencem a fases posteriores |

Nenhuma nota 10. Há três achados concretos, obtidos sem fabricação para
atender §13.1; as notas não são todas 9/10. A rodada é válida e reprova a
catraca pelos achados e pelas áreas abaixo do mínimo.

## Fontes e encerramento

- [Claude Code — hooks](https://code.claude.com/docs/en/hooks): nomes,
  campos comuns, retomada e silêncio sem decisão.
- [MCP — Streamable HTTP](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports):
  requisitos de Origin, autenticação e bind local.
- [PowerShell — aspas](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_quoting_rules?view=powershell-7.5):
  escapes e concatenações utilizados como tentativa adicional bloqueada.
- [Node.js — dotenv](https://nodejs.org/api/environment_variables.html#variable-values):
  validade do valor com espaços usado em P2-06.

Corrigir e abrir nova revisão independente antes da Fase 3. CI verde foi
confirmado, mas não equivale à catraca adversarial aprovada. Nenhum commit,
push, merge, chamada a modelo Claude ou alteração de configuração pessoal
foi feito pelo revisor.
