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

        $capability = Microsoft.PowerShell.Utility\ConvertFrom-Json -InputObject $capturedStdout -ErrorAction Stop
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
$script:ExpectedPluginVersion = '0.1.1'
$connectionText = $null
$connection = $null
$configureValues = $null
$marketplaceOutput = $null
try {
    $script:Stage = 'locate Claude CLI'
    $claudeCommand = Get-Command claude -CommandType Application -ErrorAction Stop
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

    $hookPath = [IO.Path]::GetFullPath([IO.Path]::Combine($env:LOCALAPPDATA, 'Scribe\scribe-hook.exe'))
    $connectionPath = [IO.Path]::Combine($env:APPDATA, 'com.rexia.scribe\connection.json')
    if (-not [IO.File]::Exists($hookPath) -or
        -not [IO.File]::Exists($connectionPath) -or
        [IO.FileInfo]::new($connectionPath).Length -gt 8192) {
        throw 'Scribe helper or connection data is missing. Install or update Scribe first.'
    }

    $connectionText = [IO.File]::ReadAllText($connectionPath)
    $connection = Microsoft.PowerShell.Utility\ConvertFrom-Json -InputObject $connectionText -ErrorAction Stop
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

    $marketplaceOutput = Microsoft.PowerShell.Utility\ConvertFrom-Json -InputObject $marketplaceResult.Output -ErrorAction Stop
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

    if ($existingMarketplace) {
        $script:Stage = 'marketplace update'
        $marketplaceUpdateExitCode = Invoke-ClaudeCli -Arguments @(
            'plugin', 'marketplace', 'update', 'rexia-scribe'
        ) -InputText $null
        if ($marketplaceUpdateExitCode -ne 0) {
            $script:FailureExitCode = $marketplaceUpdateExitCode
            throw 'Marketplace update failed.'
        }
    }

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

    $script:Stage = 'plugin update'
    $pluginUpdateExitCode = Invoke-ClaudeCli -Arguments @(
        'plugin', 'update', 'scribe@rexia-scribe', '--scope', 'user'
    ) -InputText $null
    if ($pluginUpdateExitCode -ne 0) {
        $script:FailureExitCode = $pluginUpdateExitCode
        throw 'Plugin update failed.'
    }

    $script:Stage = 'plugin version check'
    $pluginListResult = Invoke-ClaudeCli -Arguments @(
        'plugin', 'list', '--json'
    ) -InputText $null -CaptureOutput
    if ($pluginListResult.ExitCode -ne 0) {
        $script:FailureExitCode = $pluginListResult.ExitCode
        throw 'Plugin list failed.'
    }

    try {
        # Wrapping preserves the JSON array shape for zero- and one-row results
        # in both Windows PowerShell 5.1 and PowerShell 7.
        $null = Microsoft.PowerShell.Utility\ConvertFrom-Json -InputObject $pluginListResult.Output -ErrorAction Stop
        $pluginListEnvelope = Microsoft.PowerShell.Utility\ConvertFrom-Json -InputObject ('{"plugins":' + $pluginListResult.Output + '}') -ErrorAction Stop
        $pluginListProperty = $pluginListEnvelope.PSObject.Properties['plugins']
        if ($null -eq $pluginListProperty -or $pluginListProperty.Value -isnot [array]) {
            throw 'Invalid plugin list shape.'
        }

        $matchingPlugins = @()
        foreach ($pluginEntry in $pluginListProperty.Value) {
            if ($null -eq $pluginEntry -or $pluginEntry -isnot [pscustomobject]) {
                throw 'Invalid plugin list entry.'
            }
            $idProperty = $pluginEntry.PSObject.Properties['id']
            $versionProperty = $pluginEntry.PSObject.Properties['version']
            $scopeProperty = $pluginEntry.PSObject.Properties['scope']
            $enabledProperty = $pluginEntry.PSObject.Properties['enabled']
            if ($null -eq $idProperty -or $idProperty.Value -isnot [string] -or
                $null -eq $versionProperty -or $versionProperty.Value -isnot [string] -or
                $null -eq $scopeProperty -or $scopeProperty.Value -isnot [string] -or
                $null -eq $enabledProperty -or $enabledProperty.Value -isnot [bool]) {
                throw 'Invalid plugin list entry fields.'
            }
            if ($idProperty.Value -ceq 'scribe@rexia-scribe' -and $scopeProperty.Value -ceq 'user') {
                $matchingPlugins += $pluginEntry
            }
        }

        if ($matchingPlugins.Count -gt 1) {
            $script:FailureReason = 'Claude Code reports multiple user-scope Scribe plugins. Resolve the duplicate plugin entries and retry.'
            throw 'Plugin list is ambiguous.'
        }
        if ($matchingPlugins.Count -ne 1) {
            $script:FailureReason = "The configured marketplace did not provide plugin version $script:ExpectedPluginVersion. Update the marketplace and retry."
            throw 'Required Scribe plugin version is unavailable.'
        }

        $installedPlugin = $matchingPlugins[0]
        $installedVersionProperty = $installedPlugin.PSObject.Properties['version']
        $installedEnabledProperty = $installedPlugin.PSObject.Properties['enabled']
        $folderVersionProperty = $installedPlugin.PSObject.Properties['folderVersion']
        if ($installedVersionProperty.Value -cne $script:ExpectedPluginVersion -or
            $installedEnabledProperty.Value -ne $true -or
            ($null -ne $folderVersionProperty -and
                ($folderVersionProperty.Value -isnot [string] -or
                    $folderVersionProperty.Value -cne $script:ExpectedPluginVersion))) {
            $script:FailureReason = "The configured marketplace did not provide an enabled Scribe plugin at version $script:ExpectedPluginVersion. Update the marketplace and retry."
            throw 'Required Scribe plugin version is unavailable.'
        }
    }
    catch {
        if ($null -eq $script:FailureReason) {
            $script:FailureReason = 'Claude Code did not provide a valid plugin list. Update the marketplace and retry.'
        }
        throw 'Plugin version verification failed.'
    }
    finally {
        $pluginListEnvelope = $null
        $pluginListProperty = $null
        $matchingPlugins = $null
        $installedPlugin = $null
        $pluginListResult = $null
    }

    $configureValues = [ordered]@{
        client_path = $helperPath
    } | Microsoft.PowerShell.Utility\ConvertTo-Json -Compress

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
