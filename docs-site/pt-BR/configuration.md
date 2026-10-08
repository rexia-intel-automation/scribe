# Configuração

## Beta.1 publicada

O app Windows `v0.1.0-beta.1` usa o plugin `0.1.0` e sua conexão HTTP local. O script original de configuração só é compatível com o plugin da mesma tag beta, com o app beta aberto. O branch atual do marketplace usa o plugin `0.1.1` por stdio e não funciona com o app/helper beta.1. Não misture as versões nem execute o script atual do repositório com a beta.1. A versão `0.1.0` do app não distingue a beta.1 do candidato stdio.

## Candidato stdio

A combinação candidata de app/helper `0.1.0` e plugin `0.1.1` por stdio ainda não foi publicada nem aceita. As instruções do pacote exigirão os checksums, o SHA de origem em `BUILD-METADATA.txt` e a CLI nativa do Claude Code atualizada. O script candidato atualiza o marketplace/plugin e confere o plugin `0.1.1` habilitado no escopo do usuário, incluindo a versão de pasta quando informada, antes de configurar. Não use essas instruções com a beta.1.

Abra o app combinado uma vez para criar o arquivo de conexão antes de configurar o plugin stdio; o app pode fechar durante a configuração. Com o app fechado, `/mcp` deve continuar mostrando o servidor conectado. Uma chamada de ferramenta que precisa do app informa indisponibilidade; reabra o app e repita a chamada na mesma sessão do Claude Code. Esses são resultados esperados para o ensaio, ainda sem aceite humano.

As configurações do Scribe incluem idioma, tema, atalho global, notificações, retenção do histórico e porta da conexão local. Altere-as pela tela Configurações do app. Notificações nativas continuam em revisão e não fazem parte da beta.1 publicada.

Não cole `%APPDATA%\com.rexia.scribe` em chamados ou conversas. Políticas gerenciadas do Claude Code, como `disableAllHooks` ou `allowManagedHooksOnly`, podem impedir hooks instalados pelo usuário; peça ao administrador para verificar a política da organização em vez de alterá-la por conta própria.
