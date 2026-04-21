@echo off
REM Start both LLM server and app in the same terminal
setlocal
cd /d "%~dp0"
echo Starting toio Lab Web...
echo Please wait...
timeout /t 2 /nobreak
echo.
echo [1] Starting LLM Server...
start cmd /c "call scripts\start-llm.bat"
timeout /t 5 /nobreak
echo.
echo [2] Starting App Server...
start cmd /c "call scripts\start-app.bat"
endlocal
