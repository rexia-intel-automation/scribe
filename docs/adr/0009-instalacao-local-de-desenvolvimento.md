# ADR 0009 — instalação local de desenvolvimento

- Data: 2026-10-07.
- Estado: instalado para o humano; não é release da v0.1.

## Contexto

O humano autorizou: “Pode instalar, depois resolvemos a parte visual, quero
lançar o projeto o quanto antes”. A observação de sessões já funciona, mas
os cartões de permissão/perguntas e as notificações de decisões faltam.
A revisão R8 permanece G8/H9; o novo pedido não é um aceite visual retroativo.

## Decisão

Instalar o app e o cliente nativo em `%LOCALAPPDATA%\Scribe`, com atalho no
menu Iniciar, e o plug-in `scribe@rexia-scribe` no escopo de usuário, pelo
CLI oficial. A origem local é o espelho D:, que permite usar o código em
desenvolvimento antes de publicar. O app usa seu perfil padrão, sem os
overrides e as fixtures da janela de teste anterior.

Caminho e porta são configurados pelo CLI. O token é enviado por stdin a
`plugin configure --values-stdin` e salvo pelo armazenamento seguro do Claude;
não aparece na linha de comando ou nas evidências. A configuração local do
app continua privada. Testes excluem outras personalizações do usuário, mas
usam o registro instalado, as opções salvas e os hooks do próprio plug-in.

O aceite visual deixa de bloquear esta instalação e o desenvolvimento das
decisões, conforme a prioridade expressa pelo humano. Não declaramos a Fase 3
aprovada nem reduzimos suas notas. Arraste físico, testes humanos das decisões,
segurança e publicação continuam como trabalho de entrega, sem inventar aceites.

## Abertura sem prender o comando

O ensaio com o app fechado reproduziu um defeito em `scribe-hook --open`:
o processo do cliente terminava, mas o app herdava seus canais capturados,
impedindo o comando chamador de encerrar. A regressão usa um executável público
que fica vivo após o lançamento e verifica que o cliente fecha seus canais
em até um segundo, sem matar o aplicativo.

A abertura agora redireciona stdin/stdout/stderr para null. No Windows isso
sozinho não resolveu: também é necessário remover `HANDLE_FLAG_INHERIT` dos
três handles originais no processo curto `--open`. Não fechamos os handles,
não alteramos o terminal pai e não mudamos o transporte dos hooks.
`GetStdHandle` e `SetHandleInformation` são APIs documentadas; não requerem
shell, privilégio elevado, dependência nova ou Rust nightly.

Referências: [configuração oficial dos plug-ins](https://code.claude.com/docs/en/plugins/cli-reference),
[GetStdHandle](https://learn.microsoft.com/en-us/windows/console/getstdhandle) e
[SetHandleInformation](https://learn.microsoft.com/en-us/windows/win32/api/handleapi/nf-handleapi-sethandleinformation).

## Consequências

Novas sessões locais do Claude carregam o plug-in; sessões já abertas precisam
ser reabertas para aplicar a configuração. O comando `/scribe:scribe` evita
colisão com o alias `/scribe`. O app acompanha sessões; pedidos de permissão
continuam sendo resolvidos no Claude. `scribe_ask` ainda devolve indisponível.

Não há MSI, atualização automática ou release publicada. Os binários são uma
compilação local de desenvolvimento; mudanças posteriores precisam atualizar
essa instalação. Antes de lançamento continuam necessários decisões completas,
auditoria e empacotamento/testes nas plataformas previstas.
