# Claude Codeモード バグ修正タスク

- [x] `scripts/dev-server.js` に `crypto` モジュールと `session-id` の永続化・生成処理を実装する
- [x] `dev-server.js` の `claude` 起動引数に `--session-id` を追加する
- [x] `js/app.js` の `clearMemoryBtn` のクリック処理で、Claude-Codeモードの時も記憶をクリアする処理 (`window.claudeClient.reset()`) を追加する
- [x] 変更内容をユーザーに報告し、検証を依頼する
