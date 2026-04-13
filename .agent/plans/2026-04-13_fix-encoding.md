# バッチファイルの文字コード修正計画

`start.bat` を起動した際、日本語の文字化けによりコマンド名が正しく認識されず実行エラーが発生している問題を修正します。

## ユーザーレビューが必要な事項

> [!IMPORTANT]
> この修正により、既存の `.bat` ファイルと一部の `.ps1` ファイルの内容が上書きされます。
> すでに文字化けしてしまっている現在のファイルを、正しい日本語テキストに差し替えます。

## 提案される変更

### バッチファイルの修正 (.bat)
以下のファイルを **Shift-JIS (CP932)** エンコーディングで再作成します。

#### [MODIFY] [start.bat](file:///c:/Users/rinky/OneDrive/デスクトップ/toio-lab-web/start.bat)
- 文字化け部分を正しい日本語（「toio Lab Web 起動」等）に修正。
- エンコーディングを Shift-JIS に固定。

#### [MODIFY] [start-app.bat](file:///c:/Users/rinky/OneDrive/デスクトップ/toio-lab-web/start-app.bat)
- 正しいパスとエンコーディングで再作成。

#### [MODIFY] [start-llm.bat](file:///c:/Users/rinky/OneDrive/デスクトップ/toio-lab-web/start-llm.bat)
- 内部のコメントおよびコマンドの文字化けを修正。

### PowerShellスクリプトの修正 (.ps1)
以下のファイルを **UTF-8 with BOM** エンコーディングで保存し直します（ルール7準拠）。

#### [MODIFY] [start.ps1](file:///c:/Users/rinky/OneDrive/デスクトップ/toio-lab-web/start.ps1)
#### [MODIFY] [start-app.ps1](file:///c:/Users/rinky/OneDrive/デスクトップ/toio-lab-web/start-app.ps1)
#### [MODIFY] [start-llm.ps1](file:///c:/Users/rinky/OneDrive/デスクトップ/toio-lab-web/start-llm.ps1)

### ユーティリティの修正
#### [MODIFY] [fix.ps1](file:///c:/Users/rinky/OneDrive/デスクトップ/toio-lab-web/fix.ps1)
- ファイル読み込み時にエンコーディングを明示するように修正し、再発を防止します。

## 検証計画

### 手動確認
1. コマンドプロンプトから `start.bat` を実行し、メニューが正しく表示され、エラーが出ないことを確認します。
2. 他の `.bat` ファイルも直接叩いて動作を確認します。
