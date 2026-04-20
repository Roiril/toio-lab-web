# ユーザー体験フロー：「こんにちは！」入力から応答まで

ユーザがチャットに「こんにちは！」と入力した後、コードベースで何が起こるのかを完全に追跡します。

---

## 🎬 実行フロー（タイムライン）

### 時刻 T=0ms：ユーザが「こんにちは！」を入力してSend

**UI**: app.js:284
```javascript
sendBtn.addEventListener('click', submitChat);
```

ユーザが「Send」をクリック → `submitChat()` 関数が実行される

---

### T=0-5ms：入力値の検証と取得

**File**: [app.js:483-502](js/app.js)

```javascript
async function submitChat() {
    // ① 処理中でなく、入力が空でない確認
    if (isProcessingChat || !chatInput.value.trim()) return;

    // ② テキストを取得
    const text = chatInput.value.trim();  // "こんにちは！"
    
    // ③ 入力フィールドをクリア（ユーザは即座に見える）
    chatInput.value = "";
```

**ユーザの見え方**:
- チャット入力欄が空になる（入力が確定した）
- Send/Cancelボタンの表示が切り替わる（準備中）

---

### T=5-10ms：通信準備

**File**: [app.js:490-498](js/app.js)

```javascript
    // --- Claude Code (MCP Bridge) mode: route through dev-server /claude WS ---
    if (claudeChat) {
        // ① WebSocketが接続状態か確認
        if (!claudeChat.isReady()) {
            console.warn('[submitChat] claude backend not ready...');
            addMessage("system", "Claude Code バックエンド...");
            return;
        }
        
        // ② チャット履歴にユーザメッセージを追加
        addMessage("user", text);  // 画面に「こんにちは！」が表示される
        
        // ③ 処理中状態に変更（Sendボタンを非表示、Cancelボタンを表示）
        setChatProcessingState(true);
        
        // ④ WebSocket経由で送信
        claudeChat.send(text);
        return;
    }
```

**ユーザの見え方**:
- チャット画面に「ユーザ: こんにちは！」が表示される
- Send ボタンが非表示 → Cancel ボタンが表示される
- 「claude が考え中...」の視覚的フィードバック

---

### T=10-50ms：WebSocket送信

**File**: [claude-chat-client.js:94-98](js/claude-chat-client.js)

```javascript
send(text) {
    if (!this.isReady()) return false;
    
    // 送信時刻を記録（レイテンシ測定用）
    this.lastSendTime = Date.now();
    
    // WebSocket経由でDev-Serverへ送信
    // {"type": "user", "text": "こんにちは！"}
    this.ws.send(JSON.stringify({ type: 'user', text }));
    
    return true;
}
```

**ネットワーク**:
```
ブラウザ →（WebSocket） → localhost:3000/claude
```

---

### T=50-100ms：Dev-Server受信・処理

**File**: [scripts/dev-server.js:97-107](scripts/dev-server.js)

```javascript
wss.on('connection', (ws) => {
    // ...
    ws.on('message', async (raw) => {
        let msg;
        try { msg = JSON.parse(raw.toString()); } catch { return; }

        // ユーザメッセージを受け取った
        if (msg.type === 'user' && typeof msg.text === 'string' && msg.text.trim()) {
            // {"type": "user", "text": "こんにちは！"}
            // ↓
            sendToClaudeStream(msg.text);  // "こんにちは！" を claude プロセスへ
        }
    });
});
```

**ブロードキャスト**: Dev-Server → 全ての接続クライアントに `{ type: 'working' }` を送信

```javascript
function sendToClaudeStream(userText) {
    startClaudeStream();
    const line = JSON.stringify({
        type: 'user',
        message: { role: 'user', content: userText },
    });
    
    // Claude CLI プロセスへ、JSON行として送信
    if (claudeProc && claudeProc.stdin.writable) {
        claudeProc.stdin.write(line + '\n', (err) => {
            if (err) {
                broadcast({ type: 'error', error: '...' });
            }
        });
        
        // ブラウザ全クライアントに「処理中」を通知
        broadcast({ type: 'working' });
    }
}
```

