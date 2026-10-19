param([string]$SdkRoot="$env:LOCALAPPDATA\AsechkaAndroid\toolchain\sdk")
$ErrorActionPreference='Stop'
$projectRoot=Split-Path $PSScriptRoot -Parent
$env:JAVA_HOME=(Get-ChildItem -LiteralPath "$env:LOCALAPPDATA\AsechkaAndroid\toolchain" -Directory -Filter 'jdk-*' | Select-Object -First 1).FullName
$env:Path="$env:JAVA_HOME\bin;$env:Path"
$platform=Join-Path $SdkRoot 'platforms\android-36\android.jar'
$bt=Join-Path $SdkRoot 'build-tools\36.0.0'
$dir=Join-Path $projectRoot 'build\tests'
New-Item -ItemType Directory -Path "$dir\classes","$dir\generated","$dir\dex" -Force | Out-Null
function Run-Tool([string]$Exe,[string[]]$ToolArgs){ & $Exe @ToolArgs; if($LASTEXITCODE -ne 0){throw "$Exe failed"} }
Run-Tool "$bt\aapt2.exe" @('link','-o',"$dir\unsigned.apk",'-I',$platform,'--manifest',"$projectRoot\app\src\androidTest\AndroidManifest.xml",'--java',"$dir\generated")
$cp="$platform;$projectRoot\build\debug\classes"
$sources=@(Get-ChildItem -LiteralPath "$projectRoot\app\src\androidTest\java" -Recurse -Filter '*.java' | ForEach-Object {'"'+$_.FullName.Replace('\','/')+'"'})
[IO.File]::WriteAllLines("$dir\sources.txt",$sources,[Text.UTF8Encoding]::new($false))
Run-Tool "$env:JAVA_HOME\bin\javac.exe" @('--release','17','-encoding','UTF-8','-classpath',$cp,'-d',"$dir\classes","@$dir\sources.txt")
Run-Tool "$env:JAVA_HOME\bin\jar.exe" @('--create','--file',"$dir\classes.jar",'-C',"$dir\classes",'.')
Run-Tool "$bt\d8.bat" @('--lib',$platform,'--classpath',"$projectRoot\build\debug\classes.jar",'--min-api','23','--output',"$dir\dex","$dir\classes.jar")
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive=[IO.Compression.ZipFile]::Open("$dir\unsigned.apk",[IO.Compression.ZipArchiveMode]::Update)
try{[IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive,"$dir\dex\classes.dex",'classes.dex')|Out-Null}finally{$archive.Dispose()}
Run-Tool "$bt\zipalign.exe" @('-f','4',"$dir\unsigned.apk","$dir\aligned.apk")
$keyDir=Join-Path $env:LOCALAPPDATA 'AsechkaAndroid\signing'
$secure=(Get-Content -LiteralPath "$keyDir\password.dpapi" -Raw).Trim() | ConvertTo-SecureString
$env:ASECHKA_KEYSTORE_PASSWORD=[Net.NetworkCredential]::new('',$secure).Password
try{Run-Tool "$bt\apksigner.bat" @('sign','--ks',"$keyDir\asechka-release.jks",'--ks-key-alias','asechka','--ks-pass','env:ASECHKA_KEYSTORE_PASSWORD','--out',"$dir\native-tests.apk","$dir\aligned.apk")}finally{Remove-Item Env:ASECHKA_KEYSTORE_PASSWORD}
Write-Output 'Native instrumentation APK ready'
