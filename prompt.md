# Scribe para Claude Code — PRD, especificação técnica e plano de construção

> **Para o agente construtor.** Este documento é a sua fonte de verdade. Leia inteiro antes de escrever qualquer código. Ele define o produto, a arquitetura, os critérios de aceite, como publicar, como documentar e as fases de revisão adversarial com catracas de nota. Onde houver dúvida, siga a seção 0 (Regras de ouro). Projeto de código aberto da **RexIA Tecnologia e Automação Digital LTDA**, licença MIT.

---

## Sumário

0. Regras de ouro
1. Visão do produto (PRD)
2. Escopo por versão
3. Requisitos funcionais com critérios de aceite
4. Requisitos não funcionais
5. Arquitetura
6. Protocolo e modelo de dados
7. Especificação da interface e do personagem
8. Segurança e privacidade
9. Estrutura do repositório
10. Estratégia de testes
11. Publicação
12. Documentação
13. Fases de construção e revisão adversarial com catracas
14. Definição de pronto por versão
15. O que você nunca deve fazer
16. Textos da interface (pt-BR / en)
17. Perguntas que você deve fazer ao humano

---

## 0. Regras de ouro

1. **Não invente APIs.** Todo nome de evento de hook, campo de JSON, comando de CLI, campo de manifesto ou comportamento do Claude Code deve ser confirmado na documentação oficial (`https://code.claude.com/docs/`) antes de ser usado. Este documento descreve a intenção; quando ele divergir da documentação oficial, **a documentação vence** e você registra a divergência em `docs/adr/`.
2. **Evidência antes de código.** A Fase 0 existe para capturar payloads reais de hooks e validar suposições. Nenhuma fase seguinte começa sem a Fase 0 aprovada.
3. **Falhar de forma segura.** Se o Scribe estiver fechado, travado ou lento, o Claude Code deve continuar funcionando exatamente como funcionaria sem o plug-in. Nunca bloqueie uma sessão por falha do Scribe.
4. **Nunca aprovar sozinho.** O Scribe só devolve `allow` quando um humano clicou ou usou um atalho explícito na janela. Não existe aprovação automática na v0.1.
5. **Tudo local.** Nenhuma requisição de rede para fora de `127.0.0.1`. Nenhuma telemetria. Nenhum analytics.
6. **O Scribe nunca chama um modelo.** Ele escuta eventos e devolve decisões. Não há chave de API, nem uso do login do usuário.
7. **Registre decisões.** Toda escolha não trivial vira um ADR curto em `docs/adr/NNNN-titulo.md` (contexto, decisão, alternativas, consequências).
8. **Pergunte quando for ambíguo.** Use a seção 17. Não preencha lacunas de produto por conta própria.
9. **Não avance sem catraca.** Cada fase termina com revisão adversarial (seção 13). Fase reprovada não avança.
10. **Pequeno e funcionando vale mais que grande e pela metade.** Entregue a v0.1 completa e publicada antes de tocar na v0.2.

---

## 1. Visão do produto (PRD)

### 1.1 Problema
Quem usa o Claude Code roda várias sessões ao mesmo tempo (terminal, app Desktop, segundo plano). Quando uma sessão precisa de permissão ou faz uma pergunta, ela para e espera, muitas vezes enquanto o usuário está em outro aplicativo. Hoje é preciso voltar a cada terminal para descobrir o que está acontecendo e decidir. Isso gera tempo ocioso, troca de contexto e risco de aprovar algo sem ler.

### 1.2 Solução
**Scribe** é um plug-in de código aberto para o Claude Code, acompanhado de um pequeno app de desktop. O plug-in escuta os eventos de todas as sessões por meio de hooks e os envia a um servidor local. O app mostra uma **janela lateral sempre visível** com:
- as sessões ativas, cada uma representada por um personagem (a **gota de tinta**) cuja forma indica o estado;
- uma **caixa única de decisões** (permissões e perguntas) que o usuário resolve sem trocar de janela;
- nas versões seguintes, **agenda** (loops, tarefas, rotinas), **metas** e um **diário**.

### 1.3 Público
- Desenvolvedores que usam Claude Code diariamente, com duas ou mais sessões simultâneas.
- Primário: macOS e Linux. Secundário: Windows.

### 1.4 Objetivos
- **O1.** Reduzir o tempo entre um pedido de permissão e a decisão do usuário.
- **O2.** Permitir decidir sem sair do aplicativo em uso.
- **O3.** Tornar visível, num relance, o estado de todas as sessões.
- **O4.** Servir como projeto de portfólio da RexIA: código limpo, bem documentado, seguro e com identidade visual própria.

### 1.5 Não objetivos
- Substituir o Agent View nativo do Claude Code (`claude agents`).
- Rodar modelos, gerar texto com IA ou usar chave de API.
- Sincronizar entre máquinas, contas ou nuvem.
- Monetização, contas de usuário, login.
- Controlar sessões de outras pessoas ou acessar a máquina remotamente.

### 1.6 Princípios de design
1. **Uma forma, uma cor.** A gota é sempre da cor de destaque escolhida. O que muda é o comportamento.
2. **Tudo nasce do respingo** e volta para a gota.
3. **O estado mora no avatar.** Sem spinners genéricos.
4. **Legível em 24 px.** Toda forma usada em ícone precisa ser reconhecível nesse tamanho.
5. **Movimento acalma, detalhe sob demanda.** O padrão mostra pouco; tocar ou passar o mouse mostra mais.
6. **Semi-presente.** O Scribe só pede atenção quando há uma decisão.

### 1.7 Métricas de sucesso (medidas localmente, nunca enviadas)
- Tempo médio entre `PermissionRequest` e decisão (exibido em "Sobre" e no modo depuração).
- Zero sessões travadas por culpa do Scribe nos testes de falha (seção 10).
- Instalação do plug-in + app em menos de 5 minutos seguindo o README.

---

## 2. Escopo por versão

