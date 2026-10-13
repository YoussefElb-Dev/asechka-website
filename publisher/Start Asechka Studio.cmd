@echo off
setlocal
title Asechka Studio
set "ASECHKA_PUBLISHER_DIRECTORY=%~dp0"
call "%ASECHKA_PUBLISHER_DIRECTORY%resolve-runtime.cmd"
if errorlevel 1 goto stopped
cd /d "%ASECHKA_PUBLISHER_DIRECTORY%.."
"%ASECHKA_NODE%" "%ASECHKA_PUBLISHER_DIRECTORY%studio.mjs"
if errorlevel 1 goto stopped
endlocal & exit /b 0

:stopped
echo.
echo Asechka Studio stopped. Your saved drafts are still on this computer.
pause
endlocal & exit /b 1