**ユーザの見え方**:
- （まだ変化なし、ブロードキャストは UI 側で処理される）

---

### T=100-200ms：ブラウザが「処理中」を受信

**File**: [app.js:170-173](js/app.js)

```javascript
claudeChat = new ClaudeChatClient({
    onMessage: (msg) => {
        switch (msg.type) {
            // ...
            case 'working':
                // Reset turn state at start
                lastAssistantText = '';
                break;
```

**ユーザの見え方**:
- （まだ大きな変化なし、内部状態がリセットされた）

---

### T=200-500ms：Claude CLI が考える

**File**: [scripts/dev-server.js:178-189](scripts/dev-server.js)

Claude が起動されて、システムプロンプトと共にリクエストが処理される：

```javascript
const toioSystemPrompt = `あなたはズンダモン、toioキューブロボットを操作する陽気なアシスタント。
## toioマットの座標系
...
## 利用可能なツール
- \`move_to(x, y, angle)\`: 絶対座標に移動...
...
## ナレーション指示（IMPORTANT）
応答の最後に **必ず** 以下のマーカーを追加：
- **ユーザへの直接応答** → [SHOULD_NARRATE]
- **単純な完了報告のみ** → [NO_NARRATE]

例:
「こんにちは！ズンダモンです！[SHOULD_NARRATE]」
「移動完了！[NO_NARRATE]」
`;

const args = [
    '-p',
    '--input-format', 'stream-json',
    '--output-format', 'stream-json',
    '--append-system-prompt', toioSystemPrompt,
    '--model', 'claude-haiku-4-5-20251001',
    '--dangerously-skip-permissions',
];