| Versão | Entrega | Status neste ciclo |
|---|---|---|
| **v0.1** | Plug-in + servidor local + janela lateral com **Sessões** e **Decisões** (permissões e perguntas), modo recolhido, notificação do sistema, atalho global, temas claro/escuro, pt-BR e en | **Construir e publicar** |
| **v0.2** | **Agenda**: criar e listar loops na sessão, tarefas do Desktop e rotinas na nuvem, conforme o que for tecnicamente viável | Especificado; construir após aprovação humana da v0.1 |
| **v0.3** | **Metas** (`/goal`) e **Diário** (relatos da manhã e da noite gerados localmente a partir do log de eventos) | Especificado; construir após v0.2 |

---

## 3. Requisitos funcionais com critérios de aceite

Formato: **FR-ID — título.** Critérios em Dado / Quando / Então. "Sessão" = uma sessão do Claude Code identificada por `session_id`.

### 3.1 Plug-in (v0.1)

**FR-01 — Instalação pelo marketplace.**
- Dado um repositório público com `.claude-plugin/marketplace.json`,
- quando o usuário roda `claude plugin marketplace add <owner>/<repo>` e `claude plugin install scribe@<nome-do-marketplace>`,
- então o plug-in é instalado sem erros e `claude plugin validate .` passa na raiz do repositório.

**FR-02 — Encaminhamento de eventos.**
- Dado o plug-in instalado e o app aberto,
- quando qualquer evento listado na seção 6.3 acontece numa sessão,
- então o servidor local recebe o evento em até 200 ms e a janela atualiza o estado da sessão.

**FR-03 — Falha segura com app fechado.**
- Dado o plug-in instalado e o app **fechado**,
- quando uma sessão dispara qualquer hook, incluindo `PermissionRequest`,
- então o Claude Code segue o fluxo normal (o pedido de permissão aparece no terminal), sem atraso perceptível maior que 1 s e sem mensagens de erro ruidosas para o usuário.

**FR-04 — Comando `/scribe`.**
- Quando o usuário digita `/scribe` numa sessão,
- então o app é aberto ou trazido para frente. Se o app não estiver instalado, a resposta explica como instalá-lo, com link para a documentação.

**FR-05 — Skill do Scribe.**
- A skill ensina o Claude a usar as ferramentas MCP `scribe_report` e `scribe_ask` (seção 6.5) quando fizer sentido: relatar marcos de progresso em uma linha e fazer perguntas com opções. Ela nunca instrui o Claude a burlar permissões.

### 3.2 Sessões (v0.1)

**FR-10 — Lista de sessões.**
- Quando há sessões ativas, a aba **Agora** lista cada uma com: forma da gota, nome do projeto (último segmento do `cwd`), ação atual em uma linha, tempo decorrido e origem quando disponível.
- Sessões encerradas (`SessionEnd`) ficam 10 minutos como "concluídas" e depois saem da lista (configurável).

**FR-11 — Detalhe sob demanda.**
- Quando o usuário clica ou pressiona Enter numa sessão, então ela se expande e mostra os últimos 8 passos (ferramenta e alvo resumido), sem expor conteúdo sensível (seção 8.4).

**FR-12 — Mapeamento de estado.**
- A forma da gota segue a tabela da seção 6.4. Uma sessão nunca fica "pensando" por mais de 10 minutos sem eventos; depois disso vira **Ampulheta** com o rótulo "sem notícias há N min".

### 3.3 Decisões (v0.1)

**FR-20 — Pedido de permissão na janela.**
- Dado um `PermissionRequest`,
- quando o servidor recebe o evento,
- então surge um cartão no topo da aba Agora com: projeto, nome da ferramenta, comando ou alvo **exato** (texto completo disponível ao expandir), o motivo informado quando houver, tempo de espera e os botões **Permitir uma vez** e **Negar**.

**FR-21 — Resposta ao Claude Code.**
- Quando o usuário clica em Permitir ou Negar,
- então o servidor devolve ao hook a resposta no formato documentado (intenção: `hookSpecificOutput.decision.behavior` = `allow` ou `deny`, com mensagem opcional na negação). A sessão continua em até 500 ms.

**FR-22 — "Sempre neste projeto" (condicional).**
- Só implemente se a Fase 0 comprovar um mecanismo documentado para devolver regras de permissão persistentes pela resposta do hook (por exemplo, a partir de `permission_suggestions`). Caso contrário, **não** escreva arquivos de configuração do usuário diretamente. Registre a decisão num ADR e deixe o botão fora da v0.1.

**FR-23 — Tempo limite.**
- Se ninguém decidir dentro do tempo limite (padrão 120 s, configurável e sempre menor que o timeout do hook), o servidor encerra a requisição **sem decisão**, e o Claude Code volta ao fluxo normal de permissão no terminal. O cartão passa a "Expirou: responda no terminal".

**FR-24 — Decisões concorrentes.**
- Várias decisões de sessões diferentes podem coexistir. Elas aparecem por ordem de chegada; o contador da aba e do modo recolhido reflete o total.

**FR-25 — Perguntas com opções.**
- Quando o Claude chama `scribe_ask` (MCP), então surge um cartão com a pergunta e de 2 a 4 opções. A escolha volta como resultado da ferramenta. Tempo limite padrão de 10 min; ao expirar, a ferramenta devolve "sem resposta" e o Claude segue pelo terminal.

**FR-26 — Destaque de risco.**
- Comandos que casam com padrões de risco (lista na seção 8.5) mostram uma faixa de alerta. Nesses casos, Permitir exige um segundo clique de confirmação, e o atalho de teclado fica desabilitado.

**FR-27 — Atalhos no cartão.**
- Com a janela em foco: `A` permite, `D` nega, `Esc` recolhe o cartão expandido. Atalhos nunca funcionam com a janela fora de foco.

### 3.4 Janela (v0.1)

**FR-30 — Janela lateral.** Sem bordas, sempre no topo, 372 px de largura, encostada na borda direita da tela principal, altura da área útil menos 32 px. Posição e lado (esquerdo ou direito) são lembrados.

**FR-31 — Modo recolhido.** Botão e atalho recolhem a janela numa gota de 56 px presa à borda, com contador de decisões. Clicar na gota reabre a janela. A gota pode ser arrastada e gruda na borda vertical mais próxima.

