# Instalação

## Beta.1 publicada: avaliação somente no Windows

`v0.1.0-beta.1` é um pré-lançamento sem assinatura para avaliação da TI, não uma versão final aceita. Ele combina o app e o helper nativo com o plugin `0.1.0`, que usa a conexão HTTP local. O branch atual do marketplace usa o plugin `0.1.1` por stdio e é incompatível com a beta.1. O app ainda informa a versão `0.1.0`, portanto esse número sozinho não identifica a combinação.

A beta.1 não foi revalidada com o Claude Code `2.1.294` e não inclui as correções recentes de MCP. Fixar a fonte abaixo evita misturar versões do plugin; não comprova que as ferramentas MCP dessa beta funcionem no cliente atual. O novo pacote pareado continua em validação.

A [página da beta](https://github.com/rexia-intel-automation/scribe/releases/tag/v0.1.0-beta.1) mantém o instalador, o script, os checksums e o roteiro de teste originais. Use somente os arquivos dessa release e a fonte de plugin fixada na mesma tag. O script original não fixa uma revisão quando registra um marketplace novo; executá-lo sozinho pode buscar o plugin incompatível do branch atual.

Confira cada arquivo baixado contra `SHA256SUMS` da release antes de usá-lo. O instalador não é assinado; siga a política da organização se o Windows ou um software de segurança exibir um aviso. O script original exige `claude.exe` nativo no `PATH`; shims `.cmd` do npm não são aceitos.

### Fixar o plugin numa máquina nova

Antes de instalar o executável ou executar o script, execute `claude plugin marketplace list --json`. Se `rexia-scribe` já estiver registrado com outro `ref` ou sem `ref`, não instale a beta, não execute o script nem altere esse registro. Se já usa o app/helper candidato ou o plugin `0.1.1`, preserve essa instalação. Este procedimento serve para uma máquina nova ou uma combinação beta.1 existente com a fonte já fixada na tag correspondente.

Se o marketplace ainda não existir, registre a tag beta.1:

```powershell
claude plugin marketplace add "https://github.com/rexia-intel-automation/scribe.git#v0.1.0-beta.1" --scope user
claude plugin marketplace list --json
```

Confira `name: rexia-scribe` e `ref: v0.1.0-beta.1` na listagem. O sufixo `#<ref>` é o mecanismo de [fixação documentado pelo Claude Code](https://code.claude.com/docs/en/plugins/host-marketplace#host-your-marketplace). Esse registro e a validação do manifesto `0.1.0` foram conferidos num perfil separado; isso não substitui o ensaio completo com o app e as sessões reais.

Com a fonte correspondente registrada, instale o executável da beta.1 para o usuário atual, abra o Scribe pelo menu Iniciar e mantenha-o aberto. Execute o script original baixado dessa release:

```powershell
powershell.exe -NoProfile -File .\configure-claude-plugin.ps1
```

No PowerShell 7, use `pwsh -NoProfile -File .\configure-claude-plugin.ps1`. Após a configuração, feche o Claude Code e inicie uma sessão interativa nova. A saída da CLI do Claude fica oculta; se o script falhar, registre a etapa e o código de saída sem compartilhar tokens ou arquivos do perfil privado.

## Candidato de migração para stdio: não publicado

A combinação candidata de app, helper e plugin por stdio ainda está em preparação e revisão. Ela não é uma release instalável nem um resultado de aceite. Não baixe nem configure um candidato diretamente do branch do repositório.

Quando uma combinação for publicada, os arquivos incluirão README, script de configuração, roteiro de teste da TI, instalador Windows, helper nativo, plugin `0.1.1`, `SHA256SUMS.txt` e `BUILD-METADATA.txt` com `source_sha`. Confira os hashes e o SHA de origem registrados: o app continua na versão `0.1.0`, igual à beta.1, e esse número não diferencia os pacotes. O script candidato exige a CLI nativa do Claude Code atualizada, atualiza o marketplace/plugin existente e verifica o plugin `0.1.1` habilitado no escopo do usuário, incluindo a versão de pasta quando informada, antes de configurar. Os comandos foram conferidos na ajuda da CLI `2.1.294`; o ensaio real continua pendente.

Abra o app combinado uma vez para criar o arquivo de conexão antes da configuração; ele pode fechar durante o processo. Se uma chamada de ferramenta MCP informar que o Scribe está indisponível, reabra o app e tente novamente na mesma sessão do Claude Code. Esse caminho de recuperação não comprova aceite humano do candidato.

## Outros sistemas operacionais

A beta publicada tem instalador somente para Windows. Os pacotes candidatos
stdio para macOS e Linux ainda não foram publicados nem validados por uma
instalação limpa. O par app/plugin da beta.1 para Windows é incompatível com o
plugin 0.1.1. Use estas etapas somente com uma futura combinação candidata em
que app, helper, plugin, checksums e `source_sha` de `BUILD-METADATA.txt`
correspondam. Siga a política da sua organização para software sem assinatura;
não desative o Gatekeeper nem outros controles de segurança.

### DMG do macOS

Confira o DMG com `shasum -a 256 -c SHA256SUMS.txt`, abra-o no Finder e copie
`Scribe.app` para Aplicativos. Abra o Scribe em Aplicativos uma vez para criar a
conexão privada. Para Aplicativos do sistema, o helper fica em
`/Applications/Scribe.app/Contents/MacOS/scribe-hook`. Se o macOS bloquear o app
sem assinatura, pare e siga o processo da sua organização para software
aprovado; este guia não contorna o Gatekeeper.

### DEB do Linux

Confira o pacote com `sha256sum -c SHA256SUMS.txt`, instale o `.deb` pelo
processo aprovado de gerenciamento de pacotes e localize o helper pela lista de
arquivos do pacote, sem presumir seu caminho:

```sh
sudo apt install ./Scribe_0.1.0_amd64.deb
dpkg -L scribe | grep '/scribe-hook$'
```

Abra o Scribe pelo menu de aplicativos uma vez para criar a conexão privada.
Use o caminho absoluto mostrado por `dpkg -L` abaixo.

No macOS, defina `SCRIBE_HELPER` com o caminho acima. No Debian/Ubuntu, use o
caminho exato impresso por `dpkg -L`:

```sh
SCRIBE_HELPER='/caminho/absoluto/para/scribe-hook'
test -x "$SCRIBE_HELPER"
```

### AppImage do Linux

No Ubuntu 22.04, instale primeiro as bibliotecas FUSE e EGL do sistema:

```sh
sudo apt-get update
sudo apt-get install -y libfuse2 libegl1
```

Outras distribuições exigem os pacotes correspondentes de FUSE 2 e EGL.
AppImage depende das bibliotecas gráficas do sistema; veja a
[exclusão de bibliotecas gráficas do AppImage](https://docs.appimage.org/introduction/concepts.html#build-on-old-systems-run-on-newer-systems).

Confira o checksum, torne o arquivo executável e extraia-o para uma pasta
permanente nova e vazia da sua conta. O Claude Code precisa iniciar o helper mesmo com o
Scribe fechado; configure o caminho dentro dessa extração persistente, nunca
dentro de uma montagem temporária do AppImage:

```sh
chmod +x ./Scribe*.AppImage
mkdir -p "$HOME/.local/opt/scribe-candidate"
cd "$HOME/.local/opt/scribe-candidate"
/caminho/absoluto/Scribe.AppImage --appimage-extract
mv squashfs-root appimage-root
find "$HOME/.local/opt/scribe-candidate/appimage-root" -name scribe-hook -print
```

Abra o AppImage original pelo gerenciador de arquivos uma vez para criar a
conexão privada. Mantenha a pasta extraída no lugar para o caminho do helper.

Use o caminho absoluto mostrado por `find` abaixo. AppImages do tipo 2 aceitam
`--appimage-extract`, que cria `squashfs-root` na pasta atual; veja o
[guia oficial de extração do AppImage](https://docs.appimage.org/user-guide/run-appimages.html#extract-the-contents-of-an-appimage).

Defina a variável com o caminho retornado por `find` e confirme que o helper é
executável:

```sh
SCRIBE_HELPER="$(find "$HOME/.local/opt/scribe-candidate/appimage-root" -name scribe-hook -print -quit)"
test -x "$SCRIBE_HELPER"
```

### Configurar o plugin combinado

Depois de instalar e abrir o app uma vez, defina `SCRIBE_HELPER` com o caminho
absoluto do helper encontrado acima e use a CLI nativa do Claude Code. Primeiro,
exija que a verificação de capacidade do helper termine com sucesso:

```sh
"$SCRIBE_HELPER" --mcp-check
```

Continue somente se o JSON informar `name` `scribe-hook`, `version` `0.1.0` e
`mcp_transport` `attested-stdio-v1`. Isso confirma que o build do helper inicia;
não prova que o app desktop esteja aberto nem valida uma chamada MCP real.

Liste os marketplaces e atualize `rexia-scribe` somente se ele já estiver
presente:

```sh
claude plugin marketplace list --json
claude plugin marketplace update rexia-scribe
```

Se esse marketplace existir, instale o plugin dele e atualize a instalação no
escopo do usuário:

```sh
claude plugin install scribe@rexia-scribe --scope user --config "client_path=$SCRIBE_HELPER"
claude plugin update scribe@rexia-scribe --scope user
```

Se não existir, pule a atualização do marketplace e instale da fonte pública:

```sh
claude plugin install scribe --marketplace rexia-intel-automation/scribe --scope user --config "client_path=$SCRIBE_HELPER"
claude plugin update scribe@rexia-scribe --scope user
```

Antes de configurar ou reiniciar o Claude Code, confira `claude plugin list
--json`. Exija exatamente uma entrada `scribe@rexia-scribe` no escopo `user`,
na versão `0.1.1`, habilitada (`enabled: true`) e com `folderVersion: 0.1.1` se
esse campo for informado. Pare se faltar, estiver desabilitada, duplicada ou
com versão diferente.

Defina ou atualize somente o caminho do helper por `--values-stdin`. Python 3 é
necessário neste passo para serializar caminhos como JSON com segurança,
inclusive espaços e barras invertidas:

```sh
printf '%s\n' "$SCRIBE_HELPER" | python3 -c 'import json,sys; print(json.dumps({"client_path": sys.stdin.read().rstrip("\n")}))' | claude plugin configure scribe@rexia-scribe --values-stdin
```

O plugin guarda somente o caminho do helper; ele lê a conexão do perfil
privado da conta atual do sistema. Não copie o token do Scribe. Reinicie o
Claude Code após configurar. A configuração pela CLI no macOS e Linux, a
instalação limpa dos pacotes e o comportamento visual do app ainda não foram
validados; este guia não afirma esses resultados de aceite manual.

Para atualizar AppImage, feche primeiro o Scribe e todas as sessões do Claude
Code. Confira o novo AppImage combinado e extraia-o para uma nova pasta
permanente vazia. Abra o AppImage atualizado uma vez e defina `SCRIBE_HELPER`
com o helper da nova extração. Repita a verificação de capacidade do helper, a
conferência da versão do plugin e o passo `plugin configure` antes de reiniciar
o Claude Code. Mantenha a extração antiga até configurar o novo caminho do
helper; depois disso, ela pode ser removida.
