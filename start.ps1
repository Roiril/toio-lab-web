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
        Write-Host "Ollamaのインストールが完了しました。" -ForegroundColor Green
    } else {
        Write-Host "Ollamaのアップデートを確認しています..." -ForegroundColor Gray
        $upgradeOutput = winget upgrade Ollama.Ollama --accept-source-agreements --accept-package-agreements 2>&1 | Out-String
        if ($upgradeOutput -match "見つかりませんでした|No applicable update|No available") {
            Write-Host "Ollama本体は最新バージョンです。" -ForegroundColor Green
        } else {
            Write-Host "アップデート処理を完了しました。" -ForegroundColor Green
        }
    }

    # [2/4] Ollamaサーバーの起動確認
    Write-Host "[2/4] Ollamaサーバーの起動確認..." -ForegroundColor Cyan
    $ollamaProcess = Get-Process -Name "ollama" -ErrorAction SilentlyContinue
    if (-Not $ollamaProcess) {
        Write-Host "Ollamaサーバーを起動しています..." -ForegroundColor Yellow
        $env:OLLAMA_ORIGINS = "*"
        Start-Process -FilePath $ollamaPath -ArgumentList "serve" -WindowStyle Hidden
        Start-Sleep -Seconds 3 # 起動待機
        Write-Host "Ollamaサーバーをバックグラウンドで起動しました。" -ForegroundColor Green
    } else {
        Write-Host "Ollamaサーバーは既に実行中です。" -ForegroundColor Green
    }

    # [3/4] AIモデルの確認とダウンロード
    Write-Host "[3/4] AIモデル ($targetModel) の確認中..." -ForegroundColor Cyan
    $models = & $ollamaPath list | Out-String
    if ($models -notmatch $targetModel) {
        Write-Host "モデル '$targetModel' が見つかりません。ダウンロードを開始します（数分かかる場合があります）..." -ForegroundColor Yellow
        & $ollamaPath pull $targetModel
        if ($LASTEXITCODE -ne 0) { throw "モデルのダウンロードに失敗しました。" }
        Write-Host "モデルの準備が完了しました。" -ForegroundColor Green
    } else {
        Write-Host "モデル '$targetModel' は準備済みです。" -ForegroundColor Green
    }

    # [4/4] npx serveでローカルサーバーを起動
    Write-Host "[4/4] Webサーバー(npx serve)を起動中..." -ForegroundColor Cyan
    if (-not (Get-Command npx -ErrorAction SilentlyContinue)) {
        throw "npx コマンドが見つかりません。Node.jsがインストールされているか確認してください。"
    }
    
    Write-Host "ブラウザで http://localhost:3000 にアクセスしてください。" -ForegroundColor Green
    Write-Host "サーバーを停止するにはこのウィンドウを閉じるか Ctrl+C を入力してください。" -ForegroundColor Gray
    
    npx serve .

} catch {
    Write-Host "`n[エラー発生] 処理を中断しました。" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host "--- 詳細情報 ---" -ForegroundColor Yellow
    Write-Host $_.ScriptStackTrace -ForegroundColor Yellow
}

Read-Host "Press Enter to exit"
