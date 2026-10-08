# Configurar o plugin do Claude Code no Windows

O instalador do app e a configuração do plugin são etapas separadas. Este script
configura `scribe@rexia-scribe` no escopo do usuário, usando o app Scribe e o
`scribe-hook.exe` já instalados. Execute-o em PowerShell 5.1 ou 7 fora do
pacote MSIX do Codex, com o executável nativo `claude.exe` disponível no
`PATH`. Shims npm `.cmd` não são suportados.

## Pré-requisitos

- Instale o app Scribe pelo instalador Windows NSIS em modo `currentUser`.
- Abra o app pelo menu Iniciar e deixe-o aberto para gerar/atualizar
  `%APPDATA%\com.rexia.scribe\connection.json`.
- Confirme que `claude.exe` está no `PATH`.

Na raiz do checkout, execute:

```powershell
powershell -File .\scripts\configure-claude-plugin.ps1
```

Se usar PowerShell 7, substitua `powershell` por `pwsh` no comando. O script lê
o `port` e o `token` da conexão do app em memória. Ele lista marketplaces em
JSON apenas em memória. Se já existir o marketplace chamado `rexia-scribe`, usa
essa origem sem alterá-la; caso contrário, instala o plugin pela fonte pública
`rexia-intel-automation/scribe`. Ele envia o
`client_path` e o `port` ao comando oficial de instalação do plugin, depois envia
`client_path`, `port` e `token` como strings JSON de uma linha para
`claude plugin configure --values-stdin`. O token não é passado como argumento
de linha de comando nem gravado em arquivo adicional. Saída e erros da CLI são
capturados em memória e descartados (o JSON da listagem é usado apenas para
detectar o marketplace existente). Em caso de falha, o script mostra a etapa e
o código de saída ou timeout, sem exibir a saída da CLI. Cada chamada tem limite
de dois minutos; no timeout, somente o processo `claude.exe` iniciado pelo script
é encerrado.

O processo usa somente `claude plugin install` e `claude plugin configure`. Não
edita `settings.json`, apaga o perfil do Claude Code nem gera um token novo. Uma
reexecução reutiliza a conexão já existente. O script não aceita comandos
declarados pelo marketplace com `--yes` ou `--accept-command`; a CLI oficial
continua bloqueando esses casos sem confirmação humana.

Após a configuração, encerre e reinicie o Claude Code para carregar o plugin.

## Verificação local e limite de caminho

Em 2026-10-08, Claude Code ensaiou o script fora do MSIX: PowerShell 5.1 e 7
preservaram o marketplace Directory existente e retornaram exit 0. Um perfil
Claude novo e isolado também instalou o marketplace do GitHub com PowerShell 5.1;
o token foi salvo pelo armazenamento oficial, fora de settings.json. Esse ensaio
usa o app já instalado e não comprova o primeiro uso do app num perfil limpo.

Um perfil Claude em um caminho longo falhou ao clonar fixtures do repositório
com `Filename too long`. Nesse caso, a TI deve conferir o comprimento do caminho
e o suporte a caminhos longos do Git; o script não altera a configuração global
do Git. A limitação permanece registrada para reduzir nomes de fixtures em uma
correção posterior.
O marketplace público instala o conteúdo atualmente publicado na branch `main`,
que ainda pode refletir a fase 1 do plugin. O manifesto publicado mantém o mesmo
contrato `userConfig` usado aqui (`client_path`, `port` e `token`); isso não
significa que a versão pública do plugin já contenha os fluxos mais recentes do
app Scribe.
