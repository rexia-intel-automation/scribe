# Scribe v0.1.0-beta.1: roteiro de teste com a equipe de TI

Build: instalador `Scribe_0.1.0_x64-setup.exe` do commit `ef829f8`, o mesmo do
pre-release `v0.1.0-beta.1`. Confira o SHA-256 publicado no release antes de
instalar. Este é um beta experimental: as caixas abaixo são o que se **espera**
ver, não resultados já aprovados.

Duração: uns 30 min por pessoa. Requisitos: Windows 10 ou 11, Claude Code
instalado pelo instalador oficial (`claude.exe`; a instalação via npm não é
suportada neste beta), logado e atualizado (`claude --version`). Teste numa
sessão **interativa nova** do Claude Code: num ensaio com `claude -p`, a
ferramenta AskUserQuestion não foi oferecida.

## 0. Antes de começar
- Anote a versão do Claude Code e do Windows.
- Se a empresa usa configurações gerenciadas com `disableAllHooks` ou
  `allowManagedHooksOnly`, o Scribe não recebe eventos. Anote se for o caso.

## 1. Instalação (seguindo só o README)
- [ ] Rodar `Scribe_0.1.0_x64-setup.exe`. Instala só para o usuário, sem admin.
  O instalador não é assinado: se o SmartScreen ou o antivírus avisar, anote a
  mensagem exata e siga a política da TI.
- [ ] Abrir o Scribe pelo menu Iniciar. A janela lateral aparece.
- [ ] Com o Scribe aberto, rodar `configure-claude-plugin.ps1` no PowerShell
  (o 5.1 do Windows serve). A mensagem esperada é "Scribe plugin configured…".
  Se falhar, anote a etapa e o código informados.
- [ ] Fechar e reabrir o Claude Code.
- Tempo total: ____ min. Algum passo confuso? ____

## 2. Sessões
- [ ] Abrir 2 terminais com `claude` em pastas diferentes. As duas sessões aparecem no Scribe.
- [ ] `/rename teste-ti` numa delas e enviar uma mensagem. O nome aparece no
  Scribe acima do projeto. Títulos gerados automaticamente não aparecem; só os
  definidos por `/rename` ou `--name`.
- [ ] Pedir uma tarefa que leia arquivos. A gota muda de forma e a lista de passos avança.
- [ ] Encerrar uma sessão (`/exit`). Ela aparece como concluída.

## 3. Permissões (modo Manual)
Peça ao Claude: "rode `git status` nesta pasta" (Bash ou PowerShell, com o comando completo e visível).
- [ ] O cartão aparece no Scribe com o comando inteiro visível.
- [ ] **Permitir uma vez** → o comando roda e a sessão continua.
- [ ] Repita e use **Negar** → o Claude recebe a negação e não roda.
- [ ] Peça "crie um arquivo teste.txt com a palavra ok" (Write). O cartão
  mostra **Responder no terminal**, não Permitir: o conteúdo não aparece no
  cartão, então a aprovação fica no terminal. É o esperado.
- [ ] Peça um comando com `=` ou com cara de segredo (`git log --format=%h`,
  ou `$x = 1` no PowerShell). O cartão também manda responder no terminal, por segurança.
- [ ] Repita uma permissão e não responda por 2 min → o cartão diz "Expirou" e o terminal pergunta.
- [ ] Peça algo arriscado ("apague a pasta tmp-teste recursivamente"). O cartão
  marca risco; Permitir arma e a confirmação, em outro botão, só libera depois de 1 s.
- [ ] Com o app FECHADO, peça uma permissão → o terminal pergunta normalmente e nada é aprovado sozinho.

## 4. Perguntas e plano
- [ ] **Pergunta simples:** "use a ferramenta AskUserQuestion para me perguntar
  qual cor eu prefiro, Azul ou Verde". O Scribe mostra a pergunta e as opções;
  escolha uma e o Claude recebe a resposta.
- [ ] **Múltipla escolha:** "use AskUserQuestion com uma pergunta de múltipla
  escolha sobre frutas (Maçã, Banana, Uva) e permita várias respostas". Marque
  duas; o Claude recebe as duas.
- [ ] **Outro:** numa pergunta, escreva uma resposta própria em "Outro". O Claude recebe o texto.
- [ ] **Responder no terminal:** num cartão de pergunta, clique em "Responder no
  terminal". A pergunta passa a ser feita no terminal na hora.
- [ ] **Plano recusado:** Shift+Tab até o modo plan; "planeje em 3 passos como
  criar um arquivo ola.txt, sem executar". No Scribe, **Continuar planejando**
  com um comentário curto. O Claude recebe o comentário e refaz o plano.
- [ ] **Plano aprovado:** no segundo plano, clique em **Aprovar** (arma), espere
  1 s e clique em **Confirmar** (outro botão). O Claude sai do modo plan. Anote
  para qual modo a sessão voltou: ela pode retomar o modo anterior.
- [ ] Planos ou perguntas com `x = y` ou com palavras como "token"/"senha" vão
  para o terminal. Isso é proteção, não falha; anote se acontecer com frequência.
- [ ] `scribe_ask`: "use o scribe_ask para perguntar se posso continuar". A pergunta aparece no Scribe e a resposta volta.

## 5. Janela e gota
- [ ] Recolher e expandir. Arrastar a gota com o mouse até a outra borda.
- [ ] Atalho global para mostrar e esconder.
- [ ] Tema claro e escuro do Windows.
- [ ] `/scribe` no Claude Code traz a janela.

## 6. Registro
Para cada falha, um relato em texto basta: passo, o que esperava e o que
aconteceu. Print é opcional. Envie ao Mohamad. Não envie tokens, o conteúdo de
`%APPDATA%\com.rexia.scribe` nem conversas privadas.
