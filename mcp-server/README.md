# toio MCP Server

Claude Code からこのリポジトリの toio キューブを制御するための MCP (Model Context Protocol) サーバー。

## アーキテクチャ（デフォルト：ブラウザ主導）

```
┌──────────── Browser (chat UI) ────────────┐
│  chat input ──WS──► dev-server /claude    │
│                                            │
│  McpBridge ◄──WS──── mcp-server/server.mjs│
│     │                        ▲              │
│     │ Web BLE                │ stdio       │
│     ▼                        │              │
│   toio                    claude CLI       │
│                           (Haiku)          │
└────────────────────────────────────────────┘
           ▲
           │ HTTP (:3000) + WS (/claude)
           │
   scripts/dev-server.js  ──spawns──► claude -p "..."
```

ブラウザのチャット欄に打った文字列が `dev-server` 経由で `claude -p` サブプロセスに渡され、
Claude (Haiku) が `.mcp.json` で公開された toio MCP ツールを呼ぶ。MCP サーバーはブラウザへ
WebSocket でツール要求を転送し、既存の `ToolExecutor` が BLE / シミュレータを駆動する。

- ユーザーはターミナルを開かなくてよい（`npm run dev` 一発で完結）
- セッションは `claude --resume <id>` で継続される
- 現状は 1 メッセージごとに `claude -p` を起動する簡易実装。必要に応じて stream-json モードへ移行可能

## セットアップ

### 1. 依存関係

```bash
npm install                    # ルート（ws）
cd mcp-server && npm install && cd ..
```

Claude Code CLI (`claude`) が PATH に通っていること。

### 2. 起動

```bash
npm run dev
```

これだけ。ブラウザで `http://localhost:3000/` を開くと自動的に
**Claude Code (MCP Bridge)** モードで動作する。

チャット欄に「Claude Code バックエンド接続 (Haiku)」と「MCPブリッジ接続」の 2 本が出たら準備完了。
「toio を赤く光らせて」のように日本語で指示できる。

### モデルの変更

- プロジェクト固定：[.claude/settings.json](../.claude/settings.json) の `"model"`
- 一時的な上書き：`CLAUDE_MODEL=claude-sonnet-4-6 npm run dev`

### 旧モード（Ollama / Gemini）

設定画面でプロバイダを切り替えれば、従来のローカル LLM 経由でも動く。

## 環境変数

| 変数 | デフォルト | 用途 |
|---|---|---|
| `PORT` | `3000` | dev-server の HTTP/WS ポート |
| `CLAUDE_MODEL` | `claude-haiku-4-5-20251001` | 起動する claude のモデル |
| `TOIO_WS_PORT` | `7777` | mcp-server ↔ ブラウザの BLE ブリッジ WS ポート |
| `TOIO_BRIDGE_TIMEOUT_MS` | `30000` | MCP ツール呼び出しのタイムアウト |

## 注意事項

- `--dangerously-skip-permissions` を付けて claude を起動している。MCP ツール呼び出しをブロックしないための設定（dev 用途のみ）
- claude サブプロセスの起動 ~1–2 秒ぶんレイテンシが乗る。体感を詰めたい場合は streaming モード化を検討
- ブラウザが起動していない間に送ったメッセージは dev-server が処理するが、MCP ツール呼び出しは失敗する
- 複数タブで開くと MCP ブリッジは最後に開いたタブが有効になる
