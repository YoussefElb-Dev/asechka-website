param([Parameter(Mandatory = $true)][string]$StudioDirectory, [switch]$NoErrorDialog, [switch]$PassThru)
$ErrorActionPreference = 'Stop'
try {
    . ([scriptblock]::Create([IO.File]::ReadAllText((Join-Path $StudioDirectory 'runtime.ps1'))))
    $runtime = Get-AsechkaRuntime
    # The paths are already usable; a cache write failure must not prevent opening the app.
    try { Save-AsechkaRuntime $runtime } catch { }
    $env:ASECHKA_GIT = $runtime.git
    $env:PATH = (Join-Path $env:WINDIR 'System32') + ';' + (Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0') + ';' + (Join-Path $env:WINDIR 'System32\OpenSSH') + ';' + $env:PATH
    $env:PSModulePath = $null
    $guiFile = Join-Path $StudioDirectory 'gui.mjs'
    $child = Start-Process -FilePath $runtime.node -ArgumentList ('"' + $guiFile + '"') -WorkingDirectory (Split-Path -Parent $StudioDirectory) -WindowStyle Hidden -PassThru
    if ($PassThru) { Write-Output $child.Id }
} catch {
    if ($NoErrorDialog) { [Console]::Error.WriteLine($_.Exception.Message); exit 1 }
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.MessageBox]::Show($_.Exception.Message + "`n`nYour saved drafts are safe.", 'Asechka Studio') | Out-Null
    exit 1
}
