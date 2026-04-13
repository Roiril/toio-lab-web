# ポリシーバイパスしてスクリプト実行できるようにするためのおまじない
if (!([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Warning "管理者権限で実行されていないため、一部の機能が制限される場合があります。インストールやファイアウォール設定に失敗する場合は管理者として実行してください。"
}

try {
    Write-Host "--- toio Lab Web [LLMサーバー起動] ---" -ForegroundColor Cyan
    Write-Host "このPCをLLM（推奨モデル）用サーバーとして立ち上げます。" -ForegroundColor Gray

    # 設定
    $ollamaPath = "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe"
    $targetModel = "gemma4:e4b" # ユーザー指定: gemma4 の 4b (Effective 4B)

    # [1/4] Ollama本体のインストールとアップデート確認
    Write-Host "`n[1/4] Ollama本体の状態を確認中..." -ForegroundColor Cyan
    if (-Not (Test-Path $ollamaPath)) {
        Write-Host "Ollamaが見つかりません。wingetを使用してインストールを開始します..." -ForegroundColor Yellow
        winget install Ollama.Ollama --accept-source-agreements --accept-package-agreements
        if ($LASTEXITCODE -ne 0) { throw "Ollamaのインストールに失敗しました。(ExitCode: $LASTEXITCODE)" }
        Write-Host "[OK] Ollamaのインストール完了。" -ForegroundColor Green
    } else {
        Write-Host "Ollamaのアップデートがあるか確認しています (winget)..." -ForegroundColor Gray
        & winget upgrade Ollama.Ollama --accept-source-agreements --accept-package-agreements
        Write-Host "[OK] Ollama本体の確認完了。" -ForegroundColor Green
    }

    # [2/4] ファイアウォール設定と環境変数の設定
    Write-Host "`n[2/4] LANアクセスを許可するための環境構築..." -ForegroundColor Cyan
    $env:OLLAMA_HOST = "0.0.0.0"
    $env:OLLAMA_ORIGINS = "*"

    # ファイアウォールのルール追加（管理者権限が必要）
    $fwRuleName = "Ollama-11434"
    if (Get-Command "New-NetFirewallRule" -ErrorAction SilentlyContinue) {
        $fwRule = Get-NetFirewallRule -DisplayName $fwRuleName -ErrorAction SilentlyContinue
        if (-Not $fwRule) {
            Write-Host "ファイアウォールにOllama用のルール(ポート11434)を追加します..." -ForegroundColor Yellow
            try {
                New-NetFirewallRule -DisplayName $fwRuleName -Direction Inbound -LocalPort 11434 -Protocol TCP -Action Allow -ErrorAction Stop | Out-Null
                Write-Host "[OK] ファイアウォールの設定が完了しました。" -ForegroundColor Green
            } catch {
                Write-Warning "ファイアウォールルールの追加に失敗しました。管理者権限がない可能性があります。"
                Write-Warning "LAN内の他PCから接続できない場合は、手動でポート11434(TCP)を開けてください。"
            }
        } else {
            Write-Host "[OK] ファイアウォールのルールは既に存在しています。" -ForegroundColor Green
        }
    }

    # [3/4] Ollamaサーバーの起動確認
    Write-Host "`n[3/4] Ollamaサーバーの起動..." -ForegroundColor Cyan
    $ollamaProcess = Get-Process -Name "ollama" -ErrorAction SilentlyContinue
    if ($ollamaProcess) {
        Write-Host "既に実行中の Ollama サーバーを停止しています (環境変数を反映させるため)..." -ForegroundColor Yellow
        Stop-Process -Name "ollama" -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 2
    }

    Write-Host "Ollamaサーバーを外部アクセス可能な状態で起動しています..." -ForegroundColor Yellow
    Start-Process -FilePath $ollamaPath -ArgumentList "serve" -WindowStyle Hidden
    for ($i=3; $i -gt 0; $i--) {
         Write-Host ("   起動待機中... " + $i + " 秒") -ForegroundColor Gray
         Start-Sleep -Seconds 1
    }
    Write-Host "[OK] Ollamaサーバーが起動しました。" -ForegroundColor Green

    # [4/4] AIモデルの確認とダウンロード
    Write-Host "`n[4/4] AIモデル ($targetModel) の確認..." -ForegroundColor Cyan
    $models = & $ollamaPath list | Out-String
    if ($models -notmatch $targetModel) {
        Write-Host "モデル '$targetModel' が見つかりません。ダウンロードを開始します（時間がかかる場合があります）..." -ForegroundColor Yellow
        & $ollamaPath pull $targetModel
        if ($LASTEXITCODE -ne 0) { throw "モデルのダウンロードに失敗しました。" }
        Write-Host "[OK] モデルの準備が完了しました。" -ForegroundColor Green
    } else {
        Write-Host "[OK] モデル '$targetModel' は準備済みです。" -ForegroundColor Green
    }

    # IPアドレスの取得と表示
    $ipAddresses = (Get-NetIPAddress -AddressFamily IPv4 -Type Unicast -PrefixOrigin Dhcp,Manual | Where-Object { $_.InterfaceAlias -notmatch "(Loopback|vEthernet|WSL)" }).IPAddress
    $mainIp = if ($ipAddresses.Count -gt 0) { $ipAddresses[0] } else { "IP取得失敗" }

    Write-Host "`n===============================================" -ForegroundColor Green
    Write-Host "  LLMサーバーの起動完了！" -ForegroundColor Green
    Write-Host "===============================================" -ForegroundColor Green
    Write-Host "`nアプリ側PCで start-app を実行し、以下のIPアドレスを入力してください：" -ForegroundColor White
    Write-Host "  $mainIp  " -ForegroundColor Magenta -BackgroundColor Black -NoNewline 
    Write-Host "`n"
    Write-Host "===============================================" -ForegroundColor Green
    Write-Host "`nサーバーを停止するにはこのウィンドウを閉じるか Ctrl+C を押してください。" -ForegroundColor Gray

} catch {
    Write-Host "`n[エラー] 予期せぬエラーが発生しました。" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
}

Write-Host "`n終了しました。" -ForegroundColor Gray
Read-Host "Enterキーを押すとウィンドウを閉じます"
