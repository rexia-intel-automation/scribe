# Fase 4 — fluxo local de respostas

Implementação em 2026-10-07, autorizada pelo pedido “Pode rodar até estar
funcionando”. A Fase 4 completa ainda não foi declarada aprovada.

## Fluxo implementado

- Permitir e negar por cartão na janela; resposta JSON pelo cliente de hooks.
- Pergunta MCP com 2–4 opções, vinculada explicitamente à sessão.
- Prazos: permissão 120 s por padrão, configurável entre 1–120; pergunta 600 s.
- Contador de pendentes na janela e na gota recolhida; ordem de chegada.
- A/D com foco no cartão; Esc recolhe detalhes. Risco exige confirmação separada.
- Resultado único; expiração, cancelamento e reinício não autorizam ações.
- Decisões higienizadas persistidas em SQLite; conteúdo de arquivos excluído.
- Rota de decisões protegida pela credencial efêmera exclusiva da interface;
  a ponte nativa verifica origem local e foco antes de resolver.

## Evidência

O instrumento `app/ui/test/native-decisions.mjs` conecta à webview da compilação
Windows de produção, em perfil isolado, e usa apenas arquivos públicos de teste.
Ele verifica:

1. Permitir/Negar: a saída do executável nativo contém o comportamento escolhido.
2. Risco: primeiro clique apenas arma; o segundo devolve allow.
3. Claude real + Write permitido: arquivo criado e resposta final correspondente.
4. Claude real + Write negado: arquivo ausente e resposta final correspondente.
5. Claude real + `scribe_ask`: opção escolhida na janela retorna ao modelo.

Todos os cenários acima passaram. Também passaram a expiração real de permissão
após 120 s (arquivo ausente; Claude seguiu com recusa normal) e uma pergunta
respondida após 125 s (a opção escolhida voltou ao modelo). Os cliques de
allow/deny/risco na compilação final demoraram 106,04 / 41,84 / 40,31 ms até
a resposta do cliente. São três amostras, não uma medida de p95.

Registros: [perfil isolado](evidence/native-decisions-real.json),
[executáveis na visão do processo de teste](evidence/native-decisions-installed.json),
[integridade e saúde da instalação](evidence/decisions-installation.json) e
[captura nativa](public/phase-4/native-decisions.png).

Validações locais: 38 testes de UI, 11 Playwright, 19 Node; sete regressões
de decisões, 21 testes de contratos/núcleo e duas políticas. Clippy, lint,
formatação e build passaram. Cobertura das linhas da biblioteca: 94,41%,
incluindo decisões (90,56%) e servidor (88,26%). A medição usa os três alvos
de integração core/decisions/policies, excluindo arquivos de teste.

Os executáveis foram atualizados na visão virtualizada de `%LOCALAPPDATA%\Scribe`, com cópia de
recuperação dos anteriores. O plugin `scribe@rexia-scribe` permanece habilitado
na configuração vista pelo processo de teste; seus caminhos foram preservados. Os testes finais repetiram
allow/deny/risco/pergunta usando os executáveis e o perfil vistos dentro do pacote MSIX do Codex.
O app foi reaberto ao final sem o argumento de depuração dos testes.

Diagnóstico independente em 2026-10-07: o Claude Code externo ao pacote enxergava
um hook antigo e não encontrava o app nem a conexão no AppData real. Portanto,
a evidência acima comprova o fluxo na visão virtualizada, não a instalação do
usuário fora do Codex. O reparo e a validação externa estão em andamento; os
registros JSON preservam os resultados originais e identificam esse limite.

Falhas do instrumento corrigidas: primeira compilação omitiu
`tauri/custom-protocol` e abriu uma webview vazia; o build correto incorporou
a interface. Os testes no espelho D: encontraram 48 fixtures históricos;
a execução final apontou `SCRIBE_TEST_FIXTURES_ROOT` para os 46 arquivos
versionados, conforme o procedimento local existente. Nenhum fixture extra
foi apagado nem o limite de validação reduzido.

Os cliques do instrumento são automatizados: não são um aceite visual humano.
O alvo é a versão Windows local; estes resultados não comprovam macOS/Linux.
Não foi executada uma espera real de dez minutos nem retomada interativa pelo
humano. A pergunta tardia foi verificada em modo `-p`, com resultado efetivo;
isso não demonstra sozinho a retomada automática na interface interativa.

## Uso local

Mantenha o Scribe aberto. Quando uma sessão emitir PermissionRequest, escolha
Permitir uma vez ou Negar no cartão. Para uma ação de risco, confira o alvo e
confirme a permissão no segundo clique. Sem resposta até o prazo, o pedido
volta ao fluxo normal do Claude; o cartão informa que expirou.

