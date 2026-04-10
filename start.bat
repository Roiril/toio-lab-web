@echo off
chcp 65001 > nul
echo ===================================
echo   toio Lab Web - 簡易起動スクリプト
echo ===================================

echo [1/2] Ollamaの起動状態を確認中...
tasklist /FI "IMAGENAME eq ollama.exe" 2>NUL | find /I /N "ollama.exe">NUL
if "%ERRORLEVEL%"=="0" (
    echo Ollamaは既に実行中です。
) else (
    echo Ollamaサーバーをバックグラウンドで起動します...
    set OLLAMA_ORIGINS=*
    start /B "" "%LOCALAPPDATA%\Programs\Ollama\ollama.exe" serve
    timeout /t 3 /nobreak > nul
)

echo.
echo [2/2] Webサーバーを起動します...
echo 起動後、ブラウザで表示されるURL( http://localhost:3000 )にアクセスしてください。
echo.
call npx serve .

pause
