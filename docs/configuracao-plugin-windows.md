# Configurar o plugin do Claude Code no Windows

O instalador do app e a configuração do plugin são etapas separadas. Este script
configura `scribe@rexia-scribe` no escopo do usuário, usando o app Scribe e o
`scribe-hook.exe` já instalados. Execute-o em PowerShell 5.1 ou 7 fora do
pacote MSIX do Codex, com o executável nativo `claude.exe` disponível no
`PATH`. Shims npm `.cmd` não são suportados.

## Pré-requisitos

- Instale o app Scribe pelo instalador Windows NSIS em modo `currentUser`.
- Abra o app pelo menu Iniciar pelo menos uma vez para criar
  `%APPDATA%\com.rexia.scribe\connection.json`. A janela não precisa ficar
  aberta durante a configuração do plugin.
- Use o plugin candidato `0.1.1` com um helper que responda a
  `scribe-hook.exe --mcp-check` com `mcp_transport: attested-stdio-v1` e tenha
  `hook_key` independente no arquivo de conexão. A beta `0.1.0-beta.1` usa
  HTTP/Bearer e é incompatível com este plugin candidato. Atualize app/helper e
  plugin juntos. Se atualizar o app primeiro, a configuração MCP antiga pode
  retornar HTTP 401 e aparecer como “MCP server failed”; atualize o plugin para
  0.1.1 e execute novamente este script.
- Confirme que `claude.exe` está no `PATH`.

O número de pacote `0.1.0` sozinho não comprova compatibilidade: a beta.1 usa o
mesmo número. Confira o commit `source_sha` dos artefatos e a capacidade exigida
pelo script. A tag mínima compatível será registrada ao publicar a release.

Na raiz do checkout, execute:

```powershell
powershell -File .\scripts\configure-claude-plugin.ps1
```

Se usar PowerShell 7, substitua `powershell` por `pwsh` no comando. O script lê
a conexão em memória e confirma que `hook_key` existe, tem formato válido e é
diferente do token interno. Ele não consulta HTTP nem precisa do token para
configurar o plugin. A única opção enviada à CLI é `client_path`; porta e token
não fazem parte do `userConfig` atual. Antes de consultar marketplaces ou alterar
a instalação, o script executa `--mcp-check` com limite de três segundos e
valida o marcador `attested-stdio-v1`; stdout e stderr do helper ficam apenas em
memória. Esse marcador comprova a capacidade declarada do binário, não que o app
desktop esteja aberto nem que uma chamada MCP funcione. Ele lista marketplaces
em JSON apenas em memória. Se já existir o marketplace chamado `rexia-scribe`,
usa essa origem sem alterá-la; caso contrário, instala o plugin pela fonte
pública `rexia-intel-automation/scribe`. O JSON enviado a
`claude plugin configure --values-stdin` contém apenas `client_path`. Saída e
erros da CLI são capturados em memória e descartados (o JSON da listagem é usado
apenas para detectar o marketplace existente). Em caso de falha, o script mostra
a etapa e o código de saída ou timeout, sem exibir a saída da CLI. Cada chamada
tem limite de dois minutos; no timeout, somente o processo `claude.exe` iniciado
pelo script é encerrado.

O manifesto inicia o caminho configurado por stdio com `--mcp`. Um valor `token`
salvo por versões anteriores do plugin não é lido nem usado. Atualize app, helper
e plugin juntos. O script não lê nem limpa as configurações já salvas pelo Claude
Code; não há aqui uma etapa documentada para remover a opção antiga.

O processo usa somente `claude plugin install` e `claude plugin configure`. Não
edita `settings.json`, apaga o perfil do Claude Code nem gera um token novo. Uma
reexecução reutiliza a conexão já existente. O script não aceita comandos
declarados pelo marketplace com `--yes` ou `--accept-command`; a CLI oficial
continua bloqueando esses casos sem confirmação humana.

Após a configuração, encerre e reinicie o Claude Code para carregar o plugin.

## Verificação local e limite de caminho

Os ensaios abaixo são históricos, anteriores ao contrato stdio do candidato
0.1.1; não validam o marcador `attested-stdio-v1` nem o transporte novo.
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
O marketplace público instala o conteúdo atualmente publicado na branch `main`.
Confira que app, helper e plugin vêm do mesmo pacote/revisão, pois versões
anteriores esperavam `port` e `token` no `userConfig`.
