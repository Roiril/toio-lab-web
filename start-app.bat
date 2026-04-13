@echo off
setlocal
cd /d "%~dp0"
PowerShell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-app.ps1"
if %ERRORLEVEL% neq 0 pause
endlocal
