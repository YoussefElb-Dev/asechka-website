function Find-AsechkaExecutable([string[]]$Candidates, [string]$Name) {
    foreach ($candidate in $Candidates) {
        if ([string]::IsNullOrWhiteSpace($candidate)) { continue }
        try {
            if ([IO.Path]::GetFileName($candidate) -ieq $Name -and (Test-Path -LiteralPath $candidate -PathType Leaf)) {
                return [IO.Path]::GetFullPath($candidate)
            }
        } catch { }
    }
    $command = Get-Command -Name $Name -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($command) { return $command.Source }
    throw ('Asechka Studio could not find ' + $Name + '. Your drafts are safe; please ask for help repairing the installation.')
}

function Get-AsechkaRuntime {
    $state = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'AsechkaStudio'
    if ($env:LOCALAPPDATA) { $state = Join-Path $env:LOCALAPPDATA 'AsechkaStudio' }
    $saved = @{ node = $null; git = $null }
    $runtimeFile = Join-Path $state 'runtime.json'
    if (Test-Path -LiteralPath $runtimeFile -PathType Leaf) {
        try { $saved = Get-Content -LiteralPath $runtimeFile -Raw -Encoding UTF8 | ConvertFrom-Json } catch { }
    }
    $legacy = @{ node = $null; git = $null }
    $legacyFile = Join-Path $state 'runtime.cmd'
    if (Test-Path -LiteralPath $legacyFile -PathType Leaf) {
        try {
            foreach ($line in (Get-Content -LiteralPath $legacyFile -Encoding Default)) {
                if ($line -match '^set "ASECHKA_(NODE|GIT)=(.+)"$') {
                    $legacy[$Matches[1].ToLowerInvariant()] = $Matches[2]
                }
            }
        } catch { }
    }
    $profileDirectory = [Environment]::GetFolderPath('UserProfile')
    if ($env:USERPROFILE) { $profileDirectory = $env:USERPROFILE }
    $bundled = Join-Path $profileDirectory '.cache\codex-runtimes\codex-primary-runtime\dependencies'
    $node = Find-AsechkaExecutable -Name 'node.exe' -Candidates @(
        $env:ASECHKA_NODE, $saved.node, $legacy.node,
        (Join-Path $bundled 'node\bin\node.exe'),
        ($env:ProgramFiles + '\nodejs\node.exe'),
        ($env:LOCALAPPDATA + '\Programs\nodejs\node.exe')
    )
    $git = Find-AsechkaExecutable -Name 'git.exe' -Candidates @(
        $env:ASECHKA_GIT, $saved.git, $legacy.git,
        (Join-Path $bundled 'native\git\cmd\git.exe'),
        ($env:ProgramFiles + '\Git\cmd\git.exe'),
        (${env:ProgramFiles(x86)} + '\Git\cmd\git.exe'),
        ($env:LOCALAPPDATA + '\Programs\Git\cmd\git.exe')
    )
    return @{ node = $node; git = $git; state = $state }
}

function Save-AsechkaRuntime($Runtime) {
    New-Item -ItemType Directory -Force -Path $Runtime.state | Out-Null
    $json = @{ node = $Runtime.node; git = $Runtime.git } | ConvertTo-Json -Compress
    $target = Join-Path $Runtime.state 'runtime.json'
    $temp = Join-Path $Runtime.state ('runtime-' + [Guid]::NewGuid().ToString('N') + '.tmp')
    [IO.File]::WriteAllText($temp, $json, (New-Object System.Text.UTF8Encoding($false)))
    if ([IO.File]::Exists($target)) {
        $backup = $temp + '.previous'
        [IO.File]::Replace($temp, $target, $backup)
        [IO.File]::Delete($backup)
    }
    else { [IO.File]::Move($temp, $target) }
    $commands = @('@echo off', ('set "ASECHKA_NODE=' + $Runtime.node + '"'), ('set "ASECHKA_GIT=' + $Runtime.git + '"')) -join "`r`n"
    [IO.File]::WriteAllText((Join-Path $Runtime.state 'runtime.cmd'), $commands + "`r`n", [System.Text.Encoding]::Default)
}