**FR-32 — Atalho global.** `Ctrl+Shift+Space` (Windows e Linux) e `Cmd+Shift+Space` (macOS) alternam entre aberta e recolhida. O atalho é configurável e, em caso de conflito, o app avisa e oferece outro.

**FR-33 — Notificação do sistema.** Com a janela recolhida ou sem foco, uma decisão nova gera uma notificação nativa ("<projeto> precisa da sua permissão"). Clicar nela abre a janela no cartão correspondente. Notificações podem ser desligadas.

**FR-34 — Ícone na bandeja ou barra de menus.** O ícone mostra a forma prioritária (seção 6.4) em 16 a 24 px e oferece um menu com Abrir, Recolher, Pausar notificações e Sair.

**FR-35 — Temas e idioma.** Claro, escuro e automático; pt-BR e en, com detecção pelo sistema e troca manual.

**FR-36 — Movimento reduzido.** Respeita a preferência do sistema: as formas ficam estáticas e as transições viram cortes simples.

### 3.5 Agenda (v0.2) — construir só após aprovação

**FR-40 — Spike de viabilidade obrigatório.** Antes de implementar, documente num ADR, com evidências: (a) como uma sessão aberta recebe uma instrução vinda de fora (hipótese: o hook `Stop` devolve a instrução como continuação no próximo fim de turno); (b) se o Claude, ao receber em linguagem natural "agende X a cada Y", usa as ferramentas de agendamento da sessão (`/loop` e cron da sessão); (c) se existe forma documentada de criar tarefas do Desktop e rotinas na nuvem sem interação manual.

**FR-41 — Criar agendamento.** Formulário com "Onde roda" (Na sessão / No Desktop / Na nuvem), projeto, frequência e instrução. Para cada opção sem mecanismo comprovado no FR-40, o app mostra **"Copiar comando"** com o texto exato, em vez de fingir que agendou.

**FR-42 — Listar agendamentos.** Lista o que o Scribe criou ou conseguiu observar, com tipo, frequência e próxima execução quando conhecida. Nunca exiba dados inventados.

### 3.6 Metas e Diário (v0.3) — construir só após v0.2

**FR-50 — Spike de metas.** Confirme na documentação como iniciar uma sessão com `/goal` (por exemplo, numa sessão em segundo plano) e como observar seu andamento e conclusão (eventos de hook, transcript ou status).

**FR-51 — Criar meta.** Projeto + condição verificável. Se o FR-50 não comprovar o início programático, o app oferece "Copiar comando".

**FR-52 — Acompanhar meta.** Mostra turnos, último parecer do avaliador quando disponível e estado (ativa, pausada, atingida, encerrada). Nunca estime progresso sem dado real; prefira "em andamento".

**FR-53 — Diário local.** Às 7h e às 19h (configurável), o app gera um relato em texto a partir do log local de eventos usando modelos de frase determinísticos, sem chamar IA. Exemplo: "Ontem à noite, 3 sessões terminaram; você aprovou 4 pedidos e negou 1." O relato fica na aba Diário e pode ser exportado em Markdown.

---

## 4. Requisitos não funcionais

| ID | Requisito | Meta |
|---|---|---|
| NFR-01 | Latência evento → janela | p95 < 200 ms |
| NFR-02 | Latência clique → resposta ao hook | p95 < 100 ms dentro do servidor |
| NFR-03 | Impacto sem app aberto | < 1 s por hook no pior caso; sem erro visível |
| NFR-04 | Memória do app em repouso | < 150 MB |
| NFR-05 | CPU em repouso | < 2% numa máquina moderna; animações pausam com a janela oculta |
| NFR-06 | Animação | 60 fps no tamanho grande; até 30 fps nas gotas pequenas |
| NFR-07 | Persistência | Sobrevive a reinício do app sem perder decisões pendentes já resolvidas pelo terminal |
| NFR-08 | Acessibilidade | Navegação por teclado completa, foco visível, leitores de tela anunciam novas decisões, contraste AA |
| NFR-09 | Internacionalização | Todos os textos em arquivos de tradução; nada de texto fixo no código |
| NFR-10 | Plataformas | macOS 13+, Windows 10+, Ubuntu 22.04+ |
| NFR-11 | Licenças | Somente dependências compatíveis com MIT; fontes com licença OFL embarcadas |

---

## 5. Arquitetura

### 5.1 Visão geral

```
Sessões do Claude Code ──hooks──▶ Servidor local do Scribe ──eventos (SSE)──▶ Janela lateral
        ▲                      (127.0.0.1, token)                 │
        └──── resposta do hook (allow/deny) ◀── decisão do usuário ┘
        └──── ferramentas MCP (scribe_report, scribe_ask) ──▶ Servidor local
```

### 5.2 Componentes

1. **Plug-in** (`plugins/scribe/`): apenas configuração e texto — `plugin.json`, `hooks/hooks.json`, `.mcp.json`, skill e comando. Sem binários.
2. **App de desktop** (`app/`): **Tauri v2**.
   - **Servidor local** em Rust (axum + tokio), embarcado no processo do app.
   - **Interface** em TypeScript + React + Vite, renderizada no webview do Tauri.
   - **Persistência** em SQLite (rusqlite) no diretório de dados do app.
3. **Documentação** (`docs/`): site estático com VitePress, publicado no GitHub Pages.

### 5.3 Transporte dos hooks — decisão da Fase 0

Avalie na Fase 0, com testes reais, e registre num ADR:

- **Opção A (preferida): hooks do tipo HTTP** apontando para `http://127.0.0.1:<porta>/v1/hooks/<evento>`. Vantagem: o plug-in não precisa de Node, Python nem binários. Verifique: campos suportados (url, headers, timeout), se headers aceitam variáveis de ambiente ou valores de `userConfig`, e o comportamento quando o servidor está fora do ar (deve seguir o fluxo normal).
- **Opção B (alternativa): hooks do tipo comando** executando um cliente pequeno que lê o JSON do stdin, chama o servidor e repassa a resposta. Exige um runtime presente na máquina do usuário; documente o requisito. Use `${CLAUDE_PLUGIN_ROOT}` para referenciar arquivos do plug-in.

