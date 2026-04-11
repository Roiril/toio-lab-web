# start.ps1 構文エラーの修正計画

文字エンコーディングの不一致（文字化け）により、PowerShellが日本語を正しく読み込めず構文エラーが発生している問題を修正します。

## ユーザーレビューが必要な事項
- 特になし。

## 変更内容

### [MODIFY] [start.ps1](file:///c:/Users/kouga/Projects/Web/toio-lab-web/start.ps1)
- 内容自体は正しいため、再書き込みを行い、さらにWindowsのPowerShellが認識しやすい形式（UTF-8 with BOM）に変換することを試みます。

## 検証計画
- 修正後、`start.bat` を再度実行してエラーが解消されたか確認。
