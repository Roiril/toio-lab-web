@echo off
setlocal
cd /d "%~dp0scripts"
echo Launching LLM Server as Administrator...
PowerShell -NoProfile -ExecutionPolicy Bypass -Command "& {Start-Process PowerShell -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File ""%~dp0scripts\start-llm.ps1""' -Verb RunAs}"
endlocal
