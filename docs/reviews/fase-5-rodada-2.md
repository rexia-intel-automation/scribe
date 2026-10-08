# Fase 5: rodada 2 (auditoria de segurança, critério C10)

- Autor: Claude Code scribe-c9 (Opus), revisão independente rodada 2.
- Data: 2026-10-08.
- SHA auditado: `2fb608d98f56ff1e551030830c75673eb1cbc2bb` (PR #26, candidato integrado
  sobre `main`). As linhas citadas valem para esse SHA.
- Base de comparação: `42ecb7f3562584da9e7cd490a8dd741f18584c28` (rodada 1,
  `docs/reviews/fase-5-rodada-1.md`).
- Mudanças mapeadas (`git log --oneline 42ecb7f..2fb608d`, `git diff --stat 42ecb7f 2fb608d`,
  48 arquivos): #21 (F-02), #22 (MCP via helper stdio, `/mcp` só assinado, plug-in 0.1.1,
  `--mcp-check`), #23 (hooks com `server_nonce` fresco no mesmo socket, query recusada,
  ADR 0011), #24 (docs e roteiro de TI), #25 (F-05, F-06, F-09, testes de bytes do F-12),
  #26 (upgrade do plug-in e verificação da versão instalada).
- Método: estático (leitura via `git show`/`git diff`) mais leitura de logs do CI via `gh`.
  Nada foi compilado, executado, instalado ou aberto nesta rodada. Nenhum
  `connection.json`, token ou diretório de dados do app foi lido.
- Legenda de prova:
  - **lido**: código e teste lidos nesta rodada.
  - **CI**: um job nomeado mostra o teste passando num SHA cujo código relevante é igual
    ao de `2fb608d`.
  - **não executado**: não há execução ligada ao SHA.
- Igualdade de árvore usada para aceitar CI de outro SHA: `git rev-parse <sha>:app` e
  `git rev-parse <sha>:.github` são idênticos em `174becf` e `2fb608d` (`da2fb068…` e
  `475058da…`). Entre os dois, `scripts/` difere só em `configure-claude-plugin.ps1`, no
  teste dele e em `mcp-stdio-config.test.mjs`. `cbd798f` e `3080efb` têm as mesmas árvores
  de `app`, `scripts`, `plugins` e `.github` que `2fb608d`; o commit `2fb608d` muda só docs.
- Jobs de CI citados:
  - **[J1]** Ubuntu `native-and-plugin`, job 113393910002 (run 37801297215, push, `2fb608d`):
    sucesso. Suítes Rust core 29/29, decisions 21/21, interactive 10/10, mcp_native 3/3,
    storage_privacy 2/2; helper 7/7; `node --test` 43 aprovados, 0 falhas e 7 pulados (os
    7 pulados são os testes de onboarding, que só rodam no Windows); cobertura de linhas
    do núcleo 95,38%; `claude plugin validate --strict` aprovado.
  - **[J2]** Windows `native-and-plugin`, job 113393909568 (mesmo run, `2fb608d`): sucesso.
    Core 29/29 em 48,08 s; `node --test` 75/75, sem pulados.
  - **[J3]** `windows-onboarding`, job 113393909819 (`2fb608d`): 32/32 em PowerShell 5.1 e 7.
  - **[J4]** `dependency-audit`, job 113393909298 (`2fb608d`): `cargo audit` nos dois
    lockfiles, com duas exceções; `npm audit` em `app`: 0 vulnerabilidades.
  - **[J5]** Documentation `build`, job 113393965246 (`2fb608d`):
    `npm audit --prefix docs-site`: 0 vulnerabilidades.
  - **[J6]** macOS `native-and-plugin`, job 113381093251 (run 37797623995, `174becf`, árvore
    `app`/`.github` igual): sucesso. O job macOS em `2fb608d` (113393909715) estava em
    andamento quando este relatório foi escrito.
