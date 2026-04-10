# 実行ポリシーをバイパスしてスクリプトを実行できるようにするおまじない
if (!([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Warning "管理者権限で実行されていないため、一部の機能が制限される場合があります。"
}

Write-Host "toio Lab Web 起動スクリプト" -ForegroundColor Cyan

# Ollamaのパスを設定 (インストール先)
$ollamaPath = "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe"

# Ollamaのインストールとアップデート確認
if (-Not (Test-Path $ollamaPath)) {
    Write-Host "Ollamaが見つかりません。インストールを開始します（少し時間がかかります）..." -ForegroundColor Yellow
    winget install Ollama.Ollama --accept-source-agreements --accept-package-agreements | Out-Null
    Write-Host "Ollamaのインストールが完了しました。" -ForegroundColor Green
} else {
    Write-Host "Ollamaのアップデートを確認しています..." -ForegroundColor Cyan
    $upgradeOutput = winget upgrade Ollama.Ollama --accept-source-agreements --accept-package-agreements 2>&1 | Out-String
    
    if ($upgradeOutput -match "見つかりませんでした|No applicable update|No available") {
        Write-Host "Ollamaは最新バージョンです（アップデートはありません）。" -ForegroundColor Green
    } else {
        Write-Host "アップデート処理を実行しました。" -ForegroundColor Green
    }
}

# Ollamaが起動しているか確認し、起動していなければバックグラウンドで起動
$ollamaProcess = Get-Process -Name "ollama" -ErrorAction SilentlyContinue
if (-Not $ollamaProcess) {
    Write-Host "Ollamaサーバーを起動しています..." -ForegroundColor Yellow
    $env:OLLAMA_ORIGINS = "*"
    Start-Process -FilePath $ollamaPath -ArgumentList "serve" -WindowStyle Hidden
    Start-Sleep -Seconds 3
    Write-Host "Ollamaサーバーを起動しました。" -ForegroundColor Green
} else {
    Write-Host "Ollamaサーバーは既に実行中です。" -ForegroundColor Green
}

# npx serveでローカルサーバーを起動
Write-Host "Webサーバーを起動します..." -ForegroundColor Yellow
Write-Host "ブラウザで表示されるURL (例: http://localhost:3000) にアクセスしてください。" -ForegroundColor Cyan

npx serve .
