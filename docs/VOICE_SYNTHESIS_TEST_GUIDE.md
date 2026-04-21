# 音声合成機能テストガイド

ブラウザで実際にテストして、バグがないかを確認するための完全なガイドです。

---

## 前提条件

- ✅ `npm run dev` で dev-server が起動している（localhost:3000）
- ✅ ブラウザ（Chrome/Edge）を開いている
- ✅ DevTools（F12）が開いている
- ✅ Console タブを開いている

---

## 🧪 テスト1：基本的な接続確認

### 目的
Claude Chat と MCP Bridge の接続状態を確認

### 手順

1. ブラウザの DevTools Console で以下を実行：
```javascript
// Test 1-1: Claude Chat 接続確認
console.log('Claude Chat ready:', window.claudeChat?.isReady());

// Test 1-2: MCP Bridge 接続確認
console.log('MCP Bridge connected:', window.mcpBridge?.isConnected());

// Test 1-3: Bridge instance 確認
console.log('Bridge instance:', window.mcpBridge);
```

### 期待される結果

```
Claude Chat ready: true
MCP Bridge connected: false  ← まだ接続していない（正常）
Bridge instance: McpBridge { ... }
```

**正常状態**:
- `claudeChat.isReady() === true` → WebSocket が接続済み
- `mcpBridge.isConnected() === false` → 初回接続前は接続してない（チャット初回送信で接続する）

---

## 🧪 テスト2：VOICEVOX 利用可能性確認

### 目的
VOICEVOX が動作しているか確認（なければ Web Speech API にフォールバック）

### 手順

1. 別の Terminal で VOICEVOX が起動しているか確認：
```bash
netstat -ano | findstr 50021  # Windows
# または
lsof -i :50021               # macOS/Linux
```

2. DevTools Console で実行：
```javascript
// VOICEVOX ポート確認
const port = Number(localStorage.getItem('voicevoxPort') || 50021);
console.log('VOICEVOX port:', port);

// VOICEVOX availability test
fetch(`http://localhost:${port}/version`)
    .then(r => r.json())
    .then(v => console.log('✅ VOICEVOX available:', v))
    .catch(e => console.warn('⚠️ VOICEVOX unavailable:', e.message));
```

### 期待される結果

**VOICEVOX が起動している場合**:
```
VOICEVOX port: 50021
✅ VOICEVOX available: {version: "0.XX.X", ...}
```

**VOICEVOX が起動していない場合**:
```
VOICEVOX port: 50021
⚠️ VOICEVOX unavailable: Failed to fetch
(Web Speech API にフォールバック — 正常)
```

---

## 🧪 テスト3：ナレーション判定ロジック（単体テスト）

### 目的
Claude 応答に基づいて、正しく「読み上げる/スキップ」が判定されているか確認

### 手順

DevTools Console で以下を実行：

```javascript
function testNarrationLogic(text, narrationPlan, expectedResult) {
    const isSingleLineCompletion = 
        text.trim().split('\n').length === 1 &&
        /^(.*?(完了|終了|完了しました|してきました|到達しました).*)$/.test(text);
    
    let decision = 'SPEAK';
    if (narrationPlan && narrationPlan.should_narrate === false) {
        decision = 'SKIP';
    } else if (isSingleLineCompletion) {
        decision = 'SKIP';
    }
    
    const result = decision === expectedResult ? '✅' : '❌';
    console.log(`${result} Text: "${text.substring(0, 40)}..." → ${decision} (expected: ${expectedResult})`);
    console.log(`   narrationPlan: ${JSON.stringify(narrationPlan)}`);
}

// テストケース
console.log('=== Narration Logic Tests ===\n');

// Case 1: 直接応答 → 話す
testNarrationLogic(
    'こんにちは！何かお手伝いできることはありますか？',
    { should_narrate: true, text: 'こんにちは！何かお手伝いできることはありますか？' },
    'SPEAK'
);

// Case 2: 明示的 NO_NARRATE → スキップ
testNarrationLogic(
    '移動完了しました',
    { should_narrate: false, text: '移動完了しました' },
    'SKIP'
);

// Case 3: 単純な完了メッセージ → スキップ（ヒューリスティック）
testNarrationLogic(
    '移動完了しました',
    null,
    'SKIP'
);

// Case 4: 複数行で「完了」 → 話す（ヒューリスティック非該当）
testNarrationLogic(
    '移動完了しました。\n次は何しましょう？',
    null,
    'SPEAK'
);

// Case 5: 複数行でキーワード未含 → 話す
testNarrationLogic(
    'こんにちは！\n今日はいい天気ですね',
    null,
    'SPEAK'
);
```

### 期待される結果

```
=== Narration Logic Tests ===

✅ Text: "こんにちは！何かお手伝いできることはありますか？..." → SPEAK (expected: SPEAK)
   narrationPlan: {"should_narrate":true,"text":"こんにちは！..."}
