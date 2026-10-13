@echo off
if exist "%LOCALAPPDATA%\AsechkaStudio\runtime.cmd" call "%LOCALAPPDATA%\AsechkaStudio\runtime.cmd"

if defined ASECHKA_NODE if not exist "%ASECHKA_NODE%" set "ASECHKA_NODE="
if not defined ASECHKA_NODE if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" set "ASECHKA_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if not defined ASECHKA_NODE for /f "delims=" %%N in ('"%SystemRoot%\System32\where.exe" node.exe 2^>nul') do if not defined ASECHKA_NODE set "ASECHKA_NODE=%%N"
if not defined ASECHKA_NODE (
  echo Asechka Studio could not find its saved Node.js installation.
  echo Your drafts are safe. Please ask for help repairing the shortcut.
  exit /b 1
)

if defined ASECHKA_GIT if not exist "%ASECHKA_GIT%" set "ASECHKA_GIT="
if not defined ASECHKA_GIT if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\git\cmd\git.exe" set "ASECHKA_GIT=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\git\cmd\git.exe"
if not defined ASECHKA_GIT for /f "delims=" %%G in ('"%SystemRoot%\System32\where.exe" git.exe 2^>nul') do if not defined ASECHKA_GIT set "ASECHKA_GIT=%%G"
if not defined ASECHKA_GIT (
  echo Asechka Studio could not find its saved Git installation.
  echo Your drafts are safe. Please ask for help repairing the shortcut.
  exit /b 1
)

set "PATH=%SystemRoot%\System32;%SystemRoot%\System32\WindowsPowerShell\v1.0;%SystemRoot%\System32\OpenSSH;%PATH%"
exit /b 0
