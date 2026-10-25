param([string]$SdkRoot = "$env:LOCALAPPDATA\AsechkaAndroid\toolchain\sdk", [string]$JavaHome = '', [switch]$Debug)
$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
if (!$JavaHome) { $JavaHome = (Get-ChildItem -LiteralPath "$env:LOCALAPPDATA\AsechkaAndroid\toolchain" -Directory -Filter 'jdk-*' | Select-Object -First 1).FullName }
if (!(Test-Path -LiteralPath "$JavaHome\bin\javac.exe")) { throw 'Set -JavaHome to a JDK 21 installation.' }
$env:JAVA_HOME = $JavaHome
$env:Path = "$JavaHome\bin;$env:Path"
$buildTools = Join-Path $SdkRoot 'build-tools\36.0.0'
$platform = Join-Path $SdkRoot 'platforms\android-36\android.jar'
if (!(Test-Path -LiteralPath $platform)) { throw 'Install platforms;android-36 and build-tools;36.0.0 using the Android SDK manager.' }
$buildRoot = Join-Path $projectRoot 'build'
$variant = if ($Debug) { 'debug' } else { 'release' }
$buildDir = Join-Path $buildRoot $variant
$classes = Join-Path $buildDir 'classes'
$generated = Join-Path $buildDir 'generated'
$dex = Join-Path $buildDir 'dex'
New-Item -ItemType Directory -Path $classes,$generated,$dex -Force | Out-Null
function Run-Tool([string]$Exe, [string[]]$ToolArgs) {
    & $Exe @ToolArgs
    if ($LASTEXITCODE -ne 0) { throw "$Exe failed with exit code $LASTEXITCODE" }
}
$manifest = [xml](Get-Content -LiteralPath "$projectRoot\app\src\main\AndroidManifest.xml" -Raw)
$manifest.DocumentElement.SetAttribute('package','app.asechka.android')
$manifest.manifest.application.SetAttribute('debuggable','http://schemas.android.com/apk/res/android',$(if ($Debug) {'true'} else {'false'})) | Out-Null
if ($Debug) { $manifest.manifest.application.SetAttribute('usesCleartextTraffic','http://schemas.android.com/apk/res/android','true') | Out-Null }
$manifestPath = Join-Path $buildDir 'AndroidManifest.xml'
$manifest.Save($manifestPath)
$resZip = Join-Path $buildDir 'resources.zip'
$unsigned = Join-Path $buildDir 'unsigned.apk'
Run-Tool "$buildTools\aapt2.exe" @('compile','--dir',"$projectRoot\app\src\main\res",'-o',$resZip)
Run-Tool "$buildTools\aapt2.exe" @('link','-o',$unsigned,'-I',$platform,'--manifest',$manifestPath,'-R',$resZip,'--java',$generated,'--min-sdk-version','23','--target-sdk-version','36','--version-code','9','--version-name','2.2.0','--auto-add-overlay','-A',"$projectRoot\app\src\main\assets")
$sources = @(Get-ChildItem -LiteralPath "$projectRoot\app\src\main\java",$generated -Recurse -Filter '*.java' | ForEach-Object { '"' + $_.FullName.Replace('\','/') + '"' })
$sourceList = Join-Path $buildDir 'sources.txt'
[System.IO.File]::WriteAllLines($sourceList,$sources,[System.Text.UTF8Encoding]::new($false))
Run-Tool "$JavaHome\bin\javac.exe" @('--release','17','-encoding','UTF-8','-classpath',$platform,'-d',$classes,"@$sourceList")
$classJar = Join-Path $buildDir 'classes.jar'
Run-Tool "$JavaHome\bin\jar.exe" @('--create','--file',$classJar,'-C',$classes,'.')
Run-Tool "$buildTools\d8.bat" @('--lib',$platform,'--min-api','23','--output',$dex,$classJar)
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::Open($unsigned,[System.IO.Compression.ZipArchiveMode]::Update)
try {
    Get-ChildItem -LiteralPath $dex -Filter '*.dex' | ForEach-Object { [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive,$_.FullName,$_.Name,[System.IO.Compression.CompressionLevel]::Optimal) | Out-Null }
    # Windows aapt2 can emit asset entry names containing backslashes. Android AssetManager requires '/'.
    foreach ($entry in @($archive.Entries | Where-Object { $_.FullName.Contains('\') })) {
        $newEntry = $archive.CreateEntry($entry.FullName.Replace('\','/'),[System.IO.Compression.CompressionLevel]::Optimal)
        $inputStream = $entry.Open()
        $outputStream = $newEntry.Open()
        try { $inputStream.CopyTo($outputStream) } finally { $inputStream.Dispose(); $outputStream.Dispose() }
        $entry.Delete()
    }
} finally { $archive.Dispose() }
$aligned = Join-Path $buildDir 'aligned.apk'
Run-Tool "$buildTools\zipalign.exe" @('-f','4',$unsigned,$aligned)
$keyDir = Join-Path $env:LOCALAPPDATA 'AsechkaAndroid\signing'
New-Item -ItemType Directory -Path $keyDir -Force | Out-Null
$keyFile = Join-Path $keyDir 'asechka-release.jks'
$passwordFile = Join-Path $keyDir 'password.dpapi'
if (!(Test-Path -LiteralPath $passwordFile)) {
    if (Test-Path -LiteralPath $keyFile) { throw 'Signing key exists but its protected password is missing. Restore the password file before building an update.' }
    $bytes = New-Object byte[] 36
    [System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
    $secure = ConvertTo-SecureString ([Convert]::ToBase64String($bytes)) -AsPlainText -Force
    $secure | ConvertFrom-SecureString | Set-Content -LiteralPath $passwordFile
}
$secure = (Get-Content -LiteralPath $passwordFile -Raw).Trim() | ConvertTo-SecureString
$env:ASECHKA_KEYSTORE_PASSWORD = [System.Net.NetworkCredential]::new('',$secure).Password
try {
    if (!(Test-Path -LiteralPath $keyFile)) { Run-Tool "$JavaHome\bin\keytool.exe" @('-genkeypair','-noprompt','-keystore',$keyFile,'-alias','asechka','-keyalg','RSA','-keysize','4096','-validity','36500','-dname','CN=Asechka, O=Asechka','-storepass:env','ASECHKA_KEYSTORE_PASSWORD','-keypass:env','ASECHKA_KEYSTORE_PASSWORD') }
    $apk = Join-Path $buildRoot $(if ($Debug) {'Asechka-debug.apk'} else {'Asechka.apk'})
    Run-Tool "$buildTools\apksigner.bat" @('sign','--ks',$keyFile,'--ks-key-alias','asechka','--ks-pass','env:ASECHKA_KEYSTORE_PASSWORD','--key-pass','env:ASECHKA_KEYSTORE_PASSWORD','--v1-signing-enabled','true','--v2-signing-enabled','true','--v3-signing-enabled','true','--v4-signing-enabled','false','--out',$apk,$aligned)
    Run-Tool "$buildTools\apksigner.bat" @('verify','--verbose',$apk)
    $hash=(Get-FileHash -LiteralPath $apk -Algorithm SHA256).Hash.ToLower()
    [System.IO.File]::WriteAllText("$apk.sha256","$hash  $([System.IO.Path]::GetFileName($apk))`n")
    Write-Output "Built $apk"
    Write-Output "SHA256 $hash"
} finally { Remove-Item Env:ASECHKA_KEYSTORE_PASSWORD -ErrorAction SilentlyContinue }
