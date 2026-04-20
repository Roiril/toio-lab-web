---
description: Claude Codeモード (claudecodehaku) のバグ修正計画
status: done
---

# Claude Codeモード バグ修正計画

## 発見されたバグ
1. **セッション記憶の喪失**: `dev-server.js` にて、ユーザーの発話ごとに `claude -p` サブプロセスがワンショットで立ち上がる仕様になっていますが、`--session-id` や `--resume` 引数が渡されておらず、**毎ターン記憶がリセットされ、文脈を忘れてしまう**バグがありました。
2. **記憶リセットボタンの未連動**: `app.js` の「セッション記憶をクリア」ボタンを押した際、ローカルの `SessionMemory` はクリアされますが、Claude Code クライアント (`claudeClient.reset()`) が呼び出されていないため、バックエンドのアシスタントの記憶が消えません。

## 修正内容
1. `scripts/dev-server.js`
   - `node:crypto` モジュールを読み込み、内部で `currentSessionId` (UUID) を保持するようにします。
   - `claude` を spawn する際、常に引数に `--session-id <currentSessionId>` を付加します。これにより同じセッションへのチャット追加を実現し、会話履歴を保持します。
   - `restartClaudeStream()` が呼ばれた際は、新しい UUID を生成してセッションをリセットします。

2. `js/app.js`
   - `clearMemoryBtn` のクリックイベントリスナー内で、`llmProviderSelect.value === 'claude-code'` の場合は `window.claudeClient.reset()` を実行するようにします。

## 期待される結果
- Claude Code モード (Claude-Haiku) が過去の発話を正確に記憶するようになります。
- 「セッションをクリアする」ボタンが正しく連動し、記憶の白紙化が行えるようになります。
