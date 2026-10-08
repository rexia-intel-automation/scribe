# Scribe

Aplicativo desktop local para acompanhar sessões do Claude Code e decisões humanas.

[English](README.md)

**Estado dos testes:** `v0.1.0-beta.1` é uma versão beta Windows para avaliação
pela equipe de TI. Ainda não é a release final. Perguntas nativas e aprovação de
planos precisam de teste em uma sessão interativa nova do Claude Code. Veja
[a verificação das decisões](docs/fase-4.md) para evidências e limites pendentes.

Este repositório é o marketplace `rexia-scribe`; o plugin de configuração está
em `plugins/scribe`. O instalador inclui o cliente Rust de hooks, sem exigir uma
instalação separada do Node para o Scribe.

## Teste da versão beta no Windows

Quando o prerelease for publicado, baixe estes arquivos na
[página da versão v0.1.0-beta.1](https://github.com/rexia-intel-automation/scribe/releases/tag/v0.1.0-beta.1):

- `Scribe_*_x64-setup.exe`
- `configure-claude-plugin.ps1`
- `SHA256SUMS`
- `teste-equipe-ti.md` (roteiro de testes)

Antes de executar os arquivos, confira os hashes dos
arquivos baixados com os nomes correspondentes em `SHA256SUMS`. No PowerShell:

```powershell
$setup = Get-ChildItem .\Scribe_*_x64-setup.exe
Get-FileHash $setup.FullName -Algorithm SHA256
Get-FileHash .\configure-claude-plugin.ps1 -Algorithm SHA256
Get-Content .\SHA256SUMS
```

Compare cada valor de `Get-FileHash` com a entrada SHA-256 do mesmo nome de
arquivo. Se faltar uma entrada ou um hash for diferente, pare e fale com a TI.
Não execute os arquivos antes de confirmar os hashes.

Instale o executável para o usuário atual. Abra o **Scribe** pelo atalho do menu
Iniciar do Windows e deixe o app aberto. Em uma
janela normal do PowerShell 5.1 ou 7, sem elevação, execute o script na pasta em
que foi baixado:

```powershell
powershell.exe -NoProfile -File .\configure-claude-plugin.ps1
```

No PowerShell 7, use:

```powershell
pwsh -NoProfile -File .\configure-claude-plugin.ps1
```

O script não recebe parâmetros. Ele exige o executável nativo `claude.exe` no
`PATH` e o app Scribe aberto. A configuração do plugin vale para seu usuário;
você não precisa copiar nem colar um token. Se o script falhar, anote a etapa e
o código de saída para a TI. Por segurança, ele não mostra a saída da CLI do
Claude.

O script não é assinado. `Restricted` bloqueia scripts; `RemoteSigned` pode
bloquear este arquivo baixado. Só depois de aprovar o arquivo e seu SHA-256,
a TI pode autorizar o desbloqueio deste arquivo e um processo `RemoteSigned`:

```powershell
Unblock-File -LiteralPath .\configure-claude-plugin.ps1
powershell.exe -NoProfile -ExecutionPolicy RemoteSigned -File .\configure-claude-plugin.ps1
```

A opção vale nesse processo, sem alterar a política da máquina/usuário.
`MachinePolicy`/`UserPolicy` prevalecem; siga a política gerenciada da TI.
Consulte a Microsoft sobre [políticas de execução](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_execution_policies?view=powershell-5.1)
e [Unblock-File](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.utility/unblock-file).

Depois da configuração, feche as sessões do Claude Code e inicie uma nova sessão
interativa com `claude` para carregar os hooks. O modo não interativo `claude
-p` não é o caminho de teste para perguntas AskUserQuestion interativas. Siga o
[roteiro de teste da TI](docs/teste-equipe-ti.md), também disponível no arquivo
baixado `teste-equipe-ti.md`, e registre falhas sem incluir
tokens, segredos ou o conteúdo de `%APPDATA%\com.rexia.scribe`.

### Atualizar e desinstalar

Feche o Scribe pelo menu da bandeja e execute o novo instalador para atualizar.
O upgrade verificado preservou histórico e credenciais. Desinstale em
**Configurações → Aplicativos → Scribe**; isso remove o app e mantém o perfil em
`%APPDATA%\com.rexia.scribe`. Para remover também o histórico pessoal, feche o
app e exclua esse perfil explicitamente. Reinstalar depois de excluir
`connection.json` gera credenciais novas: execute o script de configuração
novamente.

### Solução de problemas

- O instalador não é assinado; SmartScreen ou antivírus corporativo podem
  bloqueá-lo. Anote a mensagem exata e siga a política da TI.

- Se um comando contiver `=` (por exemplo, `x=y`) ou parecer conter um segredo,
  o Scribe pode ocultá-lo e encaminhar a decisão ao terminal do Claude Code.
  Esse é o fallback de privacidade; responda no terminal em vez de tratar isso
  como falha do cartão de permissão.
- Se uma tarefa exigir entrada interativa, use uma sessão `claude` em primeiro
  plano, não `claude -p`.
- Configurações gerenciadas como `disableAllHooks` ou
  `allowManagedHooksOnly` podem impedir a execução dos hooks instalados pelo
  usuário. Peça à TI para verificar a política da organização; não altere
  configurações gerenciadas por conta própria.
- Se um caminho ou comando longo for encaminhado ao terminal em vez de aparecer
  em um cartão interativo, continue pelo terminal do Claude Code. Não aprove pela
  janela uma ação para a qual o Scribe não oferece essa opção.
- Se a configuração do plugin reportar `Filename too long`, mantenha curto o
  caminho do checkout/cache e peça à TI para verificar o suporte a caminhos
  longos no Git da organização. O script não altera configurações do Git.

A beta v0.1 mantém o foco em acompanhar sessões. A direção da v0.3 para
cooperação entre agentes está registrada no [plano do produto](docs/plano-v0.1.md)
e continua sendo trabalho futuro, não uma capacidade da v0.1.

MIT © 2026 RexIA Tecnologia e Automação Digital LTDA.

Projeto independente de código aberto da RexIA. Sem afiliação com a Anthropic.
Claude e Claude Code são marcas da Anthropic, citadas apenas para descrever
compatibilidade.
