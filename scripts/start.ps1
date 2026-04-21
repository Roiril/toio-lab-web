try {
    # 管理者権限チェック
    if (!([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        Write-Warning "管理者権限で実行されていないため、一部の機能（ファイアウォール設定等）が制限される場合があります。`nLAN内で利用する場合は、このスクリプトを「管理者として実行」することを推奨します。"
    }

    Write-Host "`n===============================================" -ForegroundColor Cyan
    Write-Host "  toio Lab Web 統合ランチャー  " -ForegroundColor White -BackgroundColor DarkCyan
    Write-Host "===============================================" -ForegroundColor Cyan
    Write-Host "実行するモードを選択してください。`n"

    Write-Host "  [1] LLMサーバーを起動 (start-llm)" -ForegroundColor Yellow
    Write-Host "      - このPCをOllamaサーバーとしてセットアップし、外部PCからのアクセスを許可します。"
    Write-Host "  [2] アプリを起動 (start-app)" -ForegroundColor Green
    Write-Host "      - このPCでLLMサーバーに接続し、toioを使えるようにします。`n"

    $choice = Read-Host "番号を入力してください (1 または 2)"

    if ($choice -eq '1') {
        $script = Join-Path $PSScriptRoot "start-llm.ps1"
        & "$script"
    }
    elseif ($choice -eq '2') {
        $script = Join-Path $PSScriptRoot "start-app.ps1"
        & "$script"
    } else {
        Write-Host "無効な入力です。" -ForegroundColor Red
    }
} catch {
    Write-Host "`n[スクリプト実行中にエラーが発生しました]" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host "`n詳細:" -ForegroundColor Yellow
    Write-Host $_.ScriptStackTrace -ForegroundColor Yellow
}

Write-Host "`n終了しました。" -ForegroundColor Gray
Read-Host "Enterキーを押すとウィンドウを閉じます"

