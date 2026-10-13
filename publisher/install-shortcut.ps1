param([string]$StudioDirectory = $PSScriptRoot)
$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $StudioDirectory
$state = Join-Path $env:LOCALAPPDATA 'AsechkaStudio'
New-Item -ItemType Directory -Force -Path $state | Out-Null
$nodePath = $env:ASECHKA_NODE
if (-not $nodePath -or -not (Test-Path -LiteralPath $nodePath -PathType Leaf)) {
    $nodePath = (Get-Command node.exe -ErrorAction Stop).Source
}
$gitPath = $env:ASECHKA_GIT
if (-not $gitPath -or -not (Test-Path -LiteralPath $gitPath -PathType Leaf)) {
    $gitPath = (Get-Command git.exe -ErrorAction Stop).Source
}
$runtime = @(
    '@echo off',
    ('set "ASECHKA_NODE=' + $nodePath + '"'),
    ('set "ASECHKA_GIT=' + $gitPath + '"')
) -join "`r`n"
[System.IO.File]::WriteAllText((Join-Path $state 'runtime.cmd'), $runtime + "`r`n", [System.Text.Encoding]::Default)
$runtimeJson = @{ node = $nodePath; git = $gitPath } | ConvertTo-Json -Compress
[System.IO.File]::WriteAllText((Join-Path $state 'runtime.json'), $runtimeJson, (New-Object System.Text.UTF8Encoding($false)))
$desktop = [Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path $desktop 'Asechka Studio.lnk'
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
function ConvertTo-PowerShellLiteral([string]$value) { "'" + $value.Replace("'", "''") + "'" }
$launchFile = Join-Path $StudioDirectory 'launch-gui.ps1'
$launchCommand = '& ([scriptblock]::Create([IO.File]::ReadAllText(' + (ConvertTo-PowerShellLiteral $launchFile) + '))) -StudioDirectory ' + (ConvertTo-PowerShellLiteral $StudioDirectory)
$shortcut.TargetPath = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
$shortcut.Arguments = '-NoProfile -NonInteractive -WindowStyle Hidden -Command "' + $launchCommand + '"'
$shortcut.WorkingDirectory = $project
$shortcut.Description = 'Add quotes and pictures to our little universe, and save them to private GitHub.'
$shortcut.IconLocation = (Join-Path $env:WINDIR 'System32\shell32.dll') + ',208'
$shortcut.WindowStyle = 1
$shortcut.Save()
Write-Output "Created: $shortcutPath"
