@echo off
setlocal
cd /d "%~dp0"
echo Launching LLM Server as Administrator...
PowerShell -NoProfile -ExecutionPolicy Bypass -Command "& {Start-Process PowerShell -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File ""%~dp0start-llm.ps1""' -Verb RunAs}"
endlocal