✅ Text: "移動完了しました" → SKIP (expected: SKIP)
   narrationPlan: {"should_narrate":false,"text":"移動完了しました"}
✅ Text: "移動完了しました" → SKIP (expected: SKIP)
   narrationPlan: null
✅ Text: "移動完了しました。\n次は何しましょう？" → SPEAK (expected: SPEAK)
   narrationPlan: null
✅ Text: "こんにちは！\n今日はいい天気ですね" → SPEAK (expected: SPEAK)
   narrationPlan: null
```

**すべて ✅ なら正常**

---

## 🧪 テスト4：実際のチャットテスト（エンドツーエンド）

### 目的
実際にチャットで「こんにちは！」と入力して、全フローが正しく動作するか確認

### 前準備

DevTools Console で以下を実行し、メッセージをトレース：

```javascript
// イベントの詳細ログ出力
const originalOnMessage = window.claudeChat.onMessage;
window.claudeChat.onMessage = function(msg) {
    console.log(`[ClaudeChat Message] type=${msg.type}`);
    
    if (msg.type === 'assistant') {
        console.log(`  text: "${msg.text?.substring(0, 100)}..."`);
        console.log(`  narrationPlan:`, msg.narrationPlan);
    }
    
    if (msg.type === 'result') {
        console.log(`  → result received, narration logic will execute`);
    }
    
    originalOnMessage.call(this, msg);
};
```

### テスト実行

1. チャット入力欄をクリック
2. 「こんにちは！」と入力
3. Send ボタンをクリック
4. Console を監視

### 期待される動作フロー

```
Step 1: ユーザが「こんにちは！」を入力して Send クリック
  → app.js:496: addMessage('user', 'こんにちは！')
  → チャット画面に「ユーザ: こんにちは！」が表示される ✓

Step 2: WebSocket で dev-server へ送信
  → claude-chat-client.js:97 で JSON 送信
  → Console: [ClaudeChat Message] type=working

Step 3: Claude プロセスが応答を生成
  → dev-server が受信・処理
  → Console: [ClaudeChat Message] type=assistant
    text: "こんにちは！私はズンダモン..."
    narrationPlan: {should_narrate: true, text: "..."}

Step 4: ブラウザが応答を表示
  → app.js:176: addMessage('ai', displayText)
  → チャット画面に「AI: こんにちは！私はズンダモン...」が表示される ✓

Step 5: 応答完了メッセージ受信
  → Console: [ClaudeChat Message] type=result
  → → result received, narration logic will execute
  → Console: [ClaudeChat] Speak response
  
Step 6: 音声合成実行
  → bridge.call('speak_text', ...)
  → VOICEVOX（または Web Speech API）で合成
  → 🔊 スピーカーから音が出る

Step 7: UI 復帰
  → Send ボタン有効化 ✓
```

### DevTools でのログ確認

以下のログが見えたら正常：

```javascript
[ClaudeChat Message] type=working
[ClaudeChat Message] type=assistant
  text: "こんにちは！私はズンダモン..."
  narrationPlan: {should_narrate: true, text: "..."}
[ClaudeChat Message] type=result
  → result received, narration logic will execute
