# 実行ポリシーをバイパスしてスクリプトを実行できるようにするおまじない
if (!([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Warning "管理者権限で実行されていないため、一部の機能が制限される場合があります。インストールに失敗する場合は管理者として実行してください。"
}

try {
    Write-Host "--- toio Lab Web 起動処理開始 ---" -ForegroundColor Cyan

    # 設定
    $ollamaPath = "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe"
    $targetModel = "gemma4:e4b"

    # [1/4] Ollama本体のインストールとアップデート確認
    Write-Host "[1/4] Ollama本体の状態を確認中..." -ForegroundColor Cyan
    if (-Not (Test-Path $ollamaPath)) {
        Write-Host "Ollamaが見つかりません。wingetを使用してインストールを開始します..." -ForegroundColor Yellow
        winget install Ollama.Ollama --accept-source-agreements --accept-package-agreements
        if ($LASTEXITCODE -ne 0) { throw "Ollamaのインストールに失敗しました。(ExitCode: $LASTEXITCODE)" }
        Write-Host "[OK] Ollamaのインストールが完了しました。" -ForegroundColor Green
    } else {
        Write-Host "Ollamaのアップデートがあるか確認しています (winget)..." -ForegroundColor Gray
        # 直接実行して進行状況を見せる（Out-Stringでキャプチャしないことでフリーズ感を防ぐ）
        & winget upgrade Ollama.Ollama --accept-source-agreements --accept-package-agreements
        Write-Host "[OK] Ollama本体の確認が完了しました。" -ForegroundColor Green
    }

    # [2/4] Ollamaサーバーの起動確認
    Write-Host "[2/4] Ollamaサーバーの起動確認..." -ForegroundColor Cyan
    $ollamaProcess = Get-Process -Name "ollama" -ErrorAction SilentlyContinue
    if (-Not $ollamaProcess) {
        Write-Host "Ollamaサーバーを起動しています..." -ForegroundColor Yellow
        $env:OLLAMA_ORIGINS = "*"
        Start-Process -FilePath $ollamaPath -ArgumentList "serve" -WindowStyle Hidden
        for ($i=3; $i -gt 0; $i--) {
             Write-Host ("   起動待機中... あと " + $i + " 秒") -ForegroundColor Gray
             Start-Sleep -Seconds 1
        }
        Write-Host "[OK] Ollamaサーバーをバックグラウンドで起動しました。" -ForegroundColor Green
    } else {
        Write-Host "Ollamaサーバーは既に実行中です。" -ForegroundColor Green
    }

    # [3/4] AIモデルの確認とダウンロード
    Write-Host "[3/4] AIモデル ($targetModel) の確認中..." -ForegroundColor Cyan
    Write-Host "   現在のモデル一覧を取得中..." -ForegroundColor Gray
    $models = & $ollamaPath list | Out-String
    if ($models -notmatch $targetModel) {
        Write-Host "   モデル '$targetModel' が見つかりません。ダウンロードを開始します（数分かかる場合があります）..." -ForegroundColor Yellow
        & $ollamaPath pull $targetModel
        if ($LASTEXITCODE -ne 0) { throw "モデルのダウンロードに失敗しました。" }
        Write-Host "[OK] モデルの準備が完了しました。" -ForegroundColor Green
    } else {
        Write-Host "[OK] モデル '$targetModel' は準備済みです。" -ForegroundColor Green
    }

    # [4/4] npx serveでローカルサーバーを起動
    Write-Host "[4/4] Webサーバー(npx serve)を起動中..." -ForegroundColor Cyan
    if (-not (Get-Command npx -ErrorAction SilentlyContinue)) {
        throw "npx コマンドが見つかりません。Node.jsがインストールされているか確認してください。"
    }
    
    Write-Host "===============================================" -ForegroundColor Green
    Write-Host "  起動完了! ブラウザで以下にアクセスしてください:" -ForegroundColor Green
    Write-Host "  http://localhost:3000" -ForegroundColor White -BackgroundColor DarkCyan
    Write-Host "===============================================" -ForegroundColor Green
    Write-Host "`nサーバーを停止するにはこのウィンドウを閉じるか Ctrl+C を入力してください。" -ForegroundColor Gray
    
    npx serve .

} catch {
    Write-Host "`n[エラー発生] 処理を中断しました。" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host "--- 詳細情報 ---" -ForegroundColor Yellow
    Write-Host $_.ScriptStackTrace -ForegroundColor Yellow
}

Read-Host "Press Enter to exit"
