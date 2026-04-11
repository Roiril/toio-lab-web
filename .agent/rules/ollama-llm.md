---
trigger: model_decision
description: OllamaやLLM連携に関する実装ルール
---

# Ollama / LLM 実装ルール

1. **エンドポイント設定**: Ollama API の URL はハードコードせず、UI設定から変更可能にすること。デフォルトは `http://localhost:11434`。
2. **CORS対応**: ブラウザから直接 Ollama API を呼ぶため、`OLLAMA_ORIGINS` 環境変数の設定が必要。`start.ps1` で自動設定済みだが、README にも手動手順を記載すること。
3. **ストリーミング**: エージェントループ内の各ステップは `stream: false` で処理し、ステップごとのUI更新で体感を改善する。将来的にステップ内ストリーミングを検討する。
4. **Tool Calling**: ツール定義は `tools-schema.js` に集約し、`tool-executor.js` で実行する。新しいツールを追加する場合はこの2ファイルを更新すること。
