param(
    [Parameter(Mandatory)][int]$ApplicationProcessId,
    [Parameter(Mandatory)][string]$OutputPath
)
$ErrorActionPreference = 'Stop'
$application = Get-Process -Id $ApplicationProcessId
if ($application.Path -ne 'D:\RexIA\projetos\scribe\app\src-tauri\target\release\scribe.exe') {
    throw 'Only the isolated production test executable is measured'
}
$ids = [System.Collections.Generic.HashSet[int]]::new()
[void]$ids.Add($ApplicationProcessId)
$all = Get-CimInstance Win32_Process
do {
    $changed = $false
    foreach ($entry in $all) {
        if ($ids.Contains([int]$entry.ParentProcessId) -and $ids.Add([int]$entry.ProcessId)) { $changed = $true }
    }
} while ($changed)
$before = @{}
foreach ($id in $ids) { $before[$id] = (Get-Process -Id $id -ErrorAction SilentlyContinue).CPU }
$start = Get-Date
Start-Sleep -Seconds 15
$after = @{}
foreach ($id in $ids) { $after[$id] = Get-Process -Id $id -ErrorAction SilentlyContinue }
$elapsed = ((Get-Date) - $start).TotalSeconds
$counters = Get-CimInstance Win32_PerfFormattedData_PerfProc_Process
$metrics = @(foreach ($id in $ids) {
    $entry = $after[$id]
    if ($entry) {
        $counter = $counters | Where-Object IDProcess -EQ $id
        [pscustomobject]@{
            pid = $id; name = $entry.ProcessName
            workingSetMiB = [math]::Round($entry.WorkingSet64 / 1MB, 2)
            privateWorkingSetMiB = [math]::Round($counter.WorkingSetPrivate / 1MB, 2)
            cpuOneCorePercent = [math]::Round(($entry.CPU - $before[$id]) / $elapsed * 100, 3)
        }
    }
})
$result = [pscustomobject]@{
    rootId = $ApplicationProcessId; sampleSeconds = $elapsed
    logicalProcessors = [Environment]::ProcessorCount
    rootWorkingSetMiB = ($metrics | Where-Object pid -EQ $ApplicationProcessId).workingSetMiB
    totalWorkingSetMiB = ($metrics | Measure-Object workingSetMiB -Sum).Sum
    totalPrivateWorkingSetMiB = ($metrics | Measure-Object privateWorkingSetMiB -Sum).Sum
    totalCPUOneCorePercent = ($metrics | Measure-Object cpuOneCorePercent -Sum).Sum
    totalCPUMachinePercent = ($metrics | Measure-Object cpuOneCorePercent -Sum).Sum / [Environment]::ProcessorCount
    processes = $metrics
}
$result | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $OutputPath
$result | Select-Object rootWorkingSetMiB, totalWorkingSetMiB, totalPrivateWorkingSetMiB, totalCPUOneCorePercent, totalCPUMachinePercent
