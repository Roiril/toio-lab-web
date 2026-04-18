try {
    Write-Host "--- toio Lab Web [アプリ起動] ---" -ForegroundColor Cyan

    # .env.local の読み込み
    $envPath = Join-Path $PSScriptRoot ".env.local"
    $llmProvider = "gemini"
    $geminiApiKey = ""
    $geminiModel = "gemini-2.5-flash"
    $ollamaBaseUrl = "http://localhost:11434"
    $ollamaModel = "gemma4:e4b"

    if (Test-Path $envPath) {
        foreach ($line in (Get-Content $envPath)) {
            if ($line -match "^LLM_PROVIDER=(.+)$") { $llmProvider = $Matches[1].Trim() }
            if ($line -match "^GEMINI_API_KEY=(.+)$") { $geminiApiKey = $Matches[1].Trim() }
            if ($line -match "^GEMINI_MODEL=(.+)$") { $geminiModel = $Matches[1].Trim() }
            if ($line -match "^OLLAMA_BASE_URL=(.+)$") { $ollamaBaseUrl = $Matches[1].Trim() }
            if ($line -match "^OLLAMA_MODEL=(.+)$") { $ollamaModel = $Matches[1].Trim() }
        }
        Write-Host "[OK] .env.local を読み込みました。" -ForegroundColor Green
    }
    else {
        Write-Host "[警告] .env.local が見つかりません。デフォルト設定で起動します。" -ForegroundColor Yellow
        Write-Host "       必要に応じて.env.localを作成し各種キーを記載してください。" -ForegroundColor Gray
    }

    if ($llmProvider -eq "gemini" -and [string]::IsNullOrWhiteSpace($geminiApiKey)) {
        Write-Host "[警告] GEMINI_API_KEY が設定されていません。起動後にUIから入力するか、Ollamaプロバイダーを使用してください。" -ForegroundColor Yellow
    }

    # config.js の生成
    Write-Host "`n設定ファイル (js/config.js) を生成しています..." -ForegroundColor Cyan
    $configPath = Join-Path $PSScriptRoot "js\config.js"
    $configContent = @"
// .env.local から生成されたファイルです。git管理外。
window.APP_CONFIG = {
    LLM_PROVIDER: "$llmProvider",
    GEMINI_API_KEY: "$geminiApiKey",
    GEMINI_MODEL: "$geminiModel",
    OLLAMA_BASE_URL: "$ollamaBaseUrl",
    OLLAMA_MODEL: "$ollamaModel"
};
"@
    Set-Content -Path $configPath -Value $configContent -Encoding UTF8
    Write-Host "[OK] 設定ファイルを生成しました。" -ForegroundColor Green

    if (-not (Get-Command npx -ErrorAction SilentlyContinue)) {
        Write-Host "`n[エラー] npx コマンドが見つかりません。Node.jsがインストールされているか確認してください。" -ForegroundColor Red
    }
    else {
        Write-Host "`nローカルサーバーを起動しています..." -ForegroundColor Cyan
        Write-Host "起動完了後、画面に表示される URL (Local: http://localhost:...) へブラウザでアクセスしてください。" -ForegroundColor Green
        Write-Host "`nサーバーを停止するにはこのウィンドウを閉じるか Ctrl+C を押してください。" -ForegroundColor Gray
        Write-Host "--------------------------------------------------------" -ForegroundColor Gray

        npx -y serve@latest . -l 3000
    }
}
catch {
    Write-Host "`n[エラー] 予期せぬエラーが発生しました。" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
}

Write-Host "`n終了しました。" -ForegroundColor Gray
Read-Host "Enterキーを押すとウィンドウを閉じます"
