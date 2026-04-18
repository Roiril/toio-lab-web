# ポリシーバイパスしてスクリプト実行できるようにするためのおまじない
if (!([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Warning "管理者権限で実行されていないため、一部の機能が制限される場合があります。インストールやファイアウォール設定に失敗する場合は管理者として実行してください。"
}

try {
    Write-Host "--- toio Lab Web [LLMサーバー起動] ---" -ForegroundColor Cyan
    Write-Host "このPCをLLM（推奨モデル）用サーバーとして立ち上げます。" -ForegroundColor Gray

    # 設定
    $ollamaPath = "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe"

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

    # [4/4] AIモデルの選択と確認
    Write-Host "`n[4/4] AIモデルの確認と選択..." -ForegroundColor Cyan

    $model_e4b = "gemma4:e4b"
    $model_26b = "gemma4:26b"

    $installedList = & $ollamaPath list | Out-String
    $hasE4B = $installedList -match [regex]::Escape($model_e4b)
    $has26B = $installedList -match [regex]::Escape($model_26b)

    function Invoke-ModelDownload($modelName) {
        Write-Host "`n'$modelName' をダウンロード中（時間がかかる場合があります）..." -ForegroundColor Yellow
        & $ollamaPath pull $modelName
        if ($LASTEXITCODE -ne 0) { throw "'$modelName' のダウンロードに失敗しました。" }
        Write-Host "[OK] '$modelName' の準備が完了しました。" -ForegroundColor Green
    }

    function Get-ModelChoice($availableModels) {
        Write-Host "`nどちらのモデルを使用しますか？" -ForegroundColor Cyan
        for ($i = 0; $i -lt $availableModels.Count; $i++) {
            $label = if ($availableModels[$i] -eq $model_26b) { "$($availableModels[$i])  (26B MoE, Active 4B)" } else { $availableModels[$i] }
            Write-Host "  $($i+1): $label" -ForegroundColor White
        }
        do {
            $choice = Read-Host "番号を入力してください (1-$($availableModels.Count))"
            $idx = [int]$choice - 1
        } while ($idx -lt 0 -or $idx -ge $availableModels.Count)
        return $availableModels[$idx]
    }

    if ($hasE4B -and $has26B) {
        # 両方インストール済み
        Write-Host "[OK] 両モデルがインストール済みです。" -ForegroundColor Green
        Write-Host "  - $model_e4b" -ForegroundColor White
        Write-Host "  - $model_26b  (26B MoE, Active 4B)" -ForegroundColor White
        $targetModel = Get-ModelChoice @($model_e4b, $model_26b)

    } elseif ($hasE4B -and -not $has26B) {
        # e4b のみある
        Write-Host "[OK] $model_e4b はインストール済みです。" -ForegroundColor Green
        Write-Host "     $model_26b はインストールされていません。" -ForegroundColor Yellow
        $dl = Read-Host "`n$model_26b (26B MoE, Active 4B) をダウンロードしますか？ [Y/N]"
        if ($dl -match '^[Yy]') {
            Invoke-ModelDownload $model_26b
            $targetModel = Get-ModelChoice @($model_e4b, $model_26b)
        } else {
            $targetModel = $model_e4b
            Write-Host "→ $targetModel を使用します。" -ForegroundColor Cyan
        }

    } elseif (-not $hasE4B -and $has26B) {
        # 26b のみある
        Write-Host "[OK] $model_26b (26B MoE, Active 4B) はインストール済みです。" -ForegroundColor Green
        Write-Host "     $model_e4b はインストールされていません。" -ForegroundColor Yellow
        $dl = Read-Host "`n$model_e4b をダウンロードしますか？ [Y/N]"
        if ($dl -match '^[Yy]') {
            Invoke-ModelDownload $model_e4b
            $targetModel = Get-ModelChoice @($model_e4b, $model_26b)
        } else {
            $targetModel = $model_26b
            Write-Host "→ $targetModel を使用します。" -ForegroundColor Cyan
        }

    } else {
        # 両方ない
        Write-Host "どちらのモデルもインストールされていません。" -ForegroundColor Yellow
        Write-Host "  1: $model_e4b のみダウンロード" -ForegroundColor White
        Write-Host "  2: $model_26b (26B MoE, Active 4B) のみダウンロード" -ForegroundColor White
        Write-Host "  3: 両方ダウンロード" -ForegroundColor White
        do {
            $dlChoice = Read-Host "番号を入力してください (1-3)"
        } while ($dlChoice -notmatch '^[123]$')

        switch ($dlChoice) {
            '1' {
                Invoke-ModelDownload $model_e4b
                $targetModel = $model_e4b
                Write-Host "→ $targetModel を使用します。" -ForegroundColor Cyan
            }
            '2' {
                Invoke-ModelDownload $model_26b
                $targetModel = $model_26b
                Write-Host "→ $targetModel を使用します。" -ForegroundColor Cyan
            }
            '3' {
                Invoke-ModelDownload $model_e4b
                Invoke-ModelDownload $model_26b
                $targetModel = Get-ModelChoice @($model_e4b, $model_26b)
            }
        }
    }

    Write-Host "`n使用モデル: $targetModel" -ForegroundColor Cyan

    # IPアドレスの取得と表示
    $ipAddresses = @((Get-NetIPAddress -AddressFamily IPv4 -Type Unicast -PrefixOrigin Dhcp,Manual | Where-Object { $_.InterfaceAlias -notmatch "(Loopback|vEthernet|WSL)" }).IPAddress)
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
