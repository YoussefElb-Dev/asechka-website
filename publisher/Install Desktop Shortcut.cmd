@echo off
setlocal
set "ASECHKA_PUBLISHER_DIRECTORY=%~dp0"
call "%ASECHKA_PUBLISHER_DIRECTORY%resolve-runtime.cmd"
if errorlevel 1 goto stopped
cd /d "%ASECHKA_PUBLISHER_DIRECTORY%.."
"%ASECHKA_NODE%" "%ASECHKA_PUBLISHER_DIRECTORY%install-shortcut.mjs"
set "ASECHKA_EXIT_CODE=%ERRORLEVEL%"
pause
endlocal & exit /b %ASECHKA_EXIT_CODE%

:stopped
pause
endlocal & exit /b 1
