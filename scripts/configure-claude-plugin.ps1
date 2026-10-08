#!/usr/bin/env pwsh
$ErrorActionPreference = 'Stop'

function Invoke-ClaudeCli {
    param(
        [Parameter(Mandatory = $true)][string[]]$Arguments,
        [AllowNull()][string]$InputText,
        [switch]$CaptureOutput
    )

    foreach ($argument in $Arguments) {
        if ($argument.Contains('"') -or $argument.EndsWith('\')) {
            throw 'Unsafe command argument.'
        }
    }

    $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = $script:ClaudeExecutable
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardInput = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    if ($PSVersionTable.PSVersion.Major -ge 7) {
        foreach ($argument in $Arguments) {
            [void]$startInfo.ArgumentList.Add($argument)
        }
    }
    else {
        $quotedArguments = foreach ($argument in $Arguments) {
            '"' + $argument + '"'
        }
        $startInfo.Arguments = $quotedArguments -join ' '
        $quotedArguments = $null
    }

    $process = [System.Diagnostics.Process]::new()
    $process.StartInfo = $startInfo
    $capturedStdout = $null
    $discardedStderr = $null
    try {
        if (-not $process.Start()) {
            throw 'Unable to start Claude Code.'
        }

        $stdoutTask = $process.StandardOutput.ReadToEndAsync()
        $stderrTask = $process.StandardError.ReadToEndAsync()
        $stdinStream = $process.StandardInput.BaseStream
        if ($null -ne $InputText) {
            $inputBytes = [System.Text.UTF8Encoding]::new($false).GetBytes($InputText + "`n")
            $stdinStream.Write($inputBytes, 0, $inputBytes.Length)
            $stdinStream.Flush()
            $inputBytes = $null
        }
        $stdinStream.Close()

        if (-not $process.WaitForExit(120000)) {
            try { $process.Kill() } catch { }
            $process.WaitForExit()
            $script:TimedOut = $true
            $null = $stdoutTask.GetAwaiter().GetResult()
            $null = $stderrTask.GetAwaiter().GetResult()
            throw 'Claude Code command timed out.'
        }

        $capturedStdout = $stdoutTask.GetAwaiter().GetResult()
        $discardedStderr = $stderrTask.GetAwaiter().GetResult()
        if ($CaptureOutput) {
            return [pscustomobject]@{
                ExitCode = $process.ExitCode
                Output = $capturedStdout
            }
        }
        return $process.ExitCode
    }
    finally {
        $process.Dispose()
        $InputText = $null
        $Arguments = $null
        $startInfo = $null
        $discardedStderr = $null
        if (-not $CaptureOutput) {
            $capturedStdout = $null
        }
    }
}

$script:Stage = 'preflight'
$script:TimedOut = $false
$script:FailureExitCode = $null
$script:ClaudeExecutable = $null
$connectionText = $null
$connection = $null
$token = $null
$configureValues = $null
$marketplaceOutput = $null
try {
    $claudeCommand = Get-Command claude -ErrorAction Stop
    if ($claudeCommand.CommandType -ne 'Application' -or
        [IO.Path]::GetExtension($claudeCommand.Source) -ne '.exe') {
        throw 'Claude Code native executable is unavailable.'
    }
    $script:ClaudeExecutable = $claudeCommand.Source

    if ([string]::IsNullOrWhiteSpace($env:LOCALAPPDATA) -or
        [string]::IsNullOrWhiteSpace($env:APPDATA)) {
        throw 'Windows user application directories are unavailable.'
    }

    $hookPath = [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'Scribe\scribe-hook.exe'))
    $connectionPath = Join-Path $env:APPDATA 'com.rexia.scribe\connection.json'
    if (-not (Test-Path -LiteralPath $hookPath -PathType Leaf) -or
        -not (Test-Path -LiteralPath $connectionPath -PathType Leaf) -or
        (Get-Item -LiteralPath $connectionPath).Length -gt 8192) {
        throw 'Scribe is not ready for plugin configuration.'
    }

    $connectionText = [IO.File]::ReadAllText($connectionPath)
    $connection = ConvertFrom-Json -InputObject $connectionText -ErrorAction Stop
    $portProperty = $connection.PSObject.Properties['port']
    $tokenProperty = $connection.PSObject.Properties['token']
    if ($null -eq $portProperty -or $null -eq $tokenProperty -or
        (($portProperty.Value -isnot [int]) -and ($portProperty.Value -isnot [long])) -or
        $portProperty.Value -lt 1024 -or $portProperty.Value -gt 65535 -or
        $tokenProperty.Value -isnot [string] -or
        $tokenProperty.Value -notmatch '^[A-Za-z0-9_-]{32,128}$') {
        throw 'Scribe connection data is invalid.'
    }

    $token = $tokenProperty.Value
    $port = [string]$portProperty.Value

    $script:Stage = 'marketplace list'
    $marketplaceResult = Invoke-ClaudeCli -Arguments @(
        'plugin', 'marketplace', 'list', '--json'
    ) -InputText $null -CaptureOutput
    if ($marketplaceResult.ExitCode -ne 0) {
        $script:FailureExitCode = $marketplaceResult.ExitCode
        throw 'Marketplace list failed.'
    }

    $marketplaceOutput = ConvertFrom-Json -InputObject $marketplaceResult.Output -ErrorAction Stop
    if ($marketplaceOutput -is [array]) {
        $marketplaceEntries = $marketplaceOutput
    }
    elseif ($null -ne $marketplaceOutput.PSObject.Properties['marketplaces']) {
        $marketplaceEntries = @($marketplaceOutput.marketplaces)
    }
    else {
        throw 'Marketplace list format was invalid.'
    }
    $existingMarketplace = @($marketplaceEntries | Where-Object { $_.name -eq 'rexia-scribe' }).Count -gt 0
    $marketplaceResult = $null
    $marketplaceOutput = $null
    $marketplaceEntries = $null

    $installArguments = @('plugin', 'install')
    if ($existingMarketplace) {
        $installArguments += 'scribe@rexia-scribe'
    }
    else {
        $installArguments += @('scribe', '--marketplace', 'rexia-intel-automation/scribe')
    }
    $installArguments += @(
        '--scope', 'user',
        '--config', "client_path=$hookPath",
        '--config', "port=$port"
    )

    $script:Stage = 'plugin install'
    $installExitCode = Invoke-ClaudeCli -Arguments $installArguments -InputText $null
    if ($installExitCode -ne 0) {
        $script:FailureExitCode = $installExitCode
        throw 'Plugin install failed.'
    }

    $configureValues = [ordered]@{
        client_path = $hookPath
        port = $port
        token = $token
    } | ConvertTo-Json -Compress

    $script:Stage = 'plugin configure'
    $configureExitCode = Invoke-ClaudeCli -Arguments @(
        'plugin', 'configure', 'scribe@rexia-scribe', '--values-stdin'
    ) -InputText $configureValues
    if ($configureExitCode -ne 0) {
        $script:FailureExitCode = $configureExitCode
        throw 'Plugin configure failed.'
    }

    [Console]::WriteLine('Scribe plugin configured for the current user. Restart Claude Code to load it.')
    exit 0
}
catch {
    $status = if ($script:TimedOut) { 'timeout' }
        elseif ($null -ne $script:FailureExitCode) { "exit code $script:FailureExitCode" }
        else { 'failed' }
    [Console]::Error.WriteLine("Scribe plugin setup failed during $script:Stage ($status). CLI output was withheld.")
    exit 1
}
finally {
    $script:ClaudeExecutable = $null
    $script:FailureExitCode = $null
    $connectionText = $null
    $connection = $null
    $token = $null
    $configureValues = $null
    $marketplaceOutput = $null
    $marketplaceResult = $null
}
