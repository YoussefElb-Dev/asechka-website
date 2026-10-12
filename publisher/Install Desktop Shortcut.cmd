@echo off
setlocal
cd /d "%~dp0.."
if exist "%LOCALAPPDATA%\AsechkaStudio\runtime.cmd" call "%LOCALAPPDATA%\AsechkaStudio\runtime.cmd"
node "%~dp0install-shortcut.mjs"
pause
endlocal
