# Scribe v0.1 (beta): roteiro de teste com a equipe de TI

Itens marcados *(Pendente)* dependem do lote final; pule se o build não tiver a função.

Duração: uns 30 min por pessoa. Requisitos: Windows 10 ou 11, Claude Code
atualizado (`claude --version`) e uma conta já logada.

## 0. Antes de começar
- Anote a versão do Claude Code e do Windows.
- Se a empresa usa configurações gerenciadas com `disableAllHooks` ou
  `allowManagedHooksOnly`, o Scribe não recebe eventos. Anote se for o caso.

## 1. Instalação (seguindo só o README)
- [ ] Rodar o instalador `Scribe_*_x64-setup.exe` (instala só para o usuário, sem admin). Se o SmartScreen ou o antivírus avisar, anote a mensagem e use "Mais informações" → "Executar assim mesmo" se a TI permitir.
- [ ] Abrir o Scribe pelo menu Iniciar. A janela lateral aparece.
- [ ] Concluir a configuração do plugin, conforme o README.
- [ ] Fechar e reabrir o Claude Code.
- Tempo total: ____ min. Algum passo confuso? ____

## 2. Sessões
- [ ] Abrir 2 terminais com `claude` em pastas diferentes. As duas sessões aparecem no Scribe.
- [ ] `/rename teste-ti` numa delas e enviar uma mensagem. O nome aparece no Scribe acima do projeto. Títulos gerados automaticamente pelo Claude Code não aparecem; só os definidos por `/rename` ou `--name`.
- [ ] Pedir uma tarefa que leia arquivos. A gota muda de forma e a lista de passos avança.
- [ ] Encerrar uma sessão (`/exit`). Ela aparece como concluída.

## 3. Permissões (modo Manual)
Peça ao Claude: "rode `git status` nesta pasta" (Bash/PowerShell com comando completo e visível).
- [ ] O cartão aparece no Scribe com o comando inteiro visível.
- [ ] **Permitir uma vez** → o comando roda e a sessão continua.
- [ ] Repita e use **Negar** → o Claude recebe a negação e não roda.
- [ ] Peça: "crie um arquivo teste.txt com a palavra ok" (Write). O cartão mostra **Responder no terminal**, não Permitir: o conteúdo não é exibido, então a aprovação fica no terminal. É o comportamento esperado; responda no terminal.
- [ ] Peça um comando com `=` ou um segredo (por exemplo `git log --format=%h`, ou no PowerShell `$x = 1`). O cartão também manda responder no terminal, por segurança.
- [ ] Repita e não responda por 2 min → o cartão diz "Expirou" e o terminal pergunta.
- [ ] Peça algo arriscado (por exemplo "apague a pasta tmp-teste recursivamente") → o cartão marca risco e exige confirmação separada.
- [ ] Com o app FECHADO, peça uma permissão → o terminal pergunta normalmente e nada é aprovado sozinho.

## 4. Perguntas
- [ ] *(Pendente — só se estiver no build)* Peça: "me pergunte, com opções, qual linguagem prefiro". As perguntas e opções aparecem no Scribe; escolha uma e o Claude recebe a resposta. Sem o build, o cartão manda responder no terminal.
- [ ] Peça: "use o scribe_ask para perguntar se posso continuar". A pergunta aparece no Scribe e a resposta volta.
- [ ] *(Pendente — só se estiver no build)* Peça um plano em modo plan (Shift+Tab até plan). O plano aparece no Scribe com Aprovar e Continuar planejando.

## 5. Janela e gota
- [ ] Recolher e expandir. Arrastar a gota com o mouse até a outra borda.
- [ ] Atalho global para mostrar e esconder.
- [ ] Tema claro e escuro do Windows.
- [ ] `/scribe` no Claude Code traz a janela.

## 6. Registro
Para cada falha: passo, o que esperava, o que aconteceu e um print. Envie ao
Mohamad. Não envie tokens nem o conteúdo de `%APPDATA%\com.rexia.scribe`.
