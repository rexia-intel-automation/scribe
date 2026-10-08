#!/usr/bin/env pwsh
$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$appRoot = Join-Path $repoRoot 'app'
$hookManifest = Join-Path $repoRoot 'app\hook-client\Cargo.toml'
$hookTargetRoot = Join-Path $repoRoot 'app\hook-client\target'
$binariesDir = Join-Path $repoRoot 'app\src-tauri\binaries'

foreach ($tool in @('cargo', 'rustc', 'npm')) {
    if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
        throw "Required tool not found on PATH: $tool"
    }
}

$rustcInfo = & rustc -vV
if ($LASTEXITCODE -ne 0) {
    throw 'Could not read the Rust host target from rustc.'
}
$hostLine = $rustcInfo | Where-Object { $_ -match '^host:\s*' } | Select-Object -First 1
if (-not $hostLine) {
    throw 'rustc -vV did not report a host target.'
}
$targetTriple = ($hostLine -replace '^host:\s*', '').Trim()
if ($targetTriple -notmatch 'windows-msvc$') {
    throw "Build this NSIS installer from a Windows MSVC Rust host; detected '$targetTriple'."
}

$hookBuildArgs = @(
    'build',
    '--locked',
    '--release',
    '--manifest-path', $hookManifest,
    '--target', $targetTriple,
    '--target-dir', $hookTargetRoot
)
& cargo @hookBuildArgs
if ($LASTEXITCODE -ne 0) {
    throw 'Building the scribe-hook sidecar failed.'
}

$hookBinary = Join-Path $hookTargetRoot "$targetTriple\release\scribe-hook.exe"
if (-not (Test-Path -LiteralPath $hookBinary -PathType Leaf)) {
    throw "The scribe-hook build did not produce the expected file: $hookBinary"
}

New-Item -ItemType Directory -Path $binariesDir -Force | Out-Null
$sidecarPath = Join-Path $binariesDir "scribe-hook-$targetTriple.exe"
Copy-Item -LiteralPath $hookBinary -Destination $sidecarPath -Force

Push-Location $appRoot
try {
    & npm run tauri -- build --config src-tauri/tauri.installer.conf.json --bundles nsis --ci -- --locked
    if ($LASTEXITCODE -ne 0) {
        throw 'Building the Scribe NSIS installer failed.'
    }
}
finally {
    Pop-Location
}
