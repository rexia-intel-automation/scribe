# Preparar e publicar uma versão

O workflow [Release](../.github/workflows/release.yml) usa
[tauri-action](https://github.com/tauri-apps/tauri-action/tree/action-v1.0.0)
para construir NSIS/MSI no Windows, DMG universal no macOS e DEB/AppImage no
Linux. A preparação do sidecar e a verificação das duas arquiteturas macOS
reutilizam o fluxo de [distribuição](distribuicao.md).

## Antes de criar a tag

Conclua as revisões cruzadas, os gates de fases e os ensaios reais da versão:
sessões simultâneas, decisões, falhas, perguntas/plano, instalação limpa e
interações nativas. Um build verde não comprova esses aceites. Preserve os
relatórios correspondentes e só crie a tag depois de integrar o código
revisado e de o CI desse commit de `main` terminar com sucesso.

Atualize `app/package.json`, `app/src-tauri/tauri.conf.json` e
`plugins/scribe/.claude-plugin/plugin.json` para a versão exata da tag sem `v`.
Os três valores precisam coincidir, inclusive o sufixo de prerelease. Mantenha
os manifests/locks Rust coerentes quando atualizar as versões dos componentes;
health/MCP usam a versão do pacote Rust. O validador verifica os três JSONs,
não afirma que a versão interna de cada crate é idêntica.

```powershell
node scripts/prepare-release.mjs validate-tag --tag v0.1.0 --source-sha (git rev-parse HEAD)
```

Tags aceitas têm a forma `vX.Y.Z` ou `vX.Y.Z-sufixo`, sem build metadata.
O `v0.1.0-beta.1` já publicado usava versão-base `0.1.0`: ele permanece
preservado. O novo gate exige identidade exata para as próximas versões e
não reconstrói nem substitui os assets dessa beta antiga.

## Construção e publicação

PRs que alteram a automação e um `workflow_dispatch` exercitam os builds e a
coleta, sem criar tag ou release. Uma tag `v*` dispara a publicação somente
se o commit pertence ao histórico de `main`, as versões coincidem e há um
run bem-sucedido de `ci.yml` no mesmo SHA com auditoria e Windows/macOS/Linux.
Se a tag for enviada antes de esse CI terminar, o gate falha: aguarde o CI e
reexecute o workflow, sem mover a tag.

Os jobs de build têm acesso de leitura. Eles não recebem parâmetros de
release na `tauri-action`. O coletor confere exatamente os cinco pacotes,
metadados do commit/alvo/versão e hashes dos arquivos baixados; recusa saídas
parciais, nomes inseguros, links, arquivos extras ou um diretório de saída já
existente. A saída inclui os READMEs, licença, script de configuração, roteiro
da TI, `SHA256SUMS.txt` em UTF-8/LF, metadados e notas de release.

Só o job final recebe `contents: write`. Ele repete a conferência dos inputs
antes de criar uma release nova em draft e subir os arquivos. A publicação
ocorre depois de o upload terminar com sucesso. Sufixos SemVer marcam a
versão como prerelease e não a tornam Latest; uma tag estável vira Latest.

O workflow não usa `--clobber`, não move tags e não reutiliza releases
existentes. Uma falha no upload pode deixar um draft incompleto: confira
os arquivos e hashes antes de qualquer recuperação; não publique esse draft
automaticamente. Correções em uma release publicada exigem uma nova versão.

## Limites

Os pacotes continuam sem assinatura/notarização; isso está nas notas geradas.
O gate automatizado não verifica instalação limpa nem gestos humanos e não
atribui notas de revisão adversarial. Nesta PR, o caminho de publicação ainda
não foi exercitado com uma tag nova. Não crie uma release de teste só para
atribuir esse aceite; use o dispatch sem publicação para validar os builds.
