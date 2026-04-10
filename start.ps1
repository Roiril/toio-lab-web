# 実行ポリシーをバイパスしてスクリプトを実行できるようにするおまじない
if (!([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Warning "管理者権限で実行されていないため、一部の機能が制限される場合があります。インストールに失敗する場合は管理者として実行してください。"
}

try {
    Write-Host "--- toio Lab Web 起動処理開始 ---" -ForegroundColor Cyan

    # Ollamaのパスを設定 (インストール先)
    $ollamaPath = "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe"

    # Ollamaのインストールとアップデート確認
    Write-Host "[1/3] Ollamaの状態を確認中..." -ForegroundColor Cyan
    if (-Not (Test-Path $ollamaPath)) {
        Write-Host "Ollamaが見つかりません。wingetを使用してインストールを開始します..." -ForegroundColor Yellow
        winget install Ollama.Ollama --accept-source-agreements --accept-package-agreements
        if ($LASTEXITCODE -ne 0) { throw "Ollamaのインストールに失敗しました。(ExitCode: $LASTEXITCODE)" }
        Write-Host "Ollamaのインストールが完了しました。" -ForegroundColor Green
    } else {
        Write-Host "Ollamaのアップデートを確認しています..." -ForegroundColor Gray
        $upgradeOutput = winget upgrade Ollama.Ollama --accept-source-agreements --accept-package-agreements 2>&1 | Out-String
        
        if ($upgradeOutput -match "見つかりませんでした|No applicable update|No available") {
            Write-Host "Ollamaは最新バージョンです。" -ForegroundColor Green
        } else {
            Write-Host "アップデート処理を完了しました。" -ForegroundColor Green
        }
    }

    # Ollamaが起動しているか確認
    Write-Host "[2/3] Ollamaサーバーの起動確認..." -ForegroundColor Cyan
    $ollamaProcess = Get-Process -Name "ollama" -ErrorAction SilentlyContinue
    if (-Not $ollamaProcess) {
        Write-Host "Ollamaサーバーを起動しています..." -ForegroundColor Yellow
        $env:OLLAMA_ORIGINS = "*"
        Start-Process -FilePath $ollamaPath -ArgumentList "serve" -WindowStyle Hidden
        Start-Sleep -Seconds 3
        Write-Host "Ollamaサーバーをバックグラウンドで起動しました。" -ForegroundColor Green
    } else {
        Write-Host "Ollamaサーバーは既に実行中です。" -ForegroundColor Green
    }

    # npx serveでローカルサーバーを起動
    Write-Host "[3/3] Webサーバー(npx serve)を起動中..." -ForegroundColor Cyan
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
