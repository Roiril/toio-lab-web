# start.bat の文字エンコーディング修復計画

`start.bat` の実行時にコマンドが正しく認識されず、また日本語が文字化けしている問題を修正します。

## 問題の現状
- `start.bat` を実行すると、`'toio'` や `'-ExecutionPolicy'` がコマンドとして認識されないエラーが発生する。
- エラーメッセージ内に `ｭ生しました。` などの文字化けが見られる。
- これは、バッチファイル（`.bat`）が UTF-8 (BOMなし) 等で保存されており、Windows の標準的なコマンドプロンプト（Shift-JIS/CP932）で正しく解析できていないことが原因です。

## 修正方針
1. `start.bat` の内容を整理し、Shift-JIS または UTF-8 (BOM付き) で再保存します。
   - Windows のバッチファイルで日本語を扱う場合、Shift-JIS が最も確実です。
2. 関連する PowerShell スクリプト（`.ps1`）が「UTF-8 (BOM付き)」であることを確認・修正します（グローバルルール第7項に従う）。
3. `start.bat` から `start.ps1` を呼び出す際、必要に応じて管理者権限への昇格を検討します（現在は `start-llm.bat` のみが昇格している）。

## 変更内容

### 1. `start.bat` の修正
内容を以下の通りとし、適切なエンコーディングで保存します。

```batch
@echo off
setlocal
cd /d "%~dp0"

echo ===============================================
echo   toio Lab Web 起動
echo ===============================================
echo.

PowerShell -NoProfile -ExecutionPolicy Bypass -File "start.ps1"

if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERROR] スクリプトの実行中にエラーが発生しました。
    echo 以下の点を確認してください：
    echo 1. Node.js がインストールされているか (npxコマンドが使えるか)
    echo 2. このフォルダのパスに特殊な記号が含まれていないか
    echo.
    pause
)
endlocal
```

### 2. エンコーディングの統一
- `start.bat`: Shift-JIS (CP932)
- `start.ps1`, `start-app.ps1`, `start-llm.ps1`: UTF-8 (BOM付き)

## 検証計画
1. `start.bat` を実行し、メニュー画面が正しく表示されることを確認する。
2. 日本語が文字化けせず表示されることを確認する。
3. エラーが発生せずに PowerShell スクリプトが起動することを確認する。