claudeProc = spawn('claude', args, { cwd: ROOT, shell: true });
```

Claude の内部処理：
1. ユーザ入力「こんにちは！」を読む
2. システムプロンプト（ズンダモンのキャラ設定 + 利用可能なツール）を合わせる
3. 応答を生成する
4. **必ず** `[SHOULD_NARRATE]` か `[NO_NARRATE]` マーカーを追加する

**Claude が生成する応答例**:
```
こんにちは！私はズンダモン、toioキューブロボットの操作を助けるアシスタントです。
何かお手伝いできることはありますか？[SHOULD_NARRATE]
```

---

### T=500-600ms：Claude の出力をパース

**File**: [scripts/dev-server.js:194-209](scripts/dev-server.js)

```javascript
claudeProc.stdout.on('data', (chunk) => {
    claudeStdoutBuf += chunk.toString();
    let idx;
    while ((idx = claudeStdoutBuf.indexOf('\n')) >= 0) {
        const line = claudeStdoutBuf.slice(0, idx);
        claudeStdoutBuf = claudeStdoutBuf.slice(idx + 1);
        if (!line.trim()) continue;
        try {
            const obj = JSON.parse(line);
            log('[claude output]', JSON.stringify(obj).slice(0, 200));
            
            // ← ここで処理
            handleClaudeStreamMessage(obj);
        } catch (e) {
            warn('parse error on line:', line.slice(0, 150));
        }
    }
});
```

Claude の出力は JSON 行形式（stream-json）で届く：

```json
{
  "type": "assistant",
  "message": {
    "content": [
      {
        "type": "text",
        "text": "こんにちは！私はズンダモン、toioキューブロボットの操作を助けるアシスタントです。\n何かお手伝いできることはありますか？[SHOULD_NARRATE]"
      }
    ]
  }
}
```

---

### T=600-650ms：ナレーション計画の抽出

**File**: [scripts/dev-server.js:266-284](scripts/dev-server.js)

```javascript
function handleClaudeStreamMessage(obj) {
    if (obj.type === 'assistant' && obj.message?.content) {
        const textParts = [];
        for (const block of obj.message.content) {
            if (block.type === 'text' && block.text) {
                textParts.push(block.text);
            }
        }

        // ナレーション計画抽出関数を呼ぶ
        if (textParts.length > 0) {
            const fullText = textParts.join('\n');
            const { cleanText, narrationPlan } = extractNarrationPlan(fullText);
            
            // ← ここで cleanText と narrationPlan が分離される
            broadcast({ type: 'assistant', text: cleanText, narrationPlan });
        }
    }
}
```

**抽出処理**: [scripts/dev-server.js:290-314](scripts/dev-server.js)

```javascript
function extractNarrationPlan(text) {
    let shouldNarrate = null;
    let cleanText = text;

    // マーカー検出
    if (text.includes('[SHOULD_NARRATE]')) {
        shouldNarrate = true;
        cleanText = text.replace(/\s*\[SHOULD_NARRATE\]\s*$/m, '');
        // "こんにちは！私はズンダモン...何かお手伝いできることはありますか？"
    } else if (text.includes('[NO_NARRATE]')) {
        shouldNarrate = false;
        cleanText = text.replace(/\s*\[NO_NARRATE\]\s*$/m, '');
    }

    if (shouldNarrate !== null) {
        return {
            cleanText: cleanText.trim(),
            narrationPlan: {
                should_narrate: shouldNarrate,
                text: cleanText.trim()
            }
        };
    }

    return { cleanText: text, narrationPlan: null };
}
```

**結果**:
```javascript
{
    cleanText: "こんにちは！私はズンダモン、toioキューブロボットの操作を助けるアシスタントです。\n何かお手伝いできることはありますか？",
    narrationPlan: {
        should_narrate: true,
        text: "こんにちは！私はズンダモン、toioキューブロボットの操作を助けるアシスタントです。\n何かお手伝いできることはありますか？"
    }
}
```

---

### T=650-700ms：ブラウザが応答を受信

**File**: [app.js:174-182](js/app.js)

```javascript
case 'assistant': {
    const displayText = msg.text || '(空のレスポンス)';
    
    // ③ UI に応答を表示（マーカーなし）
    addMessage('ai', displayText);
    // → チャット画面に「こんにちは！私はズンダモン...」が表示される
    
    // ④ 状態を保存（後で voice feedback に使う）
    lastAssistantText = msg.text || '';
    lastNarrationPlan = msg.narrationPlan || null;
    
    // Don't close state yet — wait for 'result'
    break;
}
```

**ユーザの見え方**:
```
チャット画面:
┌─────────────────────────────────────────────────────┐
│ ユーザ: こんにちは！                                   │
│                                                       │
│ AI: こんにちは！私はズンダモン、toioキューブロボットの │
│    操作を助けるアシスタントです。                     │
│    何かお手伝いできることはありますか？               │
│                                                       │
│ [Cancel]                                              │
└─────────────────────────────────────────────────────┘
```

---

### T=700-800ms：Claude が最終メッセージを送信

Dev-Server が結果メッセージを受信：

```json
{
  "type": "result"
}
```

**File**: [scripts/dev-server.js:285-287](scripts/dev-server.js)

```javascript
else if (obj.type === 'result') {
    broadcast({ type: 'result', done: true });
}
```

Dev-Server → ブラウザに `{ type: 'result', done: true }` をブロードキャスト

---

### T=800-900ms：ナレーション判定と音声合成

**File**: [app.js:183-203](js/app.js)

```javascript
case 'result': {
    // ① ヒューリスティック：単純な完了メッセージをスキップするか判定
    const isSingleLineCompletion = 
        lastAssistantText.trim().split('\n').length === 1 &&
        /^(.*?(完了|終了|完了しました|してきました|到達しました).*)$/.test(lastAssistantText);
    
    // この場合は false（複数行＆完了パターンではない）

    // ② 明示的なナレーション計画をチェック
    if (lastNarrationPlan && lastNarrationPlan.should_narrate === false) {
        // スキップ
        console.log('[ClaudeChat] Narration plan: skip');
    }
    // ③ ヒューリスティック：単純完了メッセージはスキップ
    else if (isSingleLineCompletion) {
        console.log('[ClaudeChat] Heuristic: skip simple completion');
    }
    // ④ 条件満たす → 音声合成！
    else if (lastAssistantText.trim() && bridge && bridge.isConnected()) {
        console.log('[ClaudeChat] Speak response');
        
        // ナレーション計画にカスタムテキストがあればそれを使う
        const textToSpeak = lastNarrationPlan?.text || lastAssistantText;
        // = "こんにちは！私はズンダモン...何かお手伝いできることはありますか？"
        
        // ⑤ MCP Bridge 経由で speak_text ツールを呼ぶ
        bridge.call('speak_text', {
            text: textToSpeak,
            language: 'ja'
        }).catch(err => console.error('[speak_text] Failed:', err));
    }
    
    setChatProcessingState(false);
    lastNarrationPlan = null;
    break;
}
```

**ユーザの見え方**:
- Send ボタンが再び表示される
- Cancel ボタンが非表示になる
- **スピーカーから音が出る！** 🔊
  ```
  「こんにちは！私はズンダモン、toioキューブロボットの操作を助けるアシスタントです。
   何かお手伝いできることはありますか？」
  ```

---

### T=900-1100ms：音声合成実行

MCP Bridge が `speak_text` ツール呼び出しをハンドル：

**File**: [js/mcp-bridge.js:46-65](js/mcp-bridge.js)

```javascript
async call(toolName, args) {
    if (!this.isConnected()) {
        throw new Error('MCP bridge not connected');
    }
    const msgId = `call-${Date.now()}-${Math.random()}`;
    return new Promise((resolve, reject) => {
        this.pendingCalls.set(msgId, { resolve, reject });
        const payload = {
            type: 'call',
            id: msgId,
            name: toolName,        // "speak_text"
            arguments: args,       // { text: "こんにちは！...", language: 'ja' }
        };
        try {
            this.ws.send(JSON.stringify(payload));
        } catch (e) {
            this.pendingCalls.delete(msgId);
            reject(e);
        }
    });
}
```

MCP Server が受け取って ToolExecutor に転送：

**File**: [js/tool-executor.js:261-284](js/tool-executor.js)

```javascript
case "speak_text": {
    const text = args.text || "";
    const language = args.language || "ja";

    // バリデーション
    if (!text.trim()) {
        resultData = { status: "error", error: "Text cannot be empty" };
        break;
    }

    if (text.length > 500) {
        resultData = {
            status: "error",
            error: `Text too long (${text.length}/500 chars). Please split into shorter chunks.`
        };
        break;
    }

    try {
        // ← 実際の音声合成を実行
        resultData = await this.toio.speakText(text, language);
    } catch (error) {
        resultData = { status: "error", error: error.message };
    }
    break;
}
```

ToioCombined が VOICEVOX と Web Speech API を試す：

**File**: [js/toio-combined.js:95-102](js/toio-combined.js)

```javascript
async speakText(text, language = 'ja', speakerId = 3) {
    try {
        // ① VOICEVOX を試す（高品質）
        return await this._speakWithVoiceVox(text, speakerId);
    } catch (error) {
        // ② VOICEVOX が使えない場合は Web Speech API にフォールバック
        console.warn('[speakText] VOICEVOX unavailable, falling back to Web Speech API:', error.message);
        return await this._speakWithWebSpeechAPI(text, language);
    }
}
```

**VOICEVOX 処理**: [js/toio-combined.js:104-138](js/toio-combined.js)

```javascript
async _speakWithVoiceVox(text, speakerId = 3) {
    const voicevoxPort = Number(localStorage.getItem('voicevoxPort') || 50021);
    const baseUrl = `http://localhost:${voicevoxPort}`;

    // ① 音声パラメータを取得
    const queryParams = new URLSearchParams({ text, speaker: speakerId });
    const queryResponse = await fetch(`${baseUrl}/audio_query?${queryParams}`, {
        method: 'POST',
    });

    if (!queryResponse.ok) {
        throw new Error(`VOICEVOX audio_query failed: ${queryResponse.status}`);
    }

    const audioQuery = await queryResponse.json();

    // ② 音声を合成
    const synthResponse = await fetch(`${baseUrl}/synthesis?speaker=${speakerId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(audioQuery),
    });

    if (!synthResponse.ok) {
        throw new Error(`VOICEVOX synthesis failed: ${synthResponse.status}`);
    }

    const audioBlob = await synthResponse.blob();
    
    // ③ 音声を再生
    await this._playAudio(audioBlob);

    return {
        status: "success",
        text_length: text.length,
        engine: "voicevox",
        speaker_id: speakerId
    };
}
```

**音声再生**: [js/toio-combined.js:159-179](js/toio-combined.js)

```javascript
async _playAudio(audioBlob) {
    return new Promise((resolve, reject) => {
        try {
            const audioUrl = URL.createObjectURL(audioBlob);
            const audio = new Audio(audioUrl);

            audio.onended = () => {
                URL.revokeObjectURL(audioUrl);
                resolve();
            };
            audio.onerror = (e) => {
                URL.revokeObjectURL(audioUrl);
                reject(new Error(`Audio playback error: ${e}`));
            };

            // ← ここで音声ファイルが再生される 🔊
            audio.play().catch(reject);
        } catch (error) {
            reject(error);
        }
    });
}
```

**ユーザの体験**:
```
🔊 スピーカーから聞こえる：
「こんにちは！私はズンダモン、toioキューブロボットの操作を助けるアシスタントです。
何かお手伝いできることはありますか？」
（約3-5秒間）
```

---

### T=1100-1200ms：音声再生完了、UI 確定

```javascript
audio.onended = () => {
    URL.revokeObjectURL(audioUrl);
    resolve();  // ← speak_text が完了
};
```

MCP Bridge が結果をクライアントに返す：

```javascript
const pending = this.pendingCalls.get(msg.id);
if (pending) {
    this.pendingCalls.delete(msg.id);
    pending.resolve(msg.result);  // ← promise が resolve
}
```

**ユーザの見え方**:
```
チャット画面:
┌─────────────────────────────────────────────────────┐
│ ユーザ: こんにちは！                                   │
│                                                       │
│ AI: こんにちは！私はズンダモン、toioキューブロボットの │
│    操作を助けるアシスタントです。                     │
│    何かお手伝いできることはありますか？               │
│                                                       │
│ [Send] ← クリック可能になった                          │
│  📝  ← 新しい入力ができる                              │
└─────────────────────────────────────────────────────┘
```

---

## 📊 完全なフロー図

```
ユーザが「こんにちは！」と入力 + Send ボタン
        ↓
[app.js:483]
submitChat() → validateInput & setText
        ↓
[app.js:496]
addMessage("user", "こんにちは！")  ← チャットに表示
        ↓
[app.js:497-498]
setChatProcessingState(true)  ← UI: Send非表示, Cancel表示
claudeChat.send(text)
        ↓
[claude-chat-client.js:94-98]
WebSocket送信 → localhost:3000/claude
        ↓ (50ms)
[dev-server.js:97-107]
dev-server が受信
        ↓
[dev-server.js:236-253]
sendToClaudeStream() → claude CLI へ JSON行で送信
broadcast({ type: 'working' })
        ↓ (200-300ms)
[claude CLI]
🧠 Claude が考える → 応答を生成 → [SHOULD_NARRATE]マーカー付け
        ↓ (300-400ms)
[dev-server.js:194-209]
Claude出力をJSON行でパース
        ↓
[dev-server.js:266-284]
handleClaudeStreamMessage()
extractNarrationPlan() → cleanText + narrationPlan を分離
broadcast({ type: 'assistant', text: cleanText, narrationPlan })
        ↓ (50ms)
[app.js:174-182]
case 'assistant':
  addMessage('ai', displayText)  ← チャットに応答表示
  lastAssistantText = msg.text
  lastNarrationPlan = msg.narrationPlan
        ↓ (少し後)
[dev-server.js:285-287]
結果メッセージ送信
broadcast({ type: 'result' })
        ↓ (50ms)
[app.js:183-203]
case 'result':
  narration判定ロジック
    - lastNarrationPlan.should_narrate === true
    - isSingleLineCompletion === false
  → 条件満たす ✓
  bridge.call('speak_text', { text, language })
        ↓ (100ms)
[mcp-bridge.js:46-65]
MCP Bridge が tool call を送信
        ↓
[tool-executor.js:261-284]
case "speak_text":
  this.toio.speakText(text, language)
        ↓
[toio-combined.js:95-138]
_speakWithVoiceVox():
  1. /audio_query へ POST → JSON params 取得
  2. /synthesis へ POST → Audio blob 取得
  3. _playAudio(blob) → HTML Audio で再生
        ↓ (200-500ms)
🔊 スピーカーから音声出力
        ↓ (3-5秒)
音声再生完了
        ↓
[app.js:200]
setChatProcessingState(false)  ← UI: Send表示, Cancel非表示
        ↓
✅ ユーザが新しい入力可能に
```

---

## 🔍 各キーポイント

### 1. **入力から表示まで（T=0-10ms）**
- ユーザ入力が即座にチャット画面に表示される
- 送信と UI 状態が同期的に変更される

### 2. **ネットワーク往復（T=10-50ms）**
- WebSocket で dev-server へ送信（低遅延）
- JSON 形式で効率的に通信

### 3. **Claude の処理（T=200-500ms）**
- CLI プロセスがシステムプロンプト付きで起動
- ナレーション指示を **必ず** 含める設計

### 4. **ナレーション計画の抽出（T=600-650ms）**
- Dev-Server が `[SHOULD_NARRATE]` マーカーを検出
- マーカーを除いたテキストをブラウザへ送信

### 5. **判定ロジック（T=800-850ms）**
- **明示的判定**: ナレーション計画をチェック
- **ヒューリスティック判定**: 単純な完了メッセージはスキップ
- 両方満たさない → 音声合成実行

### 6. **VOICEVOX 合成（T=900-1100ms）**
- 2つの API 呼び出しで高品質音声を取得
- 失敗時は Web Speech API にフォールバック

### 7. **UI 復帰（T=1100-1200ms）**
- 音声再生完了後に Send ボタンが有効化
- ユーザは次の入力を開始可能

---

## 💡 ユーザ体験のポイント

### 視覚的フィードバック
- ✅ 入力が即座にチャットに表示
- ✅ Send/Cancel ボタンで状態が明確
- ✅ 応答テキストが素早く表示

### 音声フィードバック
- ✅ タイミングは自動判定（明示的 + ヒューリスティック）
- ✅ 単純な完了メッセージでは読み上げない
- ✅ VOICEVOX がない場合は Web Speech に自動フォールバック

### エラーハンドリング
- ✅ Dev-Server が使えない → エラーメッセージ表示
- ✅ Claude が使えない → 適切なエラー返却
- ✅ VOICEVOX が使えない → Web Speech API で対応
- ✅ 音声再生失敗 → サイレント失敗（ログのみ）

### レイテンシ最適化
- ✅ テキスト表示は即座（ネットワーク往復不要）
- ✅ 応答は streaming で受け取り（全完了待たず表示）
- ✅ 音声合成は非ブロッキング（UI は応答可能）

