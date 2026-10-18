# Perguntas frequentes

## O Scribe usa modelo de IA ou chave de API?

Não. Ele observa hooks e retorna decisões humanas compatíveis; não chama um modelo nem usa o login de IA da pessoa.

## O app envia dados de sessão para a nuvem?

O projeto documenta comunicação local por loopback e ausência de telemetria. O Scribe não sincroniza sessões entre computadores.

## Qual versão está disponível?

Confira os pacotes disponíveis em [Releases](https://github.com/rexia-intel-automation/scribe/releases). Esta fonte prepara a experimental beta.2 com plugin0.1.1 stdio; beta.1 é a combinação HTTP antiga e incompatível. Nenhuma é uma versão final aceita.

## Perguntas nativas e aprovação de planos já foram aceitas?

Ainda não. Elas precisam de teste e aceite humano em uma sessão interativa nova do Claude Code. O modo não interativo `claude -p` não valida perguntas interativas AskUserQuestion.

## O Scribe substitui regras de permissão ou sandbox?

Não. Use os controles de permissão do Claude Code e as políticas da organização. O Scribe é uma interface complementar, não uma fronteira de segurança contra software executado pelo mesmo usuário.
