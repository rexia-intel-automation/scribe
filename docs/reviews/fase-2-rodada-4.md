# Fase 2 — revisão adversarial independente, rodada 4

Data: 2026-10-05. Commit congelado:
`3ff5e7ea18fcc1756f9300275ed20441e00652ca`.
Diff avaliado: `main..3ff5e7ea18fcc1756f9300275ed20441e00652ca`.
PR: [#4](https://github.com/rexia-intel-automation/scribe/pull/4).

**Veredito: REPROVADA.** As reproduções das três rodadas anteriores passam.
Esta rodada encontrou dois problemas médios: caminhos absolutos colados a
opções de compilador e retenção de histórico além do prazo, esta última com
duas reproduções. B, C, D e F ficam abaixo dos mínimos. Não foi reproduzido
problema crítico ou alto. Os dois runs de CI do SHA terminaram verdes;
isso não elimina as falhas adicionais.

## Escopo e independência

Revisor novo, sem participação na implementação. Foram lidos `prompt.md`
integralmente, diff da fase, testes, `docs/fase-2.md`, ADR 0007, evidência
`local-server-phase-2.json` e os três relatórios reprovados anteriores.
Fases 0 e 1 são consideradas aprovadas. Somente API sem decisões, onze
hooks, estado, SQLite, higienização, SSE/MCP e desempenho do servidor foram
avaliados. G, H e K não se aplicam à Fase 2. Janela, decisões humanas e
release futuros não foram cobrados nem receberam crédito.
PermissionRequest observador com resposta vazia e scribe_ask indisponível
são coerentes com esta etapa.

Durante a revisão, o construtor comunicou uma reprodução de retenção sem
novos hooks. Ela foi repetida contra a biblioteca real e é identificada
abaixo como confirmação fornecida pelo construtor, não descoberta independente.
O caso de passos antigos em sessão com eventos recentes e os caminhos em
opções de compilador foram descobertos por este revisor. Não houve mudança
de alvo depois do congelamento.

## Integridade e ambiente

Todos os builds e testes ocorreram somente em `D:\RexIA\projetos\scribe`,
sob `C:\Program Files\PowerShell\7\pwsh.exe`, com Cargo/Rust 1.96.0.
Fonte versionada: `C:\Users\engmo\OneDrive\RexIA\RexIA\projetos\scribe`.
O harness chama a biblioteca real por dependência de caminho; módulos de
produção não foram copiados nem modificados.

Dez arquivos — Cargo.toml, Cargo.lock, sete arquivos Rust da biblioteca e
tests/core.rs — tiveram SHA-256 igual na fonte e no espelho. Para cada
arquivo, os blobs obtidos por git hash-object na fonte e no espelho
coincidiram com o blob do commit congelado. A comparação foi repetida após
os ensaios; os dez arquivos permaneceram inalterados. Dados completos:
`.artifacts/review-phase2-4/hashes.json`, no espelho.

O lockfile final do harness conserva os nomes/versões de todos os pacotes
do lockfile de produção; a única adição é o pacote do próprio harness.
Uma resolução offline inicial escolheu duas versões diferentes de pacotes;
ela foi descartada. O lockfile foi novamente derivado do original, conferido
e os ensaios adicionais/regressões foram repetidos com --offline --locked.
Evidência: `lock-integrity.log`. Os resultados relatados abaixo são desse
estado final.

Na fonte, somente este relatório foi criado. Os relatórios reprovados,
implementação e arquivos pessoais foram preservados. Não houve commit,
push, merge, chamada a modelo Claude ou edição de configuração pessoal.
Todos os marcadores dos ensaios são públicos e sintéticos. Os comandos cc,
curl e deploy usados como entradas não foram executados.

## Verificação oficial e CI

- Testes oficiais: **1 unidade e 18 integrações passaram**, zero ignoradas.
  Saída: `official-tests.log` no harness. SCRIBE_TEST_FIXTURES_ROOT apontou
  para os fixtures públicos da fonte; foram usados exatamente **46**,
  cobrindo os onze eventos. Extras históricos em D: não entraram.
- cargo fmt --check e cargo clippy --locked --all-targets -- -D warnings:
  passaram. Saídas: `fmt.log` e `clippy.log`.
- cargo audit --file app/src-tauri/Cargo.lock --deny warnings: passou,
  128 dependências, sem vulnerabilidades ou avisos reportados; `audit.log`.
- O helper release real recebeu evento com stdout/stderr vazios em menos
  de um segundo. Testes de MCP/SSE, ACL, corpo excessivo/incompleto, taxa,
  concorrência, falha/recuperação de SQLite, capacidade, porta ocupada e
  encerramento também passaram.
- Cobertura local repetida pelo revisor: cargo-llvm-cov 0.9.1, --test core,
  exclusão de arquivos de teste e --fail-under-lines 85: **794/830 linhas
  de produção, 95,66%**. Apenas os sete módulos de produção aparecem no
  relatório; os módulos unitários não foram compilados nesse denominador.
  Evidência: `coverage.log`.
- [Run push 37259877398](https://github.com/rexia-intel-automation/scribe/actions/runs/37259877398)
  e [run PR 37259880230](https://github.com/rexia-intel-automation/scribe/actions/runs/37259880230):
  consultados diretamente com gh run view --json status,conclusion,headSha,url,jobs,event.
  Ambos **completed/success**, headSha igual ao congelado. Auditoria e
  todos os jobs de Windows, macOS e Ubuntu concluíram com sucesso.
  JSONs e logs completos foram preservados no harness.
- Os dois logs Linux comprovam --test core, exclusão de /tests/ e exigência
  de 85%: **744/774 linhas de produção, 96,12%**. O denominador Linux difere
  do Windows por código específico de plataforma; não inclui testes nem
  decisões futuras.

p95 local HTTP até estado persistido: **14 ms, 32 amostras**. No run push:
Ubuntu 3 ms, macOS 2 ms, Windows 164 ms; no run PR: 2, 1 e 194 ms.
Todos passam o limite de 200 ms. Windows tem margem pequena no run PR;
isso é uma limitação da amostra e não uma falha fabricada. Não foram
inferidos evento até janela, latência de decisão, memória/CPU do app ou FPS.

## Regressões anteriores

Harness próprio: `D:\RexIA\projetos\scribe\.artifacts\review-phase2-4`.
Os testes das rodadas 1 e 3 foram copiados sem alterações para
tests/round1.rs e tests/round3.rs; seus hashes coincidem com os originais.
Na cópia da rodada 2, somente set_completed_minutes(60) foi adaptado para
set_completed_minutes(60,600_001), conforme a assinatura atual. Os três
harnesses originais permaneceram intactos.

Resultado final: **9 + 8 + 8 testes passaram**, nenhum falhou ou foi ignorado.
Saída: `previous-regressions.log`.

| Achado anterior | Confirmação nesta rodada |
| --- | --- |
| P2-01, Authorization delimitado | JSON/hashtable originais redigidos, sem marcador no estado/SQLite |
| P2-02, escape por barra em token | Cauda original omitida no relato e hook |
| P2-03, dotenv minúsculo | Valor original omitido em ambos os caminhos |
| P2-04, histórico deslocando sessão viva | Sessão viva permanece após reinício com 256 concluídas invisíveis |
| P2-05, cwd de retomada | Novo projeto/cwd aparecem sem perder os passos |
| P2-06, dotenv com espaços | Cauda omitida em relato, hook e banco |
| P2-07, ampliar janela de concluídas | Lista ampliada coincide com a lista após reinício |
| P2-08, Mancha após silêncio | Forma de falha permanece até novo evento |
| P2-09, Authorization concatenado Bash | Cauda original ausente nos dois caminhos e banco |
| P2-10, escape PowerShell de aspa | Cauda original ausente também no relato de uma passagem |
| P2-11, caminho junto a redirecionamento | Caminhos originais após < e > encurtados nos dois caminhos |

## Tentativas deliberadas adicionais

Fonte: src/lib.rs do harness; saída final: `results.log`.
**8 testes: 5 passaram e 3 falharam.** Sete são tentativas novas deste
revisor; um confirma o caso comunicado pelo construtor. As três falhas
são de expectativas de produto, não erros de compilação ou ambiente.
Os dois testes de retenção sustentam um único achado, com duas condições.

Reprodução no espelho, sob PowerShell 7:

```powershell
& 'C:/Users/engmo/.cargo/bin/cargo.exe' test `
  --manifest-path .artifacts/review-phase2-4/Cargo.toml `
  --offline --locked --lib -- --nocapture
& 'C:/Users/engmo/.cargo/bin/cargo.exe' test `
  --manifest-path .artifacts/review-phase2-4/Cargo.toml `
  --offline --locked --test round1 --test round2 --test round3 -- --nocapture
```

Para reprodução individual, acrescentar o nome do teste antes de --.

| Teste / linha do harness | Resultado observado |
| --- | --- |
| compiler_include_and_library_paths_are_shortened, 25 | Quebrou: -I/caminho e -L/caminho conservam ancestral completo em relato, hook e SQLite |
| retention_without_incoming_hooks_expires_snapshot_and_sqlite, 33 | Confirmação do caso fornecido: após 15 dias, passo vencido permanece no snapshot e SQLite |
| recent_hook_does_not_extend_old_step_retention, 45 | Quebrou: hooks em 13/15 dias renovam a sessão, preservando passo de t=1; reinício também preserva o passo vencido |
| sensitive_cli_case_multiline_and_delimited_variants_are_omitted, 59 | Bloqueadas cinco variantes de chave/flag sensível e Proxy-Authorization; sem marcador nos dois caminhos/banco |
| concurrent_reports_and_end_never_reopen_a_completed_session, 65 | Bloqueado: 16 relatos concorrentes com SessionEnd não reabrem sessão; relato posterior falha e reinício mantém concluída |
| clearing_history_removes_synthetic_bytes_and_all_steps, 76 | Bloqueado: vinte passos apagados; marcador desaparece dos bytes SQLite e reinício não recupera histórico |
| encoded_ui_route_and_unknown_mcp_method_cannot_expose_or_change_state, 90 | Cinco rotas codificadas/barra duplicada retornam 404 sem estado; método MCP scribe/allow retorna erro -32601 e não altera a sessão |
| invalid_credentials_are_rejected_before_incomplete_large_body, 103 | Bloqueado: corpo declarado de 1.000.000 bytes, não enviado, recebe 401 em 1 ms com token inválido |

## Achados

### P2-12 — médio: caminhos colados a opções de compilador não são encurtados

Evidência: app/src-tauri/src/sanitize.rs:23, sanitize.rs:24,
sanitize.rs:56, lib.rs:137, lib.rs:222, lib.rs:253;
harness src/lib.rs:25.

Reproduções por Core.report e PreToolUse/Bash, tool_input.command:

```text
cc -I/private/PUBLIC_COMPILER_PARENT/project/include file.c
cc -L/private/PUBLIC_COMPILER_PARENT/project/lib file.o
```

O ancestral PUBLIC_COMPILER_PARENT permanece na ação, nos passos e nos
bytes SQLite em todas as quatro combinações de entrada/caminho. A ação
do relato é idêntica ao texto de entrada; o hook acrescenta apenas Bash:.
INLINE_PATH admite espaço/igual/operadores antes da barra, mas não -I/-L;
QUOTED_PATH não ajuda porque o argumento está sem aspas.

São diretórios absolutos usados como argumentos de opções reais de
compilador, conforme a [referência oficial GCC de busca de diretórios](https://gcc.gnu.org/onlinedocs/gcc/Directory-Options.html).
Não é necessário interpretar o comando nem executá-lo para demonstrar
que o texto completo foi armazenado. Viola o encurtamento de caminhos
absolutos de §8.4 e as alegações de caminhos em comandos/relatos no ADR 0007.
Classificação média: expõe ancestrais de diretório que deveriam ser omitidos;
não foi demonstrada exposição de conteúdo, credencial ou acesso remoto.
Cobrir caminhos colados a essas opções, preservando URLs e as regressões
de redirecionamento já aprovadas.

### P2-13 — médio: retenção não expira histórico sem hooks nem passos de sessão recente

Evidência: app/src-tauri/src/lib.rs:55, lib.rs:83, lib.rs:109,
lib.rs:242, lib.rs:263; model.rs:127, store.rs:74, store.rs:76;
server.rs:236, server.rs:269; harness src/lib.rs:33 e src/lib.rs:45.

O contrato de §8.3 é retenção do log de eventos por quatorze dias,
configurável. A implementação remove sessões inteiras pela idade de
last_event_at em open/hook/set_retention_days. Snapshot e o timer SSE
não expiram histórico, e nenhum caminho expira Step.at individualmente.

Reprodução A, confirmando a entrada fornecida pelo construtor: iniciar
SessionStart em t=0, registrar PUBLIC_EXPIRED_METADATA em t=1, não enviar
mais hooks e obter snapshot em t=15*86_400_000. O snapshot conserva o passo
de t=1; o banco ainda tem uma linha contendo o marcador. A forma muda para
Ampulheta, mas a mensagem de silêncio não apaga o histórico vencido.
A expectativa do harness exige ausência do marcador antigo no snapshot e
banco, sem impor como solução a remoção integral da sessão ainda observada.

Reprodução B, descoberta independente: SessionStart em t=0,
Core.report com PUBLIC_OLD_STEP em t=1 e UserPromptSubmit em t=13 dias e
t=15 dias. O último hook atualiza lastEventAt para 1296000000; o snapshot
ainda contém Step.at=1 e PUBLIC_OLD_STEP. Os bytes SQLite e uma nova
abertura do Core em t=15 dias também preservam esse passo. Portanto
acrescentar limpeza periódica de sessões inativas não basta: a sessão
recente impede a exclusão do registro inteiro, mantendo eventos vencidos.

As duas condições são agrupadas como uma falha de retenção, sem contar
cada asserção como problema separado. Classificação média: metadados já
higienizados permanecem além da política de privacidade prometida; nenhum
segredo novo, envio externo ou travamento do Claude foi comprovado.
Aplicar o prazo ao histórico dos passos e garantir limpeza sem depender
de novos hooks, com memória, banco e streams consistentes. Preservar a
sessão atual quando necessário não exige preservar seus eventos antigos.

## Notas e catraca

| Área | Nota | Mínimo | Evidência e fundamento |
| --- | --- | --- | --- |
| A — conformidade Claude Code | 9 | 9 | Onze eventos e 46 fixtures passam em tests/core.rs:570; campos/resposta observadora conferidos na referência oficial de hooks. MCP usa SDK oficial e seus testes HTTP em tests/core.rs:666 passam. Não há evento inventado ou aprovação inferida |
| B — correção funcional | 8 | 9 | API, mapeamento, persistência, políticas de concluídas e onze correções anteriores passam. P2-12/P2-13 violam contratos de encurtamento/retenção já exigidos nesta fase; três expectativas adicionais falham |
| C — segurança | 8 | 9 | Loopback, Host/Origin, duas credenciais, comparação constante e ACL passam, inclusive token rejeitado antes do corpo. P2-12 expõe caminho ancestral e P2-13 conserva histórico vencido; não houve novo vazamento de credencial ou allow indevido |
| D — robustez/falha segura | 8 | 9 | Helper real, corpos incompletos, capacidade, SQLite ocupado/recuperado e liberação de porta passam. Concorrência relato/encerramento e limpeza integral passaram. P2-13 torna retenção dependente de atividade e mantém histórico vencido mesmo após reinício de sessão recente |
| E — qualidade de código | 8 | 8 | Módulos curtos e responsabilidades separadas; gravação antes de publicação em lib.rs:234, erros HTTP fixos, fmt/clippy verdes. Reconhecimento de caminhos e política aplicada à granularidade errada requerem ajustes localizados; sem evidência para nota 9/10 |
| F — testes | 8 | 9 | 19 testes oficiais e 25 regressões anteriores verdes; cobertura de produção local 95,66%/Linux 96,12% comprovada. tests/core.rs:119 testa operadores, não opções coladas; tests/core.rs:511 expira sessões em mudança de política, não passos antigos ou passagem do tempo sem hooks. Três novas expectativas determinísticas falham |
| I — desempenho | 8 | 8 | tests/core.rs:954 e logs locais/CI: p95 <200 ms nas três plataformas; limites de capacidade e spawn_blocking existem. Amostras de 32 eventos, Windows PR 194 ms com pouca margem; sem inferência sobre app/UI ainda inexistente |
| J — documentação | 8 | 8 | docs/fase-2.md, ADR 0007, READMEs e evidência distinguem escopo, comandos, omissões intencionais e medições ausentes. Alegações de caminhos/retenção precisam alinhar-se a P2-12/P2-13; site completo/release pertencem à Fase 6 |

G, H e K não avaliadas. Nenhuma nota 10 atribuída. Há dois achados concretos,
três testes novos que falham e oito tentativas documentadas. A regra de
§13.1.7 que invalida notas todas 9/10 com menos de três problemas não se
aplica: as notas acima decorrem das evidências, incluindo áreas com 8;
nenhum terceiro problema foi inventado e nenhum mínimo foi rebaixado.
A rodada é válida e a catraca reprova por B/C/D/F abaixo dos mínimos.
CI verde não autoriza avançar à Fase 3.

## Fontes e encerramento

- [Claude Code — referência de hooks](https://code.claude.com/docs/en/hooks):
  eventos, campos comuns e resposta observadora vazia, conferidos nesta rodada.
- [MCP — Streamable HTTP](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports):
  autenticação, Origin e bind local; sem extrapolar para decisões humanas.
- [subtle — ConstantTimeEq](https://docs.rs/subtle/latest/subtle/trait.ConstantTimeEq.html):
  comparação de credenciais usada na implementação.
- [GCC — opções de busca de diretórios](https://gcc.gnu.org/onlinedocs/gcc/Directory-Options.html):
  significado de -I e -L usado na reprodução de P2-12.

Corrigir os dois achados e abrir nova rodada independente, preservando
este relatório e as três reprovações anteriores. O alvo desta revisão
permaneceu congelado; não foi concedido crédito por correções futuras.
