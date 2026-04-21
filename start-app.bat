@echo off
setlocal
cd /d "%~dp0scripts"
PowerShell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-app.ps1"
if %ERRORLEVEL% neq 0 pause
endlocal
