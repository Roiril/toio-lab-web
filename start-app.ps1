try {
    Write-Host "--- toio Lab Web [アプリ起動] ---" -ForegroundColor Cyan

    # .env.local の読み込み
    $envPath = Join-Path $PSScriptRoot ".env.local"
    $geminiApiKey = ""
    $geminiModel = "gemini-2.5-flash"

    if (Test-Path $envPath) {
        Get-Content $envPath | ForEach-Object {
            if ($_ -match "^GEMINI_API_KEY=(.+)$") { $geminiApiKey = $Matches[1].Trim() }
            if ($_ -match "^GEMINI_MODEL=(.+)$")   { $geminiModel  = $Matches[1].Trim() }
        }
        Write-Host "[OK] .env.local を読み込みました。" -ForegroundColor Green
    } else {
        Write-Host "[警告] .env.local が見つかりません。APIキーなしで起動します。" -ForegroundColor Yellow
        Write-Host "       .env.local を作成し GEMINI_API_KEY=<your-key> を記載してください。" -ForegroundColor Gray
    }

    if ([string]::IsNullOrWhiteSpace($geminiApiKey)) {
        Write-Host "[警告] GEMINI_API_KEY が設定されていません。起動後にUIから入力してください。" -ForegroundColor Yellow
    }

    # config.js の生成
    Write-Host "`n設定ファイル (js/config.js) を生成しています..." -ForegroundColor Cyan
    $configPath = Join-Path $PSScriptRoot "js\config.js"
    $configContent = @"
// .env.local から生成されたファイルです。git管理外。
window.APP_CONFIG = {
    GEMINI_API_KEY: "$geminiApiKey",
    GEMINI_MODEL: "$geminiModel"
};
"@
    Set-Content -Path $configPath -Value $configContent -Encoding UTF8
    Write-Host "[OK] 設定ファイルを生成しました。" -ForegroundColor Green

    if (-not (Get-Command npx -ErrorAction SilentlyContinue)) {
        Write-Host "`n[エラー] npx コマンドが見つかりません。Node.jsがインストールされているか確認してください。" -ForegroundColor Red
    } else {
        Write-Host "`n===============================================" -ForegroundColor Green
        Write-Host "  起動完了！ブラウザで以下にアクセスしてください:" -ForegroundColor Green
        Write-Host "  http://localhost:3000" -ForegroundColor White -BackgroundColor DarkCyan
        Write-Host "===============================================" -ForegroundColor Green
        Write-Host "`nサーバーを停止するにはこのウィンドウを閉じるか Ctrl+C を押してください。" -ForegroundColor Gray

        npx -y serve@latest . -l 3000
    }
} catch {
    Write-Host "`n[エラー] 予期せぬエラーが発生しました。" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
}

Write-Host "`n終了しました。" -ForegroundColor Gray
Read-Host "Enterキーを押すとウィンドウを閉じます"
