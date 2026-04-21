---
name: toio Lab Web プロジェクト概要
description: ブラウザから LLM で toio コアキューブを自然言語制御するビルドレス Web アプリ
type: project
originSessionId: 2d111c42-a492-48f3-9e82-a58d0c6f5401
---
## プロジェクト概要

**toio Lab Web** は、ブラウザから Web Bluetooth で toio コアキューブを操作する Web アプリ。LLM (Ollama / Gemini) を介して自然言語で命令できる。バンドラー不使用のビルドレス構成。

## 主要ファイル (現状)

```
js/
├── app.js              UI・状態管理・イベントバインディング
├── agent-loop.js       Evaluate → Act → Observe ループ
├── environment.js      キューブ + 空間状態の統合
├── spatial-awareness.js 距離・サイズのメタデータ
├── session-memory.js   会話要約・localStorage 永続化
├── ollama-client.js    Ollama REST クライアント
├── toio-ble.js         Web Bluetooth ラッパー（物理キューブ）
├── toio-sim.js         Canvas 2D シミュレータ
├── toio-combined.js    BLE + Sim マルチキャスト
├── tools-schema.js     LLM 向け Tool 定義 (JSON Schema)
└── tool-executor.js    ToolCall → BLE/Sim 結合

scripts/
├── dev-server.js       ローカルサーバー (Port 3000+)
└── gen-config.js       env → js/config.js 生成
```

**Why:** ファイル構成は仕様策定の起点なので、メモリで素早く参照できると効率が良い。
**How to apply:** ファイルを探す前にここで該当ファイルを当てる。一致しなければ実ファイルを優先（メモリは陳腐化する）。

## アーキテクチャ要点

- **ビルドレス**: `<script>` 直接読み込み。トランスパイル無し
- **マルチキャスト**: コマンドは BLE と Sim の両方に同時送信
- **エージェントループ**: LLM 出力 → tool_call 実行 → 結果を Observe → 次ターン
- **音声**: VOICEVOX + Web Speech API フォールバック
- **MCP は廃止**: コミット `bacbabd` で MCP bridge / claude-chat-client / .mcp.json をすべて削除済み。現在の LLM 経路は Ollama / Gemini のみ

## 起動

```
.\start-llm.bat       # Ollama 起動
.\start-app.bat       # Web アプリ起動 (config.js を自動生成)
node scripts/dev-server.js   # 開発サーバー単体
```

## 環境設定

`.env.local` で `LLM_PROVIDER` (ollama | gemini) と `PORT` を切り替え。`js/config.js` は `start-app.bat` が生成するので手動編集禁止。
