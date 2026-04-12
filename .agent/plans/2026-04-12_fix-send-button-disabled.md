# [FIX] LLMメッセージ送信ボタンの無効化バグ修正

`js/app.js` において、送信状態を管理する変数 `isProcessingChat` が宣言されずに使用されているため、`ReferenceError` が発生し、ボタンの有効化処理が動作しなくなっています。

## Proposed Changes

### [js/app.js](file:///c:/Users/kouga/Projects/Web/toio-lab-web/js/app.js)

#### [MODIFY] [app.js](file:///c:/Users/kouga/Projects/Web/toio-lab-web/js/app.js)
- `isProcessingChat` 変数を UI 状態の初期化セクションに宣言します。

## Verification Plan

### Automated Tests
- ブラウザ操作ツールを使用して以下の動作を確認します。
    - チャット入力欄にテキストを入力した際、送信ボタンが有効になること。
    - 送信ボタンが押せること。
    - 送信中に送信ボタンが非表示になり、キャンセルボタンが表示されること。
