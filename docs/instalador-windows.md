# Instalador Windows

O empacotamento NSIS é opt-in: o `tauri.conf.json` base mantém `bundle.active`
desativado, e o overlay `tauri.installer.conf.json` ativa somente o bundle NSIS
com modo `currentUser`. Assim, builds comuns das três plataformas não dependem
do sidecar Windows. O instalador é destinado ao perfil do usuário (`%LOCALAPPDATA%`)
e não exige elevação administrativa.

## Gerar

Em um checkout Windows com Node.js/npm e Rust MSVC instalados, prepare as
dependências do frontend e execute na raiz do repositório:

```powershell
npm ci --prefix app
powershell -File .\scripts\build-windows-installer.ps1
```

O script lê o target triple do `rustc` local, compila `scribe-hook` com
`--locked` e usa `--target-dir` explícito para que a saída não dependa de
`CARGO_TARGET_DIR`. Em seguida copia o sidecar para
`app/src-tauri/binaries/scribe-hook-<target-triple>.exe` (o padrão exigido por
Tauri) e pede ao CLI Tauri para gerar apenas o bundle NSIS. `--locked` também é
encaminhado ao Cargo do build Tauri. O instalador fica em
`app/src-tauri/target/release/bundle/nsis/`.

O build exige um host Windows com target Rust `*-windows-msvc` disponível. O
script não instala ferramentas. Não há assinatura configurada: o executável e o
instalador resultantes são unsigned, e não devem ser apresentados como assinados.
