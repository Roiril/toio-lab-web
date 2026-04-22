---
trigger: model_decision
description: Ollama / Gemini 連携とツール呼び出しの実装ルール
---

# LLM 実装ルール（Ollama / Gemini）

## 共通（Ollama / Gemini）

1. **エンドポイント・モデル名は設定可能に**: URL・モデル名・API キーをハードコードしない。UI 設定または `.env.local` 経由。
2. **ツール定義の集約**: ツールスキーマは [tools-schema.js](../../js/tools-schema.js)、実行は [tool-executor.js](../../js/tool-executor.js)。新ツール追加時はこの 2 ファイルのみを更新。
3. **JSON Schema で型を明示**: ツールの `parameters` は `type` / `enum` / `required` を厳密に記述。LLM の引数違反を検出しやすくする（Gemini 2.5+ は schema の key 順序を保持する）。
4. **並列ツール呼び出しのマッピング**: LLM が同時に複数ツールを呼んだ場合、結果は **id（tool_call_id）で紐付け** — 配列順序に依存しない。Ollama / Gemini とも同じルール。
5. **エラーは構造化して返す**: ツール実行失敗時は `{ ok: false, error: "..." }` のように JSON で返し、例外文字列を直接埋めない。次ターンで LLM が自己修復しやすくなる。

## Ollama 固有

1. **CORS**: ブラウザから直接叩くため `OLLAMA_ORIGINS` 環境変数を設定。`start.ps1` / `start-llm.ps1` で自動設定。
2. **`OLLAMA_ORIGINS="*"` 禁止**: 任意オリジンからローカル Ollama にアクセス可能になる重大なリスク。明示的なオリジンリスト（`http://localhost:3000` など）を列挙する。
3. **ストリーミング方針**: エージェントループの各ステップは `stream: false`。ステップ単位の UI 更新で体感を担保する。ステップ内ストリーミングは将来課題。
4. **モデル名はユーザー発言を尊重**: デフォルトは `gemma4:e4b`（`start-llm.ps1` の `$targetModel`）。ユーザーが別名を指定したら読み替えずそのまま使う。

## Gemini 固有

1. **API キーを client に露出しない**: 現状は Lab / Prototype として `config.js` 経由で埋め込み許容、ただし公開配信する場合は Firebase AI Logic などのプロキシ経由に切り替える前提（[Google 公式ガイド](https://ai.google.dev/gemini-api/docs/function-calling) 参照）。
2. **Rate limit**: 無料枠は RPM / TPM / RPD の 3 軸で制限。429 エラー時は指数バックオフで再試行し、連続失敗時は UI に明示する。
3. **Tool response の id**: Gemini 3 以降は `functionCall.id` が常に返る。複数並列呼び出しの結果は `functionResponse.id` で対応付ける。

## エージェントループ

1. **ループ上限**: LLM→tool→LLM の無限ループを防ぐため最大ステップ数を設定し、上限到達時は中断して UI にエラー表示。
2. **Observe は要約**: ツール結果をそのまま次ターンに渡すと context が肥大する。数値・状態は構造化 JSON、長文は要約する（`session-memory.js` の方針）。

## 参考

- [Ollama FAQ](https://docs.ollama.com/faq)
- [Gemini API: Function calling](https://ai.google.dev/gemini-api/docs/function-calling)
- [Gemini API: Rate limits](https://ai.google.dev/gemini-api/docs/rate-limits)
