param([string]$StudioDirectory = $PSScriptRoot)
$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $StudioDirectory
. ([scriptblock]::Create([IO.File]::ReadAllText((Join-Path $StudioDirectory 'runtime.ps1'))))
$runtime = Get-AsechkaRuntime
Save-AsechkaRuntime $runtime
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
