---
status: done
---
# Claude Code (MCP Bridge) 関連機能の削除

## 目的
Claude Codeとtoioを連携させるための「MCP Bridge」機能およびそのUI、サーバーサイドのWebSocket実装、クライアントサイドのチャットクライアントなど、関連するコード・ファイルをすべて削除し、プロジェクトを整理します。

## 変更内容

### 1. 削除するファイル・ディレクトリ
以下のファイルおよびディレクトリを丸ごと削除します。
- `[DELETE]` `js/mcp-bridge.js`
- `[DELETE]` `js/claude-chat-client.js`
- `[DELETE]` `mcp-server/` ディレクトリ全体

### 2. 修正するファイル
- `[MODIFY]` `index.html`
  - LLM Providerのセレクトボックスから「Claude Code (MCP Bridge)」オプションを削除。
  - `#claude-code-settings-group` の設定UIブロックを削除。
  - 上記の削除したjsファイルへの `<script>` タグを削除。

- `[MODIFY]` `js/app.js`
  - `llm_provider` の初期値とフォールバックの対象から `claude-code` を除外。
  - `McpBridge` および `ClaudeChatClient` のインスタンス化などを削除。
  - MCP用のポート設定保存処理（`localStorage` 周り）を削除。

- `[MODIFY]` `scripts/dev-server.js`
  - `WebSocketServer` による `/claude` エンドポイントの実装を削除。
  - `claudeProc` のバックグラウンド実行ロジックを削除。
  - 純正なローカルHTTPファイルサーバーとしての機能のみを残す。
