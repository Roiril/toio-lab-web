try {
    Write-Host "--- toio Lab Web [アプリ起動] ---" -ForegroundColor Cyan
    Write-Host "このPCでtoioを操作し、LLMサーバー(Ollama)に接続します。" -ForegroundColor Gray

    Write-Host "`nLLMサーバー（Ollama）の接続先を指定してください。" -ForegroundColor Yellow
    Write-Host "  [1] LAN内をスキャン (自動で見つける)"
    Write-Host "  [2] IPアドレスを直接入力する"
    Write-Host "  [3] localhost (このPCで実行中) を使用する"

    $choice = Read-Host "番号を選択してください [1/2/3] (デフォルト: 3)"
    $llmIp = "localhost"

    if ($choice -eq '1') {
        Write-Host "`nLAN内をスキャン中... (ポート11434)" -ForegroundColor Cyan
        
        # 自PCのIPとサブネットベースを取得
        $myIps = (Get-NetIPAddress -AddressFamily IPv4 -Type Unicast -PrefixOrigin Dhcp,Manual | Where-Object { $_.InterfaceAlias -notmatch "(Loopback|vEthernet|WSL)" }).IPAddress
        if ($myIps.Count -gt 0) {
            $myIp = $myIps[0]
            $ipBase = $myIp -replace '\.\d+$', '.'
            
            # Pingの非同期実行
            $pingTasks = @()
            for ($i = 1; $i -le 254; $i++) {
                $targetIp = $ipBase + $i
                if ($targetIp -eq $myIp) { continue }
                $ping = [System.Net.NetworkInformation.Ping]::new()
                $task = $ping.SendPingAsync($targetIp, 200) # Timeout 200ms
                $pingTasks += [PSCustomObject]@{ IP = $targetIp; Task = $task; Ping = $ping }
            }
            
            Write-Host "    アクティブなデバイスを確認中..." -ForegroundColor Gray
            [System.Threading.Tasks.Task]::WaitAll($pingTasks.Task)
            $activeIps = $pingTasks | Where-Object { $_.Task.Result.Status -eq 'Success' } | Select-Object -ExpandProperty IP
            
            Write-Host ("    " + $activeIps.Count + " 台のデバイスと通信可能。Ollamaサーバーを探しています...") -ForegroundColor Gray
            $foundIp = $null
            
            foreach ($ip in $activeIps) {
                try {
                    $tcp = [System.Net.Sockets.TcpClient]::new()
                    $result = $tcp.BeginConnect($ip, 11434, $null, $null)
                    $success = $result.AsyncWaitHandle.WaitOne(200, $false)
                    if ($success) {
                        $tcp.EndConnect($result)
                        $tcp.Close()
                        $foundIp = $ip
                        break
                    }
                    $tcp.Close()
                } catch {}
            }
            
            if ($foundIp) {
                Write-Host "    [OK] Ollamaサーバーが見つかりました: $foundIp" -ForegroundColor Green
                $llmIp = $foundIp
            } else {
                Write-Host "    [失敗] LAN内にOllamaサーバーが見つかりませんでした。" -ForegroundColor Red
                $retry = Read-Host "IPを手動入力しますか？ [y/N]"
                if ($retry -match "^[yY]") {
                    $llmIp = Read-Host "IPアドレスを入力してください"
                } else {
                    Write-Host "デフォルトの localhost を使用します。" -ForegroundColor Yellow
                }
            }
        } else {
             Write-Host "  [失敗] ネットワークインターフェースの取得に失敗しました。自動スキャンをスキップします。" -ForegroundColor Red
             $llmIp = Read-Host "IPアドレスを手動で入力してください"
        }

    } elseif ($choice -eq '2') {
        $llmIp = Read-Host "LLMサーバーのIPアドレスを入力してください"
    } else {
        Write-Host "localhost を使用します。" -ForegroundColor Gray
    }

    if ([string]::IsNullOrWhiteSpace($llmIp)) {
        $llmIp = "localhost"
    }

    $llmUrl = "http://${llmIp}:11434"
    Write-Host "`n[1/2] $llmUrl への接続確認を行っています..." -ForegroundColor Cyan

    # 接続テスト
    $isConnected = $false
    try {
        $response = Invoke-RestMethod -Uri "$llmUrl/api/tags" -Method Get -TimeoutSec 3 -ErrorAction Stop
        $isConnected = $true
    } catch {
        $isConnected = $false
    }

    if (-Not $isConnected) {
        Write-Host "`n[警告] LLMサーバーにアクセスできませんでした。" -ForegroundColor Red
        Write-Host "以下の点を確認してください：" -ForegroundColor Yellow
        Write-Host " 1. 対象のPCで start-llm.ps1 を実行し、サーバーが起動しているか" -ForegroundColor Gray
        Write-Host " 2. IPアドレス ($llmIp) が間違っていないか" -ForegroundColor Gray
        Write-Host " 3. 対象PCのファイアウォールでポート 11434 (TCP) が許可されているか" -ForegroundColor Gray
    } else {
        Write-Host "[OK] LLMサーバーとの接続に成功しました！" -ForegroundColor Green

        # config.jsの生成
        Write-Host "`n[2/2] アプリの設定ファイルを生成しています..." -ForegroundColor Cyan
        $configPath = Join-Path $PSScriptRoot "js\config.js"
        $configContent = @"
// 起動スクリプト(start-app.ps1) によって自動設定されたファイルです。
window.APP_CONFIG = {
    OLLAMA_URL: "$llmUrl"
};
"@
        Set-Content -Path $configPath -Value $configContent -Encoding UTF8
        Write-Host "[OK] 設定完了。Webサーバー(npx serve)を起動します..." -ForegroundColor Green

        if (-not (Get-Command npx -ErrorAction SilentlyContinue)) {
            Write-Host "`n[エラー] npx コマンドが見つかりません。Node.jsがインストールされているか確認してください。" -ForegroundColor Red
        } else {
            Write-Host "`n===============================================" -ForegroundColor Green
            Write-Host "  起動完了！ブラウザで以下にアクセスしてください:" -ForegroundColor Green
            Write-Host "  http://localhost:3000" -ForegroundColor White -BackgroundColor DarkCyan
            Write-Host "===============================================" -ForegroundColor Green
            Write-Host "`nサーバーを停止するにはこのウィンドウを閉じるか Ctrl+C を押してください。" -ForegroundColor Gray

            npx serve .
        }
    }
} catch {
    Write-Host "`n[エラー] 予期せぬエラーが発生しました。" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
}

Write-Host "`n終了しました。" -ForegroundColor Gray
Read-Host "Enterキーを押すとウィンドウを閉じます"

