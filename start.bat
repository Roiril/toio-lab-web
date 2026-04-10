@echo off
chcp 65001 > nul
echo ===================================
echo   toio Lab Web - 自動起動スクリプト
echo ===================================

powershell -ExecutionPolicy Bypass -File "%~dp0start.ps1"

pause
