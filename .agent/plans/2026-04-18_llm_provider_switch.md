# [Gemini/Ollamaプロバイダー切り替え機能の実装]

LLMプロバイダー（Google AI Studio経由のGemini、またはローカルのOllama）を画面上から簡単に切り替えられるようにする機能を実装します。

## 概要
これまで `GeminiClient` を固定でインスタンス化していましたが、 `OllamaClient` 用のコードはすでに `js/ollama-client.js` として存在しており使用可能な状態です。
UI（設定モーダル）にプロバイダーの選択肢を追加し、選択されたプロバイダーに応じて適切なクライアントクラスを初期化するように `js/app.js` および `index.html` を改修します。

## Proposed Changes

### フロントエンドUI
#### [MODIFY] index.html
- 設定モーダル内に `<select id="llm-provider">` を追加し、`Gemini` と `Ollama` を選べるようにします。
- Ollama 用の設定項目（Base URL と モデル名）を追加します（Gemini入力と切り替えて表示するか、併記します）。
- サイドバーのステータス表示も、現在選択されているプロバイダー名（Ollama/Gemini）が出るように見直します。

### ロジック
#### [MODIFY] js/app.js
- LocalStorage から `llm_provider`, `ollama_base_url`, `ollama_model` を読み込む処理を追加します。
- `llm_provider` の値に応じて、`llmClient = new GeminiClient(...)` または `llmClient = new OllamaClient(...)` をインスタンス化します。
- 設定保存ボタンが押された際に、選択されたプロバイダーでAgentLoopを再構築するロジックを更新します。
- 接続確認（`checkConnection()`）の表示名を選択中のプロバイダーに合わせるよう修正します（「Gemini: Checking...」のハードコード部分を修正）。
