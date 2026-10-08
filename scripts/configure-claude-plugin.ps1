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

function Test-ScribeMcpHelper {
    param([Parameter(Mandatory = $true)][string]$HelperPath)

    $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = $HelperPath
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardInput = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    if ($PSVersionTable.PSVersion.Major -ge 7) {
        [void]$startInfo.ArgumentList.Add('--mcp-check')
    }
    else {
        $startInfo.Arguments = '"--mcp-check"'
    }

    $process = [System.Diagnostics.Process]::new()
    $process.StartInfo = $startInfo
    $capturedStdout = $null
    $capturedStderr = $null
    try {
        if (-not $process.Start()) {
            return $false
        }

        $stdoutTask = $process.StandardOutput.ReadToEndAsync()
        $stderrTask = $process.StandardError.ReadToEndAsync()
        $process.StandardInput.Close()
        if (-not $process.WaitForExit(3000)) {
            try { $process.Kill() } catch { }
            $process.WaitForExit()
            $script:TimedOut = $true
            $null = $stdoutTask.GetAwaiter().GetResult()
            $null = $stderrTask.GetAwaiter().GetResult()
            return $false
        }

        $capturedStdout = $stdoutTask.GetAwaiter().GetResult()
        $capturedStderr = $stderrTask.GetAwaiter().GetResult()
        if ($process.ExitCode -ne 0 -or [string]::IsNullOrWhiteSpace($capturedStdout)) {
            return $false
        }

        $capability = ConvertFrom-Json -InputObject $capturedStdout -ErrorAction Stop
        $nameProperty = $capability.PSObject.Properties['name']
        $versionProperty = $capability.PSObject.Properties['version']
        $transportProperty = $capability.PSObject.Properties['mcp_transport']
        return ($null -ne $nameProperty -and $nameProperty.Value -ceq 'scribe-hook' -and
            $null -ne $versionProperty -and $versionProperty.Value -ceq '0.1.0' -and
            $null -ne $transportProperty -and $transportProperty.Value -ceq 'attested-stdio-v1')
    }
    catch {
        return $false
    }
    finally {
        $process.Dispose()
        $startInfo = $null
        $capturedStdout = $null
        $capturedStderr = $null
    }
}

$script:Stage = 'preflight'
$script:TimedOut = $false
$script:FailureExitCode = $null
$script:FailureReason = $null
$script:ClaudeExecutable = $null
$connectionText = $null
$connection = $null
$configureValues = $null
$marketplaceOutput = $null
try {
    $script:Stage = 'locate Claude CLI'
    $claudeCommand = Get-Command claude -ErrorAction Stop
    if ($claudeCommand.CommandType -ne 'Application' -or
        [IO.Path]::GetExtension($claudeCommand.Source) -ne '.exe') {
        throw 'Claude Code native executable is unavailable.'
    }
    $script:ClaudeExecutable = $claudeCommand.Source

    $script:Stage = 'validate Scribe installation'
    if ([string]::IsNullOrWhiteSpace($env:LOCALAPPDATA) -or
        [string]::IsNullOrWhiteSpace($env:APPDATA)) {
        throw 'Windows user application directories are unavailable.'
    }

    $hookPath = [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'Scribe\scribe-hook.exe'))
    $connectionPath = Join-Path $env:APPDATA 'com.rexia.scribe\connection.json'
    if (-not (Test-Path -LiteralPath $hookPath -PathType Leaf) -or
        -not (Test-Path -LiteralPath $connectionPath -PathType Leaf) -or
        (Get-Item -LiteralPath $connectionPath).Length -gt 8192) {
        throw 'Scribe helper or connection data is missing. Install or update Scribe first.'
    }

    $connectionText = [IO.File]::ReadAllText($connectionPath)
    $connection = ConvertFrom-Json -InputObject $connectionText -ErrorAction Stop
    $portProperty = $connection.PSObject.Properties['port']
    $hookKeyProperty = $connection.PSObject.Properties['hook_key']
    $tokenProperty = $connection.PSObject.Properties['token']
    if ($null -eq $portProperty -or
        (($portProperty.Value -isnot [int]) -and ($portProperty.Value -isnot [long])) -or
        $portProperty.Value -lt 1024 -or $portProperty.Value -gt 65535 -or
        $null -eq $hookKeyProperty -or $hookKeyProperty.Value -isnot [string] -or
        $hookKeyProperty.Value -notmatch '^[A-Za-z0-9_-]{32,128}$' -or
        $null -eq $tokenProperty -or $tokenProperty.Value -isnot [string] -or
        $tokenProperty.Value -notmatch '^[A-Za-z0-9_-]{32,128}$' -or
        $hookKeyProperty.Value -ceq $tokenProperty.Value) {
        throw 'Scribe connection data is outdated or invalid. Update Scribe to a build with the MCP helper key.'
    }

    $helperPath = $hookPath
    $script:Stage = 'MCP helper capability check'
    if (-not (Test-ScribeMcpHelper -HelperPath $helperPath)) {
        $script:FailureReason = 'Update the Scribe app and helper together to a build that supports MCP stdio.'
        throw 'Required MCP helper capability is unavailable.'
    }

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
        '--config', "client_path=$helperPath"
    )

    $script:Stage = 'plugin install'
    $installExitCode = Invoke-ClaudeCli -Arguments $installArguments -InputText $null
    if ($installExitCode -ne 0) {
        $script:FailureExitCode = $installExitCode
        throw 'Plugin install failed.'
    }

    $configureValues = [ordered]@{
        client_path = $helperPath
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
    $message = "Scribe plugin setup failed during $script:Stage ($status)."
    if ($null -ne $script:FailureReason) {
        $message += " $script:FailureReason"
    }
    else {
        $message += ' CLI output was withheld.'
    }
    [Console]::Error.WriteLine($message)
    exit 1
}
finally {
    $script:ClaudeExecutable = $null
    $script:FailureExitCode = $null
    $script:FailureReason = $null
    $connectionText = $null
    $connection = $null
    $configureValues = $null
    $marketplaceOutput = $null
    $marketplaceResult = $null
}