[ClaudeChat] Speak response
```

🔊 **スピーカーから聞こえたら成功！**

---

## 🧪 テスト5：音声フォールバック（VOICEVOX 無し）

### 目的
VOICEVOX が使えない場合に Web Speech API に正しくフォールバックされるか確認

### シナリオ

VOICEVOX を停止した状態で、チャットに「赤く光って！」と入力

### 期待される動作

1. Console に以下が出力：
```javascript
[speakText] VOICEVOX unavailable, falling back to Web Speech API: Failed to fetch
```

2. VOICEVOX のエラーにもかかわらず、Web Speech API で音声が出力される
   - ✅ スピーカーから「赤く光らせました」などが聞こえる

---

## 🧪 テスト6：スキップケース

### 目的
ナレーション計画で「スキップ」が正しく動作するか確認

### テストケース 1: NO_NARRATE マーカー

ユーザ入力:
```
キューブの位置を教えて
```

期待される Claude 応答:
```
現在の位置は X=100, Y=150, 角度=45度です[NO_NARRATE]
```

期待される動作:
- ✅ チャット画面には表示される
- ✗ スピーカーから音は出ない

Console ログ:
```javascript
[ClaudeChat] Narration plan: skip
```

### テストケース 2: 単純な完了メッセージ

ユーザ入力:
```
移動して
```

期待される Claude 応答:
```
移動完了しました
```

期待される動作:
- ✅ チャット画面には表示される
- ✗ スピーカーから音は出ない（ヒューリスティック判定）

Console ログ:
```javascript
[ClaudeChat] Heuristic: skip simple completion
```

---

## 📋 チェックリスト

実行したテストにチェックを入れてください：

### 接続テスト
- [ ] Test 1: Claude Chat が ready=true
- [ ] Test 1: MCP Bridge instance が存在
- [ ] Test 2: VOICEVOX または Web Speech API が利用可能

### ロジックテスト
- [ ] Test 3: ナレーション判定ロジックが全てのケースで正しい

### エンドツーエンドテスト
- [ ] Test 4: 「こんにちは！」で音声が出力される
- [ ] Test 4: Console に Speak response ログが表示される
- [ ] Test 5: VOICEVOX 無しで Web Speech API にフォールバック
- [ ] Test 6: NO_NARRATE マーカーで音声が出ない
- [ ] Test 6: 単純な完了メッセージで音声が出ない

---

## 🐛 バグチェックリスト

以下の問題がないか確認：

### 【問題1】音声が全く出ない

**確認項目**:
1. VOICEVOX が起動しているか？（ない場合は Web Speech API で対応すべき）
2. VOICEVOX ポート 50021 に接続できるか？
   ```javascript
   fetch('http://localhost:50021/version').then(r => r.json()).then(console.log);
   ```
3. MCP Bridge が接続しているか？
   ```javascript
   window.mcpBridge.isConnected()
   ```
4. Browser のスピーカーが有効か？
5. Web Speech API voices が利用可能か？
   ```javascript
   window.speechSynthesis.getVoices().filter(v => v.lang.includes('ja'))
   ```

### 【問題2】スキップするべき応答が音声化される

**確認項目**:
1. Dev-Server がマーカーを正しく抽出しているか？
   - `dev-server.js:290-314` の `extractNarrationPlan()` を確認
   - `[NO_NARRATE]` マーカーが検出されているか？
   
2. ナレーション判定ロジックが正しいか？
   - `app.js:185-186` の `isSingleLineCompletion` が正確に評価されているか？
   - Console で Test 3 を再実行

### 【問題3】Chat で入力しても応答がない

**確認項目**:
1. Dev-Server ログを確認：
   ```bash
   tail -f /tmp/dev-server.log
   ```
   
2. Claude CLI が起動しているか？
   ```bash
   ps aux | grep claude
   ```

3. MCP Server が起動しているか？
   ```bash
   lsof -i :7777  # デフォルト MCP ポート
   ```

### 【問題4】"VOICEVOX unavailable" が頻出

**確認項目**:
1. VOICEVOX が実際に起動しているか？
   ```bash
   netstat -ano | findstr 50021
   ```

2. VOICEVOX ポートが正しいか？
   ```javascript
   console.log('Port:', Number(localStorage.getItem('voicevoxPort') || 50021));
   ```

3. VOICEVOX API が応答しているか？
   ```javascript
   fetch('http://localhost:50021/audio_query?text=test&speaker=3', {method: 'POST'})
       .then(r => r.json())
       .then(console.log)
       .catch(console.error);
   ```

---

## 📊 テスト結果レポート

テスト完了後、以下をまとめてください：

### 実行環境
- Node.js version: `node --version`
- ブラウザ: （Chrome/Edge/その他）
- VOICEVOX: （起動/未起動）

### テスト結果

| テスト | 結果 | 備考 |
|--------|------|------|
| Test 1: 接続確認 | ✅/⚠️/❌ | |
| Test 2: VOICEVOX | ✅/⚠️/❌ | |
| Test 3: ロジック | ✅/⚠️/❌ | |
| Test 4: エンドツーエンド | ✅/⚠️/❌ | |
| Test 5: フォールバック | ✅/⚠️/❌ | |
| Test 6: スキップケース | ✅/⚠️/❌ | |

### 発見されたバグ

（バグがあった場合のみ記入）

1. **バグ名**
   - 再現手順: ...
   - 期待される動作: ...
   - 実際の動作: ...
   - ログ: ...

---

## 🔧 トラブルシューティング

### よくあるエラーと対処法

#### "Claude Code バックエンドに接続できていません"
```
原因: dev-server が起動していない
対処: npm run dev を実行
```

#### "[speak_text] Failed: ..."
```
原因: tool 呼び出しが失敗している
対処: dev-server と mcp-server のログを確認
```

#### "ReferenceError: window.claudeChat is undefined"
```
原因: claude-code provider ではない（Ollama/Gemini 使用中）
対処: Settings で Provider を "Claude Code" に変更
```

---

## 📞 詳細なログ確認方法

### Dev-Server ログ
```bash
tail -f /tmp/dev-server.log
```

### DevTools Console
```javascript
// すべてのメッセージをトレース
window.claudeChat.onMessage = function(msg) {
    console.log('[Full Trace]', JSON.stringify(msg, null, 2));
};
```

### Network Tab (DevTools)
1. DevTools > Network タブ
2. "WS" フィルター（WebSocket）
3. `/claude` エンドポイントをクリック
4. Messages タブで送受信メッセージを確認

