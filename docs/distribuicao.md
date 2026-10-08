# Artefatos de distribuição (previews)

O workflow [Distribution previews](../.github/workflows/distribution.yml) gera pacotes de CI para revisão: NSIS e MSI no Windows, `.app` universal dentro de DMG no macOS, e DEB + AppImage no Ubuntu 22.04. Ele roda manualmente por `workflow_dispatch` ou em PRs que alterem os arquivos de distribuição. Os downloads ficam nos artifacts daquele run por 14 dias; nenhum passo cria tag ou GitHub Release, altera a versão `0.1.0` ou declara uma fase aprovada.

## Baixar e conferir

Baixe `scribe-distribution-preview-<plataforma>-<commit>` na página do run do GitHub Actions. Cada pacote vem acompanhado de `SHA256SUMS.txt` e `BUILD-METADATA.txt`; o último registra o SHA do commit-fonte, plataforma, alvo e versão. Confira os hashes no diretório extraído:

```powershell
Get-FileHash .\Scribe_*.exe -Algorithm SHA256
Get-FileHash .\Scribe_*.msi -Algorithm SHA256
Get-Content .\SHA256SUMS.txt
```

Compare cada `Get-FileHash` com a linha correspondente de `SHA256SUMS.txt`. No macOS/Linux, use `shasum -a 256 -c SHA256SUMS.txt`. O checksum detecta corrupção; para confiar na origem, confira também o run e o commit registrado em `BUILD-METADATA.txt`.

## Como são feitos

`tauri.conf.json` permanece com bundling desligado. O overlay `tauri.distribution.conf.json` liga os formatos apenas neste workflow e declara `scribe-hook` como sidecar. `scripts/build-distribution.mjs plan --platform <windows|macos|linux>` mostra alvo, formatos e nomes esperados sem compilar; `prepare` compila/estagia o sidecar e `finalize` exige todos os pacotes esperados antes de copiar os artefatos e gerar metadados/checksums.

No macOS, o app é compilado para `universal-apple-darwin`; o hook é compilado para `aarch64-apple-darwin` e `x86_64-apple-darwin`, combinado com `lipo` e verificado para conter ambas as arquiteturas. Antes de copiar o DMG, `finalize` executa `lipo -verify_arch arm64 x86_64` no executável `scribe` e no sidecar `scribe-hook` dentro do `.app`; nome de arquivo ou teste com fixture não substitui essa verificação. No Linux, o runner Ubuntu 22.04 x86_64 fornece as dependências de build GTK/WebKit, indicador de bandeja e AppImage. O workflow inclui tentativa de habilitar VBSCRIPT, pré-requisito do bundle MSI; até o MSI ser efetivamente gerado e validado no runner, considere essa saída pendente. NSIS continua em modo por usuário.

## Limites do preview

Os pacotes não são assinados nem notarizados. O Gatekeeper/quarentena do macOS ou SmartScreen do Windows pode mostrar alertas; este repositório não recomenda ignorar nem contornar essas proteções. Linux também recebe apenas checksum, sem assinatura. Estes artifacts não substituem ensaio de instalação/abertura em máquina limpa, validação de segurança ou release pública. Antes de uma distribuição pública, ainda é necessário definir certificados, notarização e testes reais nas três plataformas.

## Referências oficiais

- [Tauri: bundles e configuração](https://v2.tauri.app/reference/config/#bundleconfig)
- [Tauri: sidecars e nomes por target triple](https://v2.tauri.app/develop/sidecar/)
- [Tauri: app universal macOS](https://v2.tauri.app/distribute/app-store/)
- [Tauri: pré-requisitos Linux](https://v2.tauri.app/start/prerequisites/#linux)
- [Tauri: instaladores Windows](https://v2.tauri.app/distribute/windows-installer/)
- [Tauri: assinatura/notarização macOS](https://v2.tauri.app/distribute/sign/macos/)
