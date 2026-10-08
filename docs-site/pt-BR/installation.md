# Instalação

## Beta.1 publicada: avaliação somente no Windows

`v0.1.0-beta.1` é um pré-lançamento sem assinatura para avaliação da TI, não uma versão final aceita. Ele combina o app e o helper nativo com o plugin `0.1.0`, que usa a conexão HTTP local. O branch atual do marketplace usa o plugin `0.1.1` por stdio e é incompatível com a beta.1. O app ainda informa a versão `0.1.0`, portanto esse número sozinho não identifica a combinação.

A [página da beta](https://github.com/rexia-intel-automation/scribe/releases/tag/v0.1.0-beta.1) mantém o instalador, o script, os checksums e o roteiro de teste originais. Essas instruções só se aplicam quando o plugin instalado é a versão correspondente à tag beta.1 e o app da beta está aberto. Não use o script atual do repositório nem atualize o marketplace para o branch atual com o app beta.1. Este site não documenta uma instalação nova com uma fonte de marketplace correspondente.

Se estiver verificando uma instalação beta.1 existente e corretamente combinada, confira cada arquivo baixado contra `SHA256SUMS` da release antes de usá-lo. O instalador não é assinado; siga a política da organização se o Windows ou um software de segurança exibir um aviso. O script original exige `claude.exe` nativo no `PATH`; shims `.cmd` do npm não são aceitos. O comando PowerShell original era:

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
absoluto do helper encontrado acima e use a CLI nativa do Claude Code. Estas
formas de argumentos correspondem ao script candidato; o script PowerShell em
si é somente para Windows.

```sh
claude plugin install scribe --marketplace rexia-intel-automation/scribe --scope user --config "client_path=$SCRIBE_HELPER"
```

Para definir ou atualizar o caminho de um plugin já instalado, envie somente o
JSON `client_path` pela entrada padrão:

```sh
printf '%s\n' "{\"client_path\":\"$SCRIBE_HELPER\"}" | claude plugin configure scribe@rexia-scribe --values-stdin
```

Esses comandos não exigem copiar o token do Scribe. O plugin guarda somente o
caminho do helper; ele lê a conexão do perfil privado da conta atual do sistema.
Reinicie o Claude Code após configurar. A configuração pela CLI no macOS e
Linux, a instalação limpa dos pacotes e o comportamento visual do app ainda não
foram validados; este guia não afirma esses resultados de aceite manual.
