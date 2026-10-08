# Instalação

## Beta publicada: somente Windows

A `v0.1.0-beta.1` publicada é um pré-lançamento para avaliação da TI, não a versão final. Recursos em desenvolvimento em pull requests abertas não fazem parte deste pacote. Perguntas nativas e aprovação de planos ainda precisam de ensaio em uma sessão interativa nova.

1. Baixe o instalador, `configure-claude-plugin.ps1`, `SHA256SUMS` e o roteiro de teste na [página da beta](https://github.com/rexia-intel-automation/scribe/releases/tag/v0.1.0-beta.1).
2. Confira cada arquivo baixado contra a entrada correspondente em `SHA256SUMS` antes de executá-lo.
3. Instale o executável para o usuário atual do Windows. O instalador não é assinado; siga a política da organização se o Windows ou um software de segurança exibir um aviso.
4. Abra o Scribe pelo menu Iniciar e deixe-o aberto.
5. Execute o script de configuração numa janela normal do PowerShell 5.1 ou 7. Depois, feche as sessões do Claude Code e inicie uma sessão interativa nova.

O script exige o `claude.exe` nativo no `PATH`; shims `.cmd` do npm não são aceitos nesta beta. Siga o roteiro de teste baixado. A saída da CLI do Claude fica oculta de propósito; se o script falhar, registre etapa e código de saída sem compartilhar tokens ou arquivos do perfil privado.

Na pasta dos downloads, confira o hash do instalador e compare com a entrada correspondente em `SHA256SUMS`:

```powershell
Get-FileHash -Algorithm SHA256 -LiteralPath .\Scribe_0.1.0_x64-setup.exe
```

Com o app instalado e aberto, configure o plugin numa janela normal do PowerShell:

```powershell
powershell.exe -NoProfile -File .\configure-claude-plugin.ps1
```

No PowerShell 7, use `pwsh -NoProfile -File .\configure-claude-plugin.ps1`. Se a política de execução bloquear o script não assinado, siga o procedimento revisado no README baixado e a política da organização.

## Outros sistemas operacionais

O instalador publicado e o onboarding documentado são para a beta Windows. Este site não afirma que exista um instalador pronto para macOS ou Linux.