Perguntas aparecem quando o Claude usa `scribe_ask` pelo plugin. Escolha uma das
opções; a resposta volta como resultado MCP. Responder uma pergunta não aprova
uma permissão separada. Se o plugin já estiver carregado, a troca dos executáveis
mantém os caminhos configurados. Novas configurações do plugin requerem reabrir
a sessão. O comando de abertura é `/scribe:scribe`.

## Limites restantes da fase/release

Notificações nativas, aceite humano/manual completo, revisão independente da
fase, auditoria final e instaladores multiplataforma ainda não são comprovados
por este fluxo. A compilação local atualizada não é uma release pública.

Decisão de arquitetura: [ADR 0010](adr/0010-respostas-de-decisoes.md).

## Correções da primeira revisão adversarial

A primeira rodada do Claude reprovou o fluxo. Estas correções aguardam novo
veredito; o relatório da rodada 1 permanece preservado.

- Hook verifica o servidor antes de enviar conteúdo. Uma chave privada independente
  do Bearer MCP assina challenge, pedido e resposta com HMAC-SHA256 de RustCrypto.
  Nonce aleatório de 128 bits liga resposta ao evento, status e bytes; challenges
  têm uso único, prazo monotônico de dois segundos e capacidade limitada. O cliente
  nativo não transmite Bearer nem chave. Windows usa SO_EXCLUSIVEADDRUSE no bind.
  A raiz de confiança é connection.json com ACL privada: o protocolo não protege
  contra processos que já possam ler esse arquivo.
- Alvos ocultos, desconhecidos ou com controles não permitem aprovação na UI.
  Responder no terminal encerra a espera sem decisão. A redação anterior foi
  preservada; entradas MCP sem alvo conhecido não expõem conteúdo arbitrário.
- Risco cobre as variantes de rm, rd/del, wget e PowerShell citadas no review.
  Extensão por configuração ainda está pendente.
- Confirmação de risco tem carência monotônica de um segundo no backend, outro
  botão na UI e rejeição de duplo clique. Atalho de permitir continua desabilitado.
- Perguntas e opções cuja redação mudaria o sentido são rejeitadas, assim como
  opções duplicadas. A resposta mantém o texto original seguro.
- Payloads sem tool_use_id usam digest privado de nome/input, só em memória,
  para deduplicar e cancelar a permissão correspondente em PostToolUse/Failure.
- Validade da resposta usa prazo monotônico, além do relógio de exibição.

Regressões locais: 35 testes Rust de core/decisões/políticas, seis do cartão e
três do cliente nativo passaram. O cliente foi exercitado contra impostor,
assinatura com Bearer, resposta sem prova, replay, evento/status/corpo alterados,
redirect e proxy. Compilação de testes desktop Windows passou. Esses checks não
constituem aprovação da fase, prova física de arraste nem ensaio da nova instalação.

O session_id MCP ainda depende do chamador autenticado: sessões que compartilham
Bearer não têm isolamento criptográfico. A [pesquisa de Mods](claude-mods.md)
propõe integração posterior; nenhum mod foi implementado para fechar esse limite.

## Correções da segunda revisão adversarial

A rodada 2 confirmou o protocolo contra impostor/reflexão/troca da decisão,
mas devolveu o lote por alvo visualmente truncado e campos da operação omitidos.
O [relatório independente](reviews/fase-4-rodada-2.md) preserva o veredito.

O alvo agora ocupa todas as linhas necessárias, sem ellipsis nem nowrap.
Aprovar exige uma ferramenta conhecida com todos os campos dentro do esquema
de metadados verificado (Bash, Read, Glob ou Grep). Vários campos são exibidos
integralmente em JSON e entram juntos na análise de risco. Campo desconhecido,
conteúdo de Write/Edit, ferramenta MCP arbitrária, texto redigido/truncado ou
caractere de controle/formatação Unicode exige resposta no terminal. Não se
persiste conteúdo omitido apenas para habilitar aprovação.

POST de hooks aceita exclusivamente challenge/HMAC; Bearer permanece no MCP
e health, mas não cria nem cancela cartões. Challenges/provas inválidas usam
quota separada da quota autenticada. No Unix, SO_REUSEADDR restaura o reinício
após TIME_WAIT; SO_REUSEPORT continua desativado e o Windows mantém bind
exclusivo. O CI macOS passou para essa correção isolada em `9c02948`.

Checks locais: 43 testes Rust desktop/core/decisões/políticas, 40 de UI,
lint/format e uma regressão Playwright de alvo longo. O teste de hooks também
confere que Bearer isolado não cancela uma decisão real e que flood de
challenges/provas ruins não consome a quota MCP/health. Estes resultados
aguardam nova revisão e CI das três plataformas; não aprovam a fase.
