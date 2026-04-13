# 構文エラーの修正とモデル設定の更新

現在のプロジェクトで発生している PowerShell スクリプトの構文エラーを修正し、ユーザーから指定された LLM モデル（gemma2:2b 想定）への設定更新、および文字エンコーディングの最適化を行います。

## ユーザーレビューが必要な項目

> [!IMPORTANT]
> **モデル名の修正**: 「gemma4 の 4b」という指定に基づき、モデル名を **`gemma4:e4b`** として設定します。数字の取り違えがないよう、この具体的なモデル名を使用します。

## 修正内容

### スクリプトの修正

#### [MODIFY] [start-llm.ps1](file:///c:/Users/rinky/OneDrive/デスクトップ/toio-lab-web/start-llm.ps1)
- 構文エラー（`OK]` の誤認など）の原因となっている箇所をクリーンなコードで書き直します。
- `$targetModel` を `gemma4:e4b` に変更します。
- ファイルを **UTF-8 with BOM** 形式で保存します。

#### [MODIFY] [start-app.ps1](file:///c:/Users/rinky/OneDrive/デスクトップ/toio-lab-web/start-app.ps1)
- 未使用の変数 `$response` に関する警告を修正します（必要に応じて結果のチェックに使用するか、削除します）。
- ファイルを **UTF-8 with BOM** 形式で保存します。

#### [NEW] [convert_encodings.ps1](file:///c:/Users/rinky/OneDrive/デスクトップ/toio-lab-web/convert_encodings.ps1)
- `fix.ps1` をベースに、異常な文字を除去した状態で作成（または `fix.ps1` を `convert_encodings.ps1` に改名・修正）します。
- すべての .ps1 を UTF-8 with BOM、.bat を Shift-JIS に一括変換する機能を確保します。

## 検証プラン

### 自動テスト
- PowerShell の構文チェックコマンドを実行し、エラーが出ないことを確認します。
  - `powershell -Command "if (Get-Content start-llm.ps1 | Out-String | powershell -Command { $input | Out-Null }) { Write-Host 'Syntax OK' }"`

### 手動検証
- スクリプトを実行し、文字化けせずにメニューやログが表示されることを確認します。
