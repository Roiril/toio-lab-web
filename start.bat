@echo off
setlocal
cd /d "%~dp0"

echo Launching toio Lab Web...

PowerShell -NoProfile -ExecutionPolicy Bypass -File "start.ps1"

if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERROR] An error occurred during script execution.
    echo Please check if PowerShell is working correctly.
    echo.
    pause
)
endlocal
