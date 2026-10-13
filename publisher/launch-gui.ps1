param([Parameter(Mandatory = $true)][string]$StudioDirectory)
$ErrorActionPreference = 'Stop'
try {
    $runtimeFile = Join-Path $env:LOCALAPPDATA 'AsechkaStudio\runtime.json'
    $runtime = Get-Content -LiteralPath $runtimeFile -Raw -Encoding UTF8 | ConvertFrom-Json
    if (-not (Test-Path -LiteralPath $runtime.node -PathType Leaf)) { throw 'The saved Node.js installation could not be found. Please repair the Studio shortcut.' }
    if (-not (Test-Path -LiteralPath $runtime.git -PathType Leaf)) { throw 'The saved Git installation could not be found. Please repair the Studio shortcut.' }
    $env:ASECHKA_GIT = $runtime.git
    $env:PATH = (Join-Path $env:WINDIR 'System32') + ';' + (Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0') + ';' + (Join-Path $env:WINDIR 'System32\OpenSSH') + ';' + $env:PATH
    $env:PSModulePath = $null
    $guiFile = Join-Path $StudioDirectory 'gui.mjs'
    Start-Process -FilePath $runtime.node -ArgumentList ('"' + $guiFile + '"') -WorkingDirectory (Split-Path -Parent $StudioDirectory) -WindowStyle Hidden
} catch {
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.MessageBox]::Show($_.Exception.Message + "`n`nYour saved drafts are safe.", 'Asechka Studio') | Out-Null
    exit 1
}
