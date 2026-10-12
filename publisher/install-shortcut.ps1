param([string]$StudioDirectory = $PSScriptRoot)
$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $StudioDirectory
$state = Join-Path $env:LOCALAPPDATA 'AsechkaStudio'
New-Item -ItemType Directory -Force -Path $state | Out-Null
$nodePath = (Get-Command node.exe -ErrorAction Stop).Source
$gitPath = (Get-Command git.exe -ErrorAction Stop).Source
$runtime = @(
    '@echo off',
    ('set "PATH=' + (Split-Path -Parent $nodePath) + ';' + (Split-Path -Parent $gitPath) + ';%PATH%"'),
    ('set "ASECHKA_GIT=' + $gitPath + '"')
) -join "`r`n"
[System.IO.File]::WriteAllText((Join-Path $state 'runtime.cmd'), $runtime + "`r`n", [System.Text.Encoding]::Default)
$desktop = [Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path $desktop 'Asechka Studio.lnk'
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = Join-Path $StudioDirectory 'Start Asechka Studio.cmd'
$shortcut.Arguments = ''
$shortcut.WorkingDirectory = $project
$shortcut.Description = 'Add quotes and pictures to our little universe, and save them to private GitHub.'
$shortcut.IconLocation = (Join-Path $env:WINDIR 'System32\cmd.exe') + ',0'
$shortcut.WindowStyle = 1
$shortcut.Save()
Write-Output "Created: $shortcutPath"
