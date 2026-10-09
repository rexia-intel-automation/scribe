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

A beta publicada tem instalador somente para Windows. Este site não afirma que exista um instalador pronto para macOS ou Linux.