Critério de escolha: atender FR-03 e a seção 8 com o mínimo de dependências. Se nenhuma opção autenticar o hook com token, a Opção A ainda pode ser aceita desde que o servidor aplique as defesas da seção 8.2 e o ADR explique o risco residual.

### 5.4 Ciclo de vida
- O app inicia com o sistema (opcional, desligado por padrão) e sobe o servidor.
- Porta padrão **7717**. Se estiver ocupada, o app mostra erro claro e permite escolher outra; o plug-in precisa conhecer a porta (via `userConfig`, variável de ambiente ou arquivo, conforme o que a Fase 0 comprovar).
- O token é gerado no primeiro uso (32 bytes aleatórios, base64url) e guardado no diretório de configuração com permissões apenas do usuário (0600 em Unix).

---

## 6. Protocolo e modelo de dados

### 6.1 API do servidor local (todas as rotas exigem as defesas da seção 8.2)

| Método | Rota | Uso |
|---|---|---|
| POST | `/v1/hooks/{event}` | Recebe o JSON do hook. Para `PermissionRequest`, mantém a resposta aberta até haver decisão ou tempo limite. Para os demais, responde imediatamente sem corpo ou com corpo vazio. |
| GET | `/v1/events` | Stream SSE para a interface (snapshot inicial + deltas). Somente a interface do app, autenticada. |
| GET | `/v1/state` | Snapshot completo (sessões, decisões pendentes). |
| POST | `/v1/decisions/{id}` | A interface resolve uma decisão: `{ "action": "allow" | "deny", "message"?: string }` ou `{ "option": number }` para perguntas. |
| POST | `/mcp` | Endpoint MCP (Streamable HTTP), se a Fase 0 confirmar suporte em `.mcp.json`; caso contrário, um servidor MCP por stdio documentado no ADR. |
| GET | `/v1/health` | `{ "ok": true, "version": "x.y.z" }` sem dados sensíveis. |

### 6.2 Entidades

```ts
type SessionState = 'respingo' | 'gota' | 'orbita' | 'pena' | 'interrogacao' | 'ampulheta' | 'mancha' | 'divisao' | 'selo';

interface Session {
  id: string;              // session_id do Claude Code
  project: string;         // último segmento do cwd
  cwd: string;             // nunca exibido inteiro por padrão
  origin?: string;         // se disponível no payload; senão omitido
  state: SessionState;
  action: string;          // uma linha, já resumida e higienizada
  startedAt: number;       // epoch ms
  lastEventAt: number;
  steps: Step[];           // últimos 20 guardados; 8 exibidos
  endedAt?: number;
}

interface Step { at: number; tool?: string; summary: string; ok?: boolean; }

interface Decision {
  id: string;              // uuid v4
  sessionId: string;
  kind: 'permission' | 'question';
  createdAt: number;
  expiresAt: number;
  // permission
  toolName?: string;
  toolInputPreview?: string;   // higienizado e truncado
  toolInputFull?: string;      // higienizado; exibido só ao expandir
  reason?: string;
  risk?: { level: 'normal' | 'high'; matches: string[] };
  // question
  question?: string;
  options?: string[];
  status: 'pending' | 'allowed' | 'denied' | 'answered' | 'expired';
  resolvedAt?: number;
}
```

### 6.3 Eventos de hook a encaminhar (confirme os nomes na Fase 0)

`SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `PermissionRequest`, `Notification`, `SubagentStart`, `SubagentStop`, `Stop`, `SessionEnd`.

Para cada evento, a Fase 0 deve salvar ao menos dois payloads reais anonimizados em `app/src-tauri/tests/fixtures/hooks/<evento>/*.json`. Os testes de contrato usam esses arquivos.

### 6.4 Mapeamento evento → forma da gota

| Evento / condição | Forma | Ação exibida |
|---|---|---|
| `SessionStart` | Respingo (1,5 s) → Gota | "Sessão iniciada" |
| `UserPromptSubmit` | Órbita | "Pensando" |
| `PreToolUse` de edição/escrita de arquivo | Pena | "Editando <arquivo>" |
| `PreToolUse` de outras ferramentas | Órbita | "<Ferramenta>: <alvo resumido>" |
| `PostToolUseFailure` | Mancha (até o próximo evento) | "Falhou: <ferramenta>" |
| `PermissionRequest` pendente | Interrogação | "Esperando sua permissão" |
| Pergunta `scribe_ask` pendente | Interrogação | "Fez uma pergunta" |
| `Notification` de espera/ociosidade | Ampulheta | "Esperando você" |
| `SubagentStart` ativo | Divisão | "N subagentes" |
| `Stop` | Gota | "Terminou o turno" |
| `SessionEnd` | Selo | "Concluída" |

**Forma prioritária** (cabeçalho, ícone da bandeja e modo recolhido): Interrogação > Mancha > Pena/Órbita/Divisão > Ampulheta > Gota.

### 6.5 Ferramentas MCP

- **`scribe_report`** `{ "text": string (≤ 140 caracteres) }` → atualiza a ação da sessão e grava um passo. Retorna `ok`.
- **`scribe_ask`** `{ "question": string (≤ 200), "options": string[] (2 a 4, cada ≤ 40) }` → cria uma decisão do tipo pergunta e bloqueia até haver resposta ou tempo limite. Retorna `{ "answer": string } | { "answer": null, "reason": "timeout" | "scribe_unavailable" }`.

As ferramentas precisam identificar a sessão. Confirme na Fase 0 como obter o `session_id` (por exemplo, por variável de ambiente ou parâmetro). Se não for possível, a ferramenta associa a pergunta ao projeto pelo `cwd` e documenta a limitação.

---

## 7. Especificação da interface e do personagem

### 7.1 Referências visuais
Os protótipos HTML fornecidos pelo humano são a referência de comportamento e estética: `scribe-claude-code.html` (janela lateral, decisões, agenda e metas) e `scribe-novo-visual.html` (catálogo das 15 formas, paleta e princípios). Se eles não estiverem anexados, peça antes de começar a Fase 3.

### 7.2 Tokens de design

| Token | Claro | Escuro | Uso |
|---|---|---|---|
| `--tinta` | `#141413` | `#f0eee6` | Texto principal, olhos |
| `--papel` | `#faf9f5` | `#1c1b19` | Fundo |
| `--papel-2` | `#f0eee6` | `#262421` | Cartões, áreas secundárias |
| `--linha` | `#e8e6dc` | `#36332e` | Bordas |
| `--pedra` | `#b0aea5` | `#8a887f` | Texto terciário |
| `--gota` | `#d97757` | `#e08562` | A gota e só ela, mais o contador |
| `--oliva` | `#788c5d` | `#9db184` | Aprovado, concluído |
| `--ceu` | `#6a9bcc` | `#8db4dd` | Links, informação |
| `--risco` | `#b3412e` | `#e5735d` | Faixa de risco |

Tipografia (OFL, embarcadas no app — nada de CDN): **Newsreader** (títulos), **Hanken Grotesk** (interface), **JetBrains Mono** (comandos). Raio padrão de 12 px nos cartões e 16 px na janela.

### 7.3 Estrutura da janela
- **Cabeçalho:** gota de 46 px com a forma prioritária, nome "Scribe", resumo ("3 sessões ativas · 1 decisão") e botão de recolher.
- **Abas:** Agora (v0.1), Agenda (v0.2), Metas (v0.3), Diário (v0.3). Abas de versões futuras **não aparecem** na v0.1.
- **Aba Agora:** seção "Esperando você" (cartões) no topo e "Sessões ativas" abaixo.
- **Estado vazio:** gota em repouso e o texto "Nenhuma sessão por aqui. Abra o Claude Code e eu acompanho."
- **Erro de conexão do plug-in** (nenhum evento recebido 5 min após abrir): dica com link para "Solução de problemas".

### 7.4 A gota — especificação
- Desenhada em `<canvas>` 2D com escala por `devicePixelRatio`.
- **Corpo:** círculo na cor `--gota` com gradiente radial sutil (claro em cima à esquerda, 15% mais escuro na borda) e um ponto de brilho elíptico em cima à esquerda (só com raio > 9 px).
- **Olhos:** duas elipses na cor `--tinta`, em ±0,3 R do centro; piscam a cada 2,5 a 6 s; somem com raio < 9 px.
- **Formas da v0.1 (obrigatórias):** Respingo, Gota, Órbita, Pena, Interrogação, Mancha, Ampulheta, Divisão, Selo, Ponto final. As demais do catálogo (Bolhas, Rastro, Crescente, Horizonte, Dobra) entram na v0.2 ou v0.3.
- **Regras:** toda forma parte da gota e volta para ela, com transição de 300 a 600 ms; nunca troca de cor; sem som.
- **Respingo:** irregular e assimétrico, como tinta de verdade (ângulos, distâncias e tamanhos desiguais). **Nunca** desenhe nada parecido com o símbolo da Anthropic.
- **Teste obrigatório de 24 px:** crie uma página de teste (`app/ui/test/formas-24px.html`) e anexe capturas em 24, 40 e 96 px na revisão da Fase 3.

### 7.5 Cartão de decisão
- Borda de 1,5 px em `--gota`; fundo branco no claro e `--papel-2` no escuro.
- Linha 1: "<projeto> · pede permissão" e o tempo de espera ao vivo.
- Título em Newsreader (por exemplo, "Rodar um comando no terminal").
- Bloco mono com o comando: até 3 linhas, com "ver tudo" para expandir.
- Motivo em itálico quando existir.
- Faixa de risco quando aplicável (FR-26).
- Botões: Permitir uma vez (oliva), Negar (contorno). "Sempre neste projeto" só se o FR-22 for aprovado.
- Depois da decisão: o cartão vira uma linha de confirmação por 5 s ("Permitido às 14:32") e some.

---

## 8. Segurança e privacidade

### 8.1 Modelo de ameaças (documente em `SECURITY.md` e `docs/seguranca.md`)
- Outro processo local tentando aprovar permissões chamando o servidor.
- Página web maliciosa tentando falar com `127.0.0.1` (CSRF, DNS rebinding).
- Vazamento de segredos (tokens, senhas, variáveis de ambiente) pelos logs ou pela interface.
- Usuário aprovando algo perigoso sem perceber.
- Atualização maliciosa do plug-in ou do app.

### 8.2 Defesas obrigatórias do servidor
1. Escutar **somente** em `127.0.0.1` (nunca `0.0.0.0` nem `::`).
2. Validar o header `Host` (`127.0.0.1:<porta>` ou `localhost:<porta>`) e **rejeitar** qualquer requisição com `Origin` de navegador que não seja a do próprio webview do app.
3. Sem CORS: não envie `Access-Control-Allow-Origin`.
4. Exigir token nas rotas da interface (`/v1/events`, `/v1/state`, `/v1/decisions`). Nas rotas de hook, exigir token se a Fase 0 comprovar que é possível; senão, aplicar 1 a 3 mais limite de taxa.
5. **Rotas de hook nunca resolvem decisões.** Só `/v1/decisions/{id}`, autenticada e vinda da interface, pode produzir `allow`.
6. Limite de tamanho de corpo (1 MB) e de taxa (por exemplo, 50 requisições por segundo).
7. Comparação de token em tempo constante.

### 8.3 Privacidade
- Nada sai da máquina. Proibido: telemetria, verificação remota de atualização sem consentimento, fontes ou scripts de CDN.
- O log de eventos guarda apenas o necessário para a interface e o diário. Retenção padrão de 14 dias, configurável, com botão "Apagar histórico".

### 8.4 Higienização
- Antes de guardar ou exibir `tool_input`, aplique redação de segredos: padrões de chaves comuns (`sk-`, `ghp_`, `xox`, `AKIA`, JWT), `Authorization: ...`, `password=`, `token=`, valores de `.env`. Substitua por `••••`.
- Nunca guarde nem exiba o ambiente completo do processo.
- Caminhos absolutos aparecem encurtados (`~/…/projeto/arquivo.ts`).

### 8.5 Padrões de risco (FR-26) — lista inicial, extensível por configuração
`rm -rf`, `sudo`, `git push --force`/`-f`, `git reset --hard`, `curl … | sh`/`bash`, `chmod -R 777`, `dd if=`, `mkfs`, `DROP TABLE`, `--prod`/`production`, `kubectl delete`, `terraform apply`, `npm publish`.

### 8.6 Cadeia de suprimentos
- Dependências fixadas (lockfiles versionados), `cargo audit` e `npm audit` no CI, Dependabot ativado.
- Releases com checksums SHA-256 e notas assinadas pela tag Git.

---

## 9. Estrutura do repositório

```
rexia-scribe/
├─ .claude-plugin/
│  └─ marketplace.json          # o repositório é o marketplace
├─ plugins/
│  └─ scribe/
│     ├─ .claude-plugin/plugin.json
│     ├─ hooks/hooks.json        # pastas de componentes ficam na raiz do plug-in, nunca dentro de .claude-plugin/
│     ├─ .mcp.json
│     ├─ skills/scribe/SKILL.md
│     └─ commands/scribe.md
├─ app/
│  ├─ src-tauri/                 # Rust: servidor local, persistência, janela, bandeja, atalhos
│  │  ├─ src/
│  │  └─ tests/fixtures/hooks/   # payloads reais anonimizados (Fase 0)
│  └─ ui/                        # React + TypeScript + Vite
│     ├─ src/gota/               # renderizador e formas
│     ├─ src/i18n/{pt-BR,en}.json
│     └─ test/
├─ docs/                         # VitePress (pt-BR e en)
│  ├─ adr/
│  └─ reviews/                   # relatórios de revisão adversarial
├─ .github/
│  ├─ workflows/{ci.yml,release.yml,docs.yml}
│  ├─ ISSUE_TEMPLATE/
│  └─ PULL_REQUEST_TEMPLATE.md
├─ README.md                     # inglês, com link para o README em português
├─ README.pt-BR.md
├─ LICENSE                       # MIT — Copyright (c) 2026 RexIA Tecnologia e Automação Digital LTDA
├─ SECURITY.md
├─ CONTRIBUTING.md
├─ CODE_OF_CONDUCT.md            # Contributor Covenant 2.1
└─ CHANGELOG.md                  # Keep a Changelog + SemVer
```

Regras do marketplace (confirme na documentação): caminhos `source` relativos à raiz do marketplace (por exemplo `./plugins/scribe`), não a `.claude-plugin/`; não declare hooks dentro da entrada do marketplace — eles ficam em `hooks/hooks.json` do plug-in; não use nomes de marketplace reservados pela Anthropic; use `$schema` nos manifestos para validação no editor.

---

## 10. Estratégia de testes

| Camada | Ferramenta | O que cobrir | Meta |
|---|---|---|---|
| Rust (servidor, decisões, persistência, higienização) | `cargo test` | Unidades e integração com cliente HTTP real | ≥ 85% de linhas no núcleo de decisões e segurança |
| Contrato de hooks | `cargo test` + fixtures da Fase 0 | Cada evento real → estado esperado; respostas no formato documentado | 100% dos eventos da seção 6.3 |
| Segurança | Testes dedicados | Host inválido, Origin externo, sem token, token errado, corpo grande, taxa, decisão por rota de hook | Todos devem falhar com segurança |
| Falha segura | Script de integração | App fechado, servidor travado, resposta lenta, porta ocupada | O Claude Code segue o fluxo normal (FR-03) |
| UI | Vitest + Testing Library | Componentes, i18n, acessibilidade (axe) | Sem violações sérias de acessibilidade |
| E2E da janela | Playwright contra a UI com servidor simulado | Chegada de decisão, atalhos, recolher, expirar | Fluxos principais |
| Visual | Playwright (capturas) | As formas em 24/40/96 px, claro e escuro | Revisão humana na Fase 3 |
| Manual com Claude Code real | Roteiro em `docs/teste-equipe-ti.md` | Instalar pelo marketplace, 3 sessões, permitir, negar, expirar, app fechado | Executado antes de cada release |

O CI (`ci.yml`) roda: lint (clippy, eslint), formatação (rustfmt, prettier), testes, `npm audit`/`cargo audit`, `claude plugin validate .` (se o CLI estiver disponível no runner; senão, validação contra os JSON Schemas) e build do app nas três plataformas.

---

## 11. Publicação

1. **Repositório público no GitHub** (nome final a confirmar; sugestão `rexia/scribe`). Ative Issues, Discussions, Dependabot, varredura de segredos e proteção da branch `main` (PR obrigatório e CI verde).
2. **Versionamento SemVer.** A tag `vX.Y.Z` dispara `release.yml`.
3. **Release do app** com `tauri-action`: binários para macOS (universal), Windows (MSI) e Linux (AppImage e .deb), mais `SHA256SUMS.txt`. Assinatura e notarização da Apple ficam documentadas como passo opcional; sem certificado, o README explica como abrir o app no macOS com segurança.
4. **Distribuição do plug-in:** o próprio repositório é o marketplace. A versão do plug-in em `plugin.json` acompanha a tag.
5. **Instalação documentada:**
   ```
   claude plugin marketplace add rexia/scribe
   claude plugin install scribe@<nome-do-marketplace>
   ```
   E o download do app na página de Releases.
6. **Site de documentação** com VitePress no GitHub Pages (`docs.yml`), em pt-BR e en.
7. **Materiais de divulgação** em `docs/public/`: GIF de 10 a 15 s da janela recebendo e aprovando uma decisão, capturas claro/escuro e o vídeo de apresentação fornecido pelo humano.
8. **Aviso legal** no README, no site e no "Sobre" do app: *"Projeto independente de código aberto da RexIA. Sem afiliação com a Anthropic. Claude e Claude Code são marcas da Anthropic, citadas apenas para descrever compatibilidade."*

---

## 12. Documentação

### 12.1 README (en e pt-BR, mesma estrutura)
1. Nome, frase de uma linha e GIF.
2. Por que existe (3 frases).
3. Recursos da versão atual.
4. Instalação (plug-in + app) em até 5 passos.
5. Como funciona (diagrama simples).
6. Segurança e privacidade em 5 tópicos, com link para `SECURITY.md`.
7. Configuração (porta, atalho, notificações, retenção).
8. Solução de problemas (os 5 problemas mais prováveis).
9. Roteiro de versões.
10. Contribuir, licença e aviso legal.

### 12.2 Site de documentação
Páginas: Introdução · Instalação · Primeiros passos · Como funciona · Referência de eventos e formas · Segurança · Configuração · Solução de problemas · FAQ · Arquitetura · ADRs · Contribuir · Changelog.

### 12.3 Código
- Rust: `rustdoc` em toda função pública do servidor, das decisões e da higienização.
- TypeScript: TSDoc nos componentes e no renderizador da gota.
- Cada ADR no formato curto da regra 7.

### 12.4 Changelog
Keep a Changelog, com seções Adicionado, Alterado, Corrigido e Segurança.

---

## 13. Fases de construção e revisão adversarial com catracas

### 13.1 Protocolo de revisão adversarial
Ao fim de cada fase:

1. **Revisor independente.** Abra um subagente revisor com contexto limpo, que **não** participou da implementação da fase. Ele recebe apenas: este documento, o diff da fase, os testes e os artefatos (capturas, logs).
2. **Postura.** O revisor deve tentar quebrar o trabalho: casos de borda, falhas, ataques, divergências da documentação oficial e da especificação. Ele precisa listar no mínimo **5 tentativas de quebra** com o resultado de cada uma.
3. **Notas de 1 a 10** para cada área aplicável (13.2), cada uma com **evidência**: arquivo e linha, teste que falha, passo de reprodução ou trecho de documentação. Nota sem evidência é inválida.
4. **Relatório** em `docs/reviews/fase-N-rodada-M.md`, com notas, evidências, problemas classificados (crítico, alto, médio, baixo) e veredito.
5. **Catraca.** A fase só passa se **todas** as áreas atingirem a nota mínima da tabela 13.3 e não restar nenhum problema crítico ou alto.
6. **Correção e nova rodada.** Se reprovar, corrija e abra nova rodada com outro revisor de contexto limpo. Corrigir e revisar até atingir os critérios de aprovação, mantendo as notas mínimas e sem limite fixo de rodadas. Alteração autorizada pelo humano em 2026-10-04 após a terceira reprovação da Fase 0; os relatórios anteriores permanecem preservados.
7. **Contra inflação de nota.** Notas 10 exigem justificativa explícita de por que nada pode melhorar após tentativas deliberadas de quebra. Se todas as notas de uma rodada forem 9 ou 10 com menos de 3 problemas encontrados, a rodada é inválida e deve ser refeita por outro revisor.

### 13.2 Escala e áreas

**Escala:**
- **1–3:** quebrado, inseguro ou fora da especificação.
- **4–5:** funciona em parte; problemas graves.
- **6–7:** funciona; problemas relevantes a corrigir.
- **8:** sólido; só problemas menores.
- **9:** excelente; só detalhes.
- **10:** nada a melhorar após tentativa deliberada de quebra (raro).

**Áreas avaliadas:**
- **A. Conformidade com o Claude Code:** manifestos, hooks e MCP conforme a documentação oficial e os payloads reais.
- **B. Correção funcional:** os critérios de aceite da fase passam.
- **C. Segurança:** seção 8.
- **D. Robustez e falha segura:** FR-03, tempos limite, reinícios, concorrência.
- **E. Qualidade de código:** clareza, modularidade, nomes, ausência de duplicação, tratamento de erros.
- **F. Testes:** cobertura, relevância, determinismo.
- **G. Fidelidade visual e UX:** tokens, formas, princípios de design, teste de 24 px.
- **H. Acessibilidade:** teclado, leitor de tela, contraste, movimento reduzido.
- **I. Desempenho:** NFR-01 a NFR-06.
- **J. Documentação:** README, site, ADRs, comentários de código.
- **K. Build e release:** CI, artefatos, checksums, instalação limpa.

### 13.3 Fases e catracas (nota mínima por área; "—" = não avaliada na fase)

| Fase | Objetivo | Entregáveis | A | B | C | D | E | F | G | H | I | J | K |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **0. Verificação** | Confirmar suposições com evidência | Relatório em `docs/adr/0001-verificacao.md` com links da documentação; fixtures reais de cada evento; decisão de transporte (5.3); respostas às perguntas dos FR-22, FR-25 e 6.5 | **9** | 8 | 8 | 8 | — | 7 | — | — | — | 8 | — |
| **1. Plug-in** | Esqueleto instalável | `marketplace.json`, `plugin.json`, `hooks.json`, `.mcp.json`, skill, comando; `claude plugin validate .` passando; instalação local testada | **9** | 8 | 8 | 8 | 8 | 7 | — | — | — | 8 | 8 |
| **2. Servidor local** | Receber eventos, manter estado, persistir | API da seção 6.1 (exceto decisões), mapeamento 6.4, SQLite, higienização 8.4, testes de contrato | 9 | 9 | **9** | **9** | 8 | **9** | — | — | 8 | 8 | — |
| **3. Janela e gota** | Interface da v0.1 sem decisões | Janela, modo recolhido, bandeja, atalho, temas, i18n, as 10 formas, página de 24 px com capturas | 8 | 8 | 8 | 8 | 8 | 8 | **9** | **9** | 8 | 8 | — |
| **4. Decisões fim a fim** | Permissões e perguntas | FR-20 a FR-27, notificações, testes E2E e manuais com Claude Code real | **9** | **9** | **9** | **9** | 8 | **9** | 8 | 8 | 8 | 8 | — |
| **5. Segurança** | Auditoria dedicada | Testes da seção 8, revisão de dependências, `SECURITY.md` e modelo de ameaças | 9 | 9 | **10** | 9 | 8 | 9 | — | — | — | 9 | 8 |
| **6. Docs e release v0.1** | Publicar | README pt-BR/en, site, GIF, CHANGELOG, release com binários e checksums, instalação limpa num computador novo seguindo só o README | 9 | 9 | 9 | 9 | 8 | 8 | 8 | 8 | 8 | **9** | **9** |
| **7. v0.2 Agenda** | Após aprovação humana | ADR do spike FR-40, FR-41 e FR-42, abas e testes | **9** | 9 | 9 | 9 | 8 | 9 | 8 | 8 | 8 | 9 | 8 |
| **8. v0.3 Metas e Diário** | Após v0.2 | ADR do spike FR-50, FR-51 a FR-53, testes, docs e release | **9** | 9 | 9 | 9 | 8 | 9 | 8 | 8 | 8 | 9 | 9 |

> A Fase 5 exige **10** em Segurança. Para atingir 10, o revisor precisa documentar ao menos 10 tentativas de ataque da seção 8.1, todas sem sucesso, com o teste automatizado correspondente.

### 13.4 Ritual de fim de fase
1. Todos os testes verdes e CI verde.
2. Relatório de revisão aprovado na catraca.
3. `CHANGELOG.md` atualizado (seção "Não lançado").
4. Resumo de até 10 linhas para o humano: o que foi feito, notas finais, riscos conhecidos e próximo passo.

---

## 14. Definição de pronto por versão

**v0.1 está pronta quando:**
- [ ] Fases 0 a 6 aprovadas nas catracas.
- [ ] Instalação limpa em macOS e Linux (e Windows, se possível) seguindo só o README.
- [ ] Com 3 sessões reais: estados corretos, uma permissão aprovada, uma negada, uma expirada e uma pergunta respondida pela janela.
- [ ] Com o app fechado: o Claude Code funciona normalmente (FR-03).
- [ ] Release `v0.1.0` publicada com binários, checksums, notas e site de docs no ar.
- [ ] Aviso legal presente no README, no site e no app.

**v0.2 e v0.3:** os mesmos critérios, mais os ADRs de viabilidade, e nenhuma função que finja executar algo que não executa.

---

## 15. O que você nunca deve fazer

- Inventar campos de hook, eventos, comandos ou formatos de resposta.
- Aprovar permissões automaticamente, por regra, padrão ou "modo confiável".
- Escrever nos arquivos de configuração do Claude Code ou do usuário sem um mecanismo documentado e sem ação explícita do usuário.
- Abrir o servidor para fora de `127.0.0.1` ou habilitar CORS.
- Enviar qualquer dado para fora da máquina, incluindo telemetria e analytics.
- Chamar modelos de IA ou pedir chave de API.
- Usar o logotipo, o símbolo de faísca ou qualquer ilustração da Anthropic, ou dizer que o projeto é oficial.
- Embutir fontes proprietárias ou carregar fontes e scripts de CDN.
- Declarar hooks dentro da entrada do marketplace ou colocar pastas de componentes dentro de `.claude-plugin/`.
- Usar nomes de marketplace reservados.
- Mostrar dados inventados na interface (progresso, próxima execução, contadores).
- Pular uma catraca ou rebaixar a nota mínima sem autorização do humano.
- Exibir segredos sem higienização ou registrar o ambiente do processo.

---

## 16. Textos da interface (pt-BR / en)

| Chave | pt-BR | en |
|---|---|---|
| `header.sessions` | {n} sessões ativas | {n} active sessions |
| `header.decisions` | {n} decisão esperando / {n} decisões esperando | {n} decision waiting / {n} decisions waiting |
| `tab.now` | Agora | Now |
| `tab.schedule` | Agenda | Schedule |
| `tab.goals` | Metas | Goals |
| `tab.journal` | Diário | Journal |
| `section.waiting` | Esperando você | Waiting for you |
| `section.sessions` | Sessões ativas | Active sessions |
| `perm.origin` | {projeto} · pede permissão | {project} · asks for permission |
| `perm.allow` | Permitir uma vez | Allow once |
| `perm.deny` | Negar | Deny |
| `perm.confirmRisk` | Confirmar: este comando é arriscado | Confirm: this command is risky |
| `perm.expired` | Expirou: responda no terminal | Expired: answer in the terminal |
| `perm.allowedAt` | Permitido às {hora} | Allowed at {time} |
| `question.origin` | {projeto} · tem uma pergunta | {project} · has a question |
| `empty.title` | Nenhuma sessão por aqui. | No sessions here. |
| `empty.body` | Abra o Claude Code e eu acompanho. | Open Claude Code and I'll keep watch. |
| `notify.permission` | {projeto} precisa da sua permissão | {project} needs your permission |
| `notify.question` | {projeto} tem uma pergunta | {project} has a question |
| `state.thinking` | Pensando | Thinking |
| `state.editing` | Editando {arquivo} | Editing {file} |
| `state.failed` | Falhou: {ferramenta} | Failed: {tool} |
| `state.waiting` | Esperando você | Waiting for you |
| `state.silent` | Sem notícias há {n} min | No updates for {n} min |
| `state.done` | Concluída | Done |
| `about.legal` | Projeto independente de código aberto da RexIA. Sem afiliação com a Anthropic. Claude e Claude Code são marcas da Anthropic. | Independent open-source project by RexIA. Not affiliated with Anthropic. Claude and Claude Code are trademarks of Anthropic. |

---

## 17. Perguntas que você deve fazer ao humano

Faça antes da fase indicada, de uma vez, numa lista curta:

1. **Antes da Fase 1:** nome final do repositório e do marketplace (confirmar disponibilidade no GitHub e no npm).
2. **Antes da Fase 3:** anexar os protótipos HTML de referência (7.1) e confirmar se a cor padrão da gota é argila.
3. **Antes da Fase 6:** certificados de assinatura (Apple, Windows) disponíveis ou não; domínio próprio para a documentação ou GitHub Pages padrão.
4. **Antes da Fase 7:** aprovação explícita para iniciar a v0.2.
5. **Sempre que a Fase 0 contrariar este documento:** apresentar a divergência e a proposta antes de seguir.

---

*Fim do documento. Comece pela Fase 0.*