- Limites:
  - CI em runner não é ensaio em sessão real do Claude Code nem em desktop instalado.
  - Os "72 testes headless" não contam como evidência de desktop.
  - Uma execução transitória no Windows rodou a suíte core 3,5 vezes mais devagar
    (161,7 s contra cerca de 46 s), com uma falha de read-timeout em
    `http_latency_port_collision_drop_and_incomplete_bodies_are_bounded`
    (job 113386111634, head do PR #23 `f799485`). A causa não foi determinada. Em [J2]
    a mesma suíte levou 48,08 s.
  - As revisões postadas nos PRs #22 a #26 por "Claude Code scribe-c9" são estáticas, não
    execuções. Elas não são usadas como prova executada. O PR #21 não tem revisão desse
    autor nos comentários; o adendo F-02 da rodada 1 registra uma revisão estática.
  - `.artifacts/coordenacao/security-gaps-local-tests.log` não traz SHA e não foi usado
    como prova. `office-candidate-nsis2fb.log` só registra o build NSIS, sem instalação
    nem execução.

## 1. Matriz de achados F-01…F-12

| Achado | Sev. R1 | Status em 2fb608d | Onde (2fb608d, PR) | Teste que cobre | Prova | O que falta |
| --- | --- | --- | --- | --- | --- | --- |
| F-01 MCP sem autenticação do servidor | MÉDIO | **CORRIGIDO** | `plugins/scribe/.mcp.json:3-8` (stdio `client_path --mcp`, sem Bearer); `hook-client/src/attested.rs:69-122` (prova do servidor antes do corpo, mesmo socket), `:152-172` (resposta assinada); `hook-client/src/mcp.rs:49-92`; `server.rs:253-257`, `:288-311`, `:345-413`, `:544-589`. PR #22 | `mcp-native.test.mjs:77`, `:106`, `:121`, `:136`; `core.rs:1166` `mcp_bearer_without_attestation_cannot_call_tools`; `core.rs:1189` `mcp_fresh_server_nonce_binds_request_response_and_prevents_reissued_replay`; `mcp_native.rs:114`, `:181`, `:229` | lido; CI [J1] [J2] (e [J6] por árvore) | Ensaio com Claude Code real e impostor numa conta separada (seção 5, item H1). |
| F-02 Cauda escondida por preenchimento | MÉDIO | **CORRIGIDO** (vetor da R1) | `sanitize.rs:5-17` (Cc, Cf, todo `is_whitespace` exceto U+0020, e 115F/1160/2800/3164/FFA0). PR #21 | `decisions.rs:34` `invisible_fillers_cannot_be_approved_even_with_risk_confirmation` (allow e arm recusados para 9 caracteres); `decisions.rs:85` | lido; CI [J1] [J2] | Resíduo baixo: a lista é fechada. Code points sem glifo (PUA, não atribuídos) não têm teste. Falta o teste na WebView2 (H4). |
| F-03 Repetição de par capturado | BAIXO | **CORRIGIDO** | `server.rs:528-530` (`server_nonce` aleatório), `:314-337` (par exigido antes do corpo), `:415-457` (MAC liga nonce, server_nonce, caminho e corpo; consumo atômico); `attested.rs:124-142`. PR #23 | `core.rs:1767` `native_hooks_authenticate_both_peers_and_reject_replay` (GET reemitido gera nonce novo; POST antigo dá 401; cópias concorrentes: 1 aceita); `core.rs:1189` para o MCP | lido; CI [J1] [J2] | Nada para integridade. A disponibilidade residual está em A39. |
| F-04 Custo antes da autenticação | BAIXO | **PARCIAL** | `server.rs:288-337`: só verifica nonce antes do corpo. Não há limite global de conexões nem prazo de cabeçalho. `docs/seguranca.md:49` admite isso. PR #23 | `core.rs:1767` (socket com `Content-Length: 100` sem par recebe 401 em até 250 ms) | lido; CI [J1] [J2] | Limite global e prazo de cabeçalho; teste de carga (A1). Não há teste equivalente de "sem par" para `/mcp`. |
| F-05 Lacunas da regex de risco | BAIXO | **PARCIAL** | `decisions.rs:10-12` (refspec `+`, `git clean -f`, `find -delete`, `curl -d/--data/--data-binary @`, `-T`/`--upload-file`, `Remove-Item -Force`). PR #25 | `decisions.rs:533` `every_documented_risk_pattern_needs_confirmation` (11 variantes novas) | lido; CI [J1] [J2] | Ainda passam sem risco: `docker system prune -af` (listado no A26), `curl -F f=@x`, `curl -sd @x`, `wget --post-file`, `Invoke-WebRequest -InFile`, `git push --delete`/`--mirror`. A regex é um aviso, não uma barreira (A7). |
| F-06 Cf em projeto e relatório | BAIXO | **CORRIGIDO** | `model.rs:102-111` (`?` para projeto e cwd ambíguos); `lib.rs:424-427` (relatório ambíguo é recusado). PR #25 | `core.rs:41` `ambiguous_project_labels_and_reports_never_enter_visible_or_stored_metadata` (U+202E, U+2066, U+3164, U+00A0; confere snapshot e bytes do banco) | lido; CI [J1] [J2] | Nada. |
| F-07 Doc promete cobertura que o teste não tem | BAIXO | **PARCIAL** | `core.rs:1998-2011` (OPTIONS em `/mcp`, challenge e hook; URI absoluta estrangeira no challenge); `core.rs:2012-2027` (Host único estrangeiro no challenge → 403). PR #23 | `core.rs:1950` `challenge_proof_binds_the_nonce_and_cannot_reflect_the_server_proof` | lido; CI [J1] [J2] | Os casos só cobrem a rota de challenge. O OPTIONS vai sem `Origin`. As asserções são `!= 200`, sem conferir ausência de CORS. `docs/seguranca.md:89` ainda atribui "URI com autoridade divergente" ao teste `http_boundaries…`, que não tem esse caso (A2). |
| F-08 Env var redefine raiz de confiança | BAIXO | **ABERTO** | `hook-client/src/main.rs:45` (`SCRIBE_CONNECTION_FILE`, agora vale também para `--mcp`); `desktop.rs:179`, `:233-235` | Nenhum. O teste `mcp-native.test.mjs:31` depende da variável. | lido | Aceitar só em build de teste, ou checar dono e ACL. A severidade não muda: exige controle do ambiente do Claude Code. |
| F-09 Dependabot sem npm | BAIXO | **CORRIGIDO** | `.github/dependabot.yml:3-10` (`npm` em `/app` e `/docs-site`). PR #25 | n/a (configuração) | lido | Nada. |
| F-10 GTK no Linux (RUSTSEC-2024-0429) | BAIXO | **ACEITO COMO RISCO** | `ci.yml:38` mantém `--ignore RUSTSEC-2024-0370 --ignore RUSTSEC-2024-0429` | job `dependency-audit` | CI [J4] (passa com as exceções) | Data de revisão da exceção; trocar quando o Tauri aceitar glib >= 0.20. Não afeta o Windows. |
| F-11 Sessão do MCP não isolada | BAIXO | **ACEITO COMO RISCO** | Documentado em `docs/seguranca.md` ("Limites"). A autenticação agora é a chave HMAC do usuário em vez do Bearer. | `core.rs:1305` (limites de argumentos) | lido; CI [J1] | Credencial por sessão (v0.2+). Mesmo usuário do SO está fora do escopo declarado. |
| F-12 Retenção sem prova em bytes | BAIXO | **PARCIAL** | `tests/storage_privacy.rs` (novo). PR #25. O banco continua em `app_data_dir` (`desktop.rs:235`), ou seja, `%APPDATA%` roaming. | `storage_privacy.rs:44` `clear_history_removes_session_and_decision_bytes`; `:78` `retention_prunes_old_session_and_decision_bytes_but_keeps_current_session` (varre `state.db`, `-journal`, `-wal` e `-shm`) | lido; CI [J1] [J2] | Perfil roaming não migrado para `app_local_data_dir`; não há ensaio em perfil de domínio (H5). |

Contagem: CORRIGIDO 5 (F-01, F-02, F-03, F-06, F-09); PARCIAL 4 (F-04, F-05, F-07,
F-12); ABERTO 1 (F-08); ACEITO COMO RISCO 2 (F-10, F-11). Nenhum achado de severidade
média ou maior segue aberto ou parcial.

## 2. Matriz de ataques

### 2.1 A01…A32 (reavaliados em 2fb608d)

"Mudou" marca resultado ou cobertura diferente da rodada 1. "Exato" diz se um teste
automatizado exercita exatamente o cenário.

| ID | Ataque (resumo) | Resultado R1 → 2fb608d | Mudou | Teste (2fb608d) | Exato | Prova |
| --- | --- | --- | --- | --- | --- | --- |
| A01 | Bearer ausente, errado ou duplicado | DEFENDIDO → DEFENDIDO | escopo: o Bearer só abre `/v1/health` e as rotas de UI (que pedem também a credencial de UI); `/mcp` não aceita mais Bearer | `core.rs:1305`, `core.rs:1166` | sim | CI [J1] [J2] |
| A02 | Bearer sem credencial de UI | DEFENDIDO → DEFENDIDO | não | `core.rs:1305` | sim | CI |
| A03 | Host único estrangeiro | DEFENDIDO → DEFENDIDO | cobertura: agora existe teste, só no challenge | `core.rs:2012-2027` | parcial | CI |
| A04 | URI absoluta divergente | DEFENDIDO → DEFENDIDO | cobertura: antes não havia teste; agora há um no challenge, com `!= 200` | `core.rs:2003-2006` | parcial | CI |
| A05 | Origin de página, nulo ou vazio | DEFENDIDO → DEFENDIDO | +`/mcp` assinado com Origin | `core.rs:1305`, `core.rs:1189` | sim | CI |
| A06 | Preflight CORS | DEFENDIDO → DEFENDIDO | OPTIONS testado, mas sem Origin | `core.rs:1999-2001` | parcial | CI |
| A07 | Inundação de challenges sem prova | DEFENDIDO → DEFENDIDO | não | `core.rs:2033` | sim | CI |
| A08 | Hook só com Bearer | DEFENDIDO → DEFENDIDO | não | `core.rs:2087` | sim | CI |
| A09 | Prova HMAC forjada ou refletida | DEFENDIDO → DEFENDIDO | domínios por canal (`hook-*`, `mcp-*`) | `core.rs:1950`, `hook-protocol` | sim | CI |
| A10 | Repetir o mesmo POST assinado | DEFENDIDO → DEFENDIDO | não | `core.rs:1767` | sim | CI |
| A11 | Repetir GET e POST capturados | **VULNERÁVEL → DEFENDIDO** | sim (F-03) | `core.rs:1767`, `core.rs:1189` | sim | CI |
| A12 | Esgotar a quota legítima sem chave | DEFENDIDO → DEFENDIDO | não | `core.rs:2033`, `core.rs:2087` | sim | CI |
| A13 | Custo antes da autenticação | PARCIAL → PARCIAL | melhorou (nonce antes do corpo) | `core.rs:1767` (corpo não enviado) | parcial | CI; carga não executada |
| A14 | Servidor falso para hooks | DEFENDIDO → DEFENDIDO | transporte trocado de ureq para hyper, socket único | `native-client.test.mjs` | sim | CI [J1] [J2] |
| A15 | Servidor falso para o MCP | **VULNERÁVEL → DEFENDIDO** | sim (F-01) | `mcp-native.test.mjs:77-151` | sim (fixture, não Claude real) | CI [J1] [J2] |
| A16 | Resposta alterada ao helper | DEFENDIDO → DEFENDIDO | não | `native-client.test.mjs` | sim | CI |
| A17 | Corpo grande e JSON-bomba | DEFENDIDO → DEFENDIDO | não; aninhamento profundo segue sem teste | `core.rs:1305` (413) | parcial | CI (tamanho) |
| A18 | XSS e markup na UI | DEFENDIDO → DEFENDIDO | não (UI inalterada) | Vitest e Playwright | parcial | CI [J1] |
| A19 | Controle e bidi nas notificações | DEFENDIDO → DEFENDIDO | não | `notifications::tests` | sim | CI |
| A20 | XML no toast do Windows | NÃO VERIFICADO → NÃO VERIFICADO | não | nenhum | não | não executado |
| A21 | Risco sem armar ou antes de 1 s | DEFENDIDO → DEFENDIDO | não | `decisions.rs:420` | sim | CI |
| A22 | Plano sem armar | DEFENDIDO → DEFENDIDO | não | `interactive.rs` | sim | CI |
| A23 | Corrida de dupla resolução | DEFENDIDO → DEFENDIDO | não | `decisions.rs:362` (sequencial) | parcial | CI |
| A24 | Id errado, expirado ou desconectado | DEFENDIDO → DEFENDIDO | +queda do helper MCP com pergunta pendente (ver A44) | `decisions.rs:455`, `mcp_native.rs:229` | sim | CI |
| A25 | Cauda por preenchimento e tecla A | **PARCIAL → DEFENDIDO** | sim (F-02): o backend recusa `allow` e `arm` | `decisions.rs:34` | sim | CI |
| A26 | Contornar a regex de risco | PARCIAL → PARCIAL | melhorou; `docker system prune -af` ainda passa | `decisions.rs:533` | parcial | CI |
| A27 | Bidi em projeto e relatório | **PARCIAL → DEFENDIDO** | sim (F-06) | `core.rs:41` | sim | CI |
| A28 | Permissões do banco e do `connection.json` | DEFENDIDO → DEFENDIDO | não | `core.rs:557` (banco) | parcial | CI; ACL do `connection.json` sem teste |
| A29 | Retenção e exclusão | DEFENDIDO → DEFENDIDO | cobertura: varredura de bytes | `storage_privacy.rs:44`, `:78` | sim | CI |
| A30 | Superfície IPC do Tauri | DEFENDIDO → DEFENDIDO | não | `desktop::tests::only_local_asset_origins_can_navigate_or_invoke` | sim | CI |
| A31 | MCP: auth, resolução e sessão | PARCIAL → PARCIAL | a auth agora é por atestação; a sessão continua sem isolamento (F-11) | `core.rs:1166`, `:1189`, `:1305` | sim (auth) | CI |
| A32 | Auditoria de dependências | PARCIAL → PARCIAL | F-09 corrigido; F-10 continua | jobs de audit | n/a | CI [J4] [J5] |

### 2.2 Superfícies novas (A33+)

| ID | Ataque | Defesa e onde | Teste | Resultado | Prova |
| --- | --- | --- | --- | --- | --- |
| A33 | Linha stdio infinita ou de 1 MiB + 1 no `scribe-hook --mcp` | `LimitedLines` corta por linha antes do parser do rmcp (`hook-client/src/mcp.rs:94-141`) | `mcp::tests::stdio_line_limit_applies_before_json_parsing_and_resets_per_line` | DEFENDIDO. Aninhamento profundo no stdio sem teste. | CI [J1] [J2] |
| A34 | Impostor na porta para o MCP: prova falsa, socket fechado após o challenge, resposta forjada | Prova do servidor e `server_nonce` antes do corpo, no mesmo socket, sem pool, retry ou reconexão (`attested.rs:69-123`); resposta assinada (`:152-172`) | `mcp-native.test.mjs:77`, `:106`, `:121`, `:136` | DEFENDIDO | CI [J1] [J2] |
| A35 | `/mcp` com GET, DELETE, OPTIONS, query ou só Bearer | 401 antes de qualquer handler (`server.rs:253-257`) | `core.rs:1166` (POST com Bearer), `core.rs:1999` (OPTIONS `!= 200`) | DEFENDIDO no código. GET, DELETE e query em `/mcp` sem teste. | CI (parcial) |
| A36 | Reenvio de POST `/mcp` capturado; corpo alterado; prova duplicada; Origin | Par consumido uma vez; MAC sobre o corpo; GET reemitido gera nonce novo (`server.rs:288-311`, `:345-386`, `:544-589`) | `core.rs:1189` | DEFENDIDO | CI |
| A37 | Query não assinada em hook ou challenge | 401 (`server.rs:262-264`) | `core.rs:1767` (`?unsigned=1` nos dois) | DEFENDIDO | CI |
| A38 | Confusão entre canais (prova de hook no MCP e vice-versa) | Domínios distintos `hook-*` e `mcp-*`; mapas de challenge separados (`server.rs:42-43`) | `core.rs:1189` (prova de hook no challenge MCP → 401). O inverso não tem teste. | DEFENDIDO no código | CI (parcial) |
| A39 | Reenviar GETs de challenge capturados para ocupar o mapa (256) e a quota de 256/s, agora compartilhada entre hooks e MCP | A prova do GET é determinística no nonce do cliente (`attested.rs:80-83`). A quota `challenge_rate` é única (`server.rs:518`, `:564`). | nenhum | PARCIAL (BAIXO). Só afeta disponibilidade; o hook volta ao terminal. Exige captura de loopback. | não executado |
| A40 | Helper falso ou antigo passando no gate `--mcp-check` | O script exige `name`, `version` `0.1.0` e `mcp_transport` exatos, com prazo de 3 s (`configure-claude-plugin.ps1:88-149`). O marcador é declaração de capacidade, não atestação; a doc diz isso (`docs/seguranca.md`). | `configure-claude-plugin.ps.test.mjs` ("reject a helper without attested-stdio-v1", "stop a hung helper check") | DEFENDIDO para o que promete | CI [J3], [J2] |
| A41 | Inventário `plugin list --json` malformado, duplicado, desabilitado, antigo ou com sobra composta | Parse duplo e envelope; exige `id`, `version`, `scope` e `enabled` tipados; uma única entrada `user` em 0.1.1 (`configure-claude-plugin.ps1:270-343`) | mesmo arquivo ("refuse stale, disabled, ambiguous, missing, malformed…", 9 casos) | DEFENDIDO. A entrada vem da CLI do próprio usuário. | CI [J3] |
| A42 | Atualização maliciosa do plug-in (8.1): marketplace pré-existente chamado `rexia-scribe` de outra origem; `main` sem fixação de versão | O script confia só no nome (`:226`) e agora roda `marketplace update` e `plugin update` (`:231-240`, `:261-268`). Confere a versão `0.1.1`, não a origem. A doc admite que o marketplace segue `main` (`docs/configuracao-plugin-windows.md`, fim). | nenhum de autenticidade | PARCIAL (BAIXO). O nome-só já existia na R1. Impacto menor que antes: o script não envia mais token, só `client_path`. | não executado |
| A43 | Token antigo do plug-in 0.1.0 continua no armazenamento do Claude Code | Não é lido nem usado; a doc admite que não há remoção (`docs/configuracao-plugin-windows.md:58-62`) | nenhum | ACEITO COMO RISCO (informativo). O Bearer hoje só abre `/v1/health`. | lido |
| A44 | Cancelamento ou EOF do cliente MCP com `scribe_ask` pendente vira resposta | Cancelamento aborta o socket (`attested.rs:15-21`); servidor expira o cartão; `resolve_decision` falha | `mcp_native.rs:181` `helper_cancel_closes_socket_and_cannot_leave_a_live_question`, `:229` `helper_eof_expires_a_pending_question_without_answering_it` | DEFENDIDO. Fecha o item 7 da R1 para o canal MCP. | CI [J1] [J2] |

### 2.3 Contagem

| Resultado | A01–A32 | A33–A44 | Total |
| --- | --- | --- | --- |
| DEFENDIDO | 27 | 9 | 36 |
| PARCIAL | 4 (A13, A26, A31, A32) | 2 (A39, A42) | 6 |
| NÃO VERIFICADO | 1 (A20) | 0 | 1 |
| ACEITO COMO RISCO | 0 | 1 (A43) | 1 |
| VULNERÁVEL | 0 | 0 | 0 |

Defendidos com teste automatizado exato e executado no CI: 27 de 36.
- A01–A32 (20): A01, A02, A05, A07, A08, A09, A10, A11, A12, A14, A15, A16, A19, A21, A22,
  A24, A25, A27, A29 e A30.
- A33+ (7): A33, A34, A36, A37, A40, A41 e A44.

Defendidos com cobertura parcial: A03, A04, A06, A17, A18, A23, A28, A35 e A38.

## 3. Regressões e riscos novos desde a rodada 1

Nenhuma regressão de severidade média ou maior foi encontrada. Riscos novos ou ampliados:

1. **N-1 · BAIXO · Quotas compartilhadas entre hooks e MCP.** `challenge_rate` (256/s,
   `server.rs:518`, `:564`) e `rate` autenticada (50/s, `:387`, `:458`, `:488`) valem para os
   dois canais. Uma rajada de `scribe_report` legítimos ou GETs capturados e reenviados (A39)
   pode atrasar um hook, que volta ao terminal. Reprodução (descrição): com captura de
   loopback, guarde 256 GETs de challenge com nonces distintos e reenvie-os a cada 2 s. Ao
   mesmo tempo, meça se um `PermissionRequest` legítimo chega em 250 ms.
2. **N-2 · BAIXO · Atualização automática de marketplace confiado só pelo nome.**
   `configure-claude-plugin.ps1:226`, `:231-240`, `:261-268`. O PR #26 passou a rodar
   `marketplace update` e `plugin update` no marketplace que se chamar `rexia-scribe`.
   Reprodução: num perfil com um marketplace de terceiros chamado `rexia-scribe` que publica
   `scribe` 0.1.1, o script atualiza, instala e configura `client_path`. O manifesto vindo
   desse marketplace decide o comando MCP e os hooks. Correção sugerida: conferir a origem
   (`source`/`repo`) na saída de `marketplace list --json` antes de atualizar.
3. **N-3 · INFORMATIVO · Token antigo residual (A43).** Não há remoção documentada. O
   impacto ficou mínimo porque o Bearer perdeu o acesso a `/mcp` e aos hooks.
4. **N-4 · INFORMATIVO · Literal `/mcp` na assinatura.** O servidor aceita `/mcp` e `/mcp/`
   (`server.rs:253`), mas o MAC liga o literal `/mcp`. Hoje não muda a autoridade. Rever se
   surgirem sub-rotas sob `/mcp`.
5. **N-5 · INFORMATIVO · Pares de versão fixados em literal.** O script aceita só helper
   `0.1.0` (`:137`) e plug-in `0.1.1` (`:156`). Isso falha fechado, mas cada release exige
   editar o script. Não é risco de segurança. É risco de bloqueio de instalação.
6. **Transitório no Windows (carregado como está).** Job 113386111634: suíte core em
   161,7 s com read-timeout em `http_latency_port_collision_drop_and_incomplete_bodies_are_bounded`.
   A causa não foi determinada. Em [J2] (`2fb608d`) a suíte passou em 48,08 s. Um teste de
   latência sensível ao runner pode mascarar ou simular uma regressão de disponibilidade.

## 4. Evidência executável que ainda falta para o C10

### 4.1 Já executado no CI (em 2fb608d ou em árvore igual)

- Suítes Rust completas, inclusive `mcp_native` e `storage_privacy`, no Ubuntu [J1] e no
  Windows [J2]. No macOS só em `174becf`, com árvore igual [J6].
- Cobertura do núcleo em 95,38% de linhas [J1]. O gate é 85%.
- `native-client.test.mjs` e `mcp-native.test.mjs` contra o helper release [J1] [J2].
- Onboarding PowerShell 5.1 e 7 com executáveis falsos [J3].
- `cargo audit` e `npm audit` [J4] [J5]. `claude plugin validate --strict` [J1] [J2].

### 4.2 Faltam testes automatizados

| # | Item ligado | O que executar | Esperado |
| --- | --- | --- | --- |
| A1 | F-04, A13, A39, N-1 | Carga concorrente: 500 conexões com cabeçalho byte a byte, 500 com corpo de 1 MiB sem par, 256 GETs capturados reenviados; um hook legítimo medido em paralelo | Hook legítimo em até 250 ms, ou limite global e prazo de cabeçalho implementados e testados |
| A2 | F-07, A03, A04, A06, A35 | Host único estrangeiro, URI absoluta divergente, `OPTIONS` com `Origin`, GET, DELETE e `?q` em `/v1/health`, `/v1/hooks/*`, `/v1/mcp/challenge/*` e `/mcp` | 401 ou 403 exatos, sem `Access-Control-*`. Corrigir `docs/seguranca.md:89`. |
| A3 | A17, A33 | JSON com 100 mil `[` no POST de hook, no POST `/mcp` assinado e no stdin do `--mcp` | 400 ou erro, sem estouro de pilha e sem resposta inventada |
| A4 | A38 | Prova `mcp-*` no challenge e no POST de hook | 401 |
| A5 | A23 | Duas threads chamando `resolve_decision` com `allow` e `deny` | Exatamente uma entrega |
| A6 | A28, F-08 | ACL do `connection.json` gravado por `write_private` (`Get-Acl` no Windows; 0600/0700 no Unix). Se F-08 for corrigido: variável ignorada no release. | Só o usuário atual |
| A7 | F-05, A26 | Variantes residuais (`docker system prune -af`, `curl -F f=@x`, `curl -sd @x`, `wget --post-file`, `Invoke-WebRequest -InFile`, `git push --delete`) | `risk=true`, ou exclusão documentada |
| A8 | Transitório Windows | Repetir a suíte core no Windows N vezes no mesmo SHA | Tempo estável e nenhuma falha de timeout |
| A9 | macOS | Concluir o job macOS em `2fb608d` (113393909715) | Verde. Hoje aceito só por igualdade de árvore com `174becf`. |

### 4.3 Faltam ensaios humanos ou em sessão real

| # | Item ligado | Ensaio |
| --- | --- | --- |
| H1 | F-01, A15, A34, A44 | Claude Code real (versão fixada) com o plug-in 0.1.1 stdio. Checar `tools/list` com o app fechado e `scribe_ask` com o app aberto. Depois, numa outra conta do SO com o app fechado, subir um impostor em 127.0.0.1:porta: nenhum corpo e nenhuma credencial chegam a ele. Testar também o cancelamento pelo Claude. |
| H2 | A40–A43, N-2 | Upgrade real beta.1 → candidato no Windows, com PowerShell 5.1 e 7: script, versão instalada, reinício do Claude e token antigo inerte. |
| H3 | A20 | Toast do Windows com título `<b>&x</b>` e projeto `a&b` (`tauri-winrt-notification`). |
| H4 | F-02 residual, A25 | WebView2 instalada: alvo longo com espaços ASCII e com code points sem glifo (PUA); foco vindo da notificação e tecla A. Confirmar que a cauda aparece. |
| H5 | F-12 | Decidir sobre o perfil roaming (`app_local_data_dir`). Ensaiar em perfil de domínio. |
| H6 | Geral | Evidência de desktop instalado no Windows (os 72 headless não contam). |

## 5. Veredito parcial para C10 em 2fb608d

Critério literal (`git show 2fb608d:prompt.md`, seção 13.3):

> A Fase 5 exige **10** em Segurança. Para atingir 10, o revisor precisa documentar ao menos 10 tentativas de ataque da seção 8.1, todas sem sucesso, com o teste automatizado correspondente.

A escala da mesma seção define 10 como "nada a melhorar após tentativa deliberada de
quebra (raro)" e 9 como "excelente; só detalhes".

**C10 em `2fb608d`: DEVOLVIDO. Nota estática proposta para C: 9** (sobe de 8).

Justificativa. As duas vulnerabilidades da rodada 1 estão fechadas no código, com teste
executado no CI em `2fb608d`: A11 (repetição) e A15 (servidor falso no MCP). Os dois
achados médios (F-01, F-02) também. F-03, F-06 e F-09 foram corrigidos. Nenhum achado
médio, alto ou crítico segue aberto. A condição numérica do critério está cumprida e
sobra: 27 tentativas defendidas têm teste automatizado exato, executado no CI em
`2fb608d` (Ubuntu e Windows) ou em árvore igual (macOS). A condição de nota 10 da escala
não se sustenta, por estes motivos:
- seis tentativas seguem parciais: A13 e A39 (disponibilidade sem limite global nem
  prazo de cabeçalho), A26 (regex), A31 (sessão), A32 (GTK), A42 (marketplace pelo nome);
- A20 não foi verificado;
- F-07 ainda descreve cobertura maior que a real;
- F-08 está aberto, e F-12 não migrou o perfil roaming;
- falta o ensaio do F-01 com Claude Code real.

Todos esses pontos são baixos. A catraca da Fase 5 exige 10, então o C10 não passa. Para
a rodada 3:
- executar H1 e H3;
- fechar A1 e A2 com teste ou com aceite formal e documentado de risco;
- decidir F-08 e F-12;
- concluir o macOS em `2fb608d`.
