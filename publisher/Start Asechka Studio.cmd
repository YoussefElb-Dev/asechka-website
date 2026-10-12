@echo off
setlocal
title Asechka Studio
cd /d "%~dp0.."
if exist "%LOCALAPPDATA%\AsechkaStudio\runtime.cmd" (
  call "%LOCALAPPDATA%\AsechkaStudio\runtime.cmd"
)
node "%~dp0studio.mjs"
if errorlevel 1 (
  echo.
  echo Asechka Studio stopped. Your saved drafts are still on this computer.
  pause
)
endlocal
