@echo off
chcp 65001 > nul
echo ===================================
echo   toio Lab Web - 自動起動スクリプト
echo ===================================

powershell -NoProfile -ExecutionPolicy Bypass -Command "& { try { . '%~dp0start.ps1' } catch { Write-Host '致命的なエラーが発生しました: ' + $_.Exception.Message -ForegroundColor Red; pause } }"

if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERROR] PowerShellの実行中に問題が発生しました。
    pause
)
