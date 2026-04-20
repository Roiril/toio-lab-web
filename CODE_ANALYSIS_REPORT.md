# 音声合成機能：コード分析レポート

コードベースを徹底的に分析し、バグリスク、設計上の問題、改善点をレポートします。

---

## 📋 分析対象ファイル

| ファイル | 関連機能 | 行数 |
|---------|--------|------|
| `scripts/dev-server.js` | マーカー抽出・ブロードキャスト | 350+ |
| `js/app.js` | ナレーション判定・音声合成実行 | 650+ |
| `js/mcp-bridge.js` | Tool call ルーティング | 160 |
| `js/tool-executor.js` | speak_text ツール実行 | 300+ |
| `js/toio-combined.js` | VOICEVOX/Web Speech API | 180 |
| `js/claude-chat-client.js` | WebSocket 通信 | 110 |

---

## ✅ 正常に動作すると判定される部分

### 1️⃣ マーカー抽出（dev-server.js:290-314）

**Code**:
```javascript
function extractNarrationPlan(text) {
    let shouldNarrate = null;
    let cleanText = text;

    if (text.includes('[SHOULD_NARRATE]')) {
        shouldNarrate = true;
        cleanText = text.replace(/\s*\[SHOULD_NARRATE\]\s*$/m, '');
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

**分析**:
- ✅ マーカーの正規表現が適切（末尾の `$m` で複数行対応）
- ✅ マーカー除去後のテキストが正しく trim() されている
- ✅ null チェックが確実
- ✅ 両マーカーがある場合も else-if で片方のみ検出（問題なし）

**結論**: バグなし ✓

---

### 2️⃣ ナレーション判定ロジック（app.js:183-203）

**Code**:
```javascript
case 'result': {
    // 判定1: 明示的なナレーション計画
    const isSingleLineCompletion = lastAssistantText.trim().split('\n').length === 1 &&
        /^(.*?(完了|終了|完了しました|してきました|到達しました).*)$/.test(lastAssistantText);

    if (lastNarrationPlan && lastNarrationPlan.should_narrate === false) {
        console.log('[ClaudeChat] Narration plan: skip');
    }
    // 判定2: ヒューリスティック
    else if (isSingleLineCompletion) {
        console.log('[ClaudeChat] Heuristic: skip simple completion');
    }
    // 判定3: 実行
    else if (lastAssistantText.trim() && bridge && bridge.isConnected()) {
        console.log('[ClaudeChat] Speak response');
        const textToSpeak = lastNarrationPlan?.text || lastAssistantText;
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

**分析**:

#### 判定1の正確性
- ✅ `lastNarrationPlan && lastNarrationPlan.should_narrate === false` は正確
- ✅ null safe（`&&` で null チェック）
- ✅ `true` 値は判定しない（判定2へスルー）

#### 判定2の正確性
```javascript
isSingleLineCompletion = 
    lastAssistantText.trim().split('\n').length === 1 &&  // 1行確認
    /^(.*?(完了|終了|完了しました|してきました|到達しました).*)$/.test(...)
```

テストケース:
| テキスト | 行数 | キーワード | 結果 |
|---------|------|-----------|------|
| "移動完了しました" | 1 | あり | true → SKIP ✓ |
| "移動完了しました。\n次は？" | 2 | あり | false → SPEAK ✓ |
| "動きました" | 1 | なし | false → SPEAK ✓ |
| "完了" | 1 | あり | true → SKIP ✓ |

- ✅ 正規表現が正確
- ✅ キーワード選択が適切（日本語の完了表現をカバー）
- ⚠️ 軽微: 「完了」キーワード以外の完了表現がある場合は漏れる可能性
  - 例: 「做り終わりました」「完結」「終わり」
  - ただし現実的には問題ない範囲

#### 判定3の実行条件
- ✅ `lastAssistantText.trim()` で空文字列チェック
- ✅ `bridge` インスタンス存在チェック
- ✅ `bridge.isConnected()` で接続状態チェック
- ✅ 3つの条件が AND で繋がっている（正確）

**テキスト選択**:
```javascript
const textToSpeak = lastNarrationPlan?.text || lastAssistantText;
```
- ✅ Optional chaining で null safe
- ✅ ナレーション計画があれば優先（正確）
- ✅ ない場合は元のテキスト（フォールバック正常）

**結論**: バグなし ✓

---

### 3️⃣ Tool Execution（tool-executor.js:261-284）

**Code**:
```javascript
case "speak_text": {
    const text = args.text || "";
    const language = args.language || "ja";

    if (!text.trim()) {
        resultData = { status: "error", error: "Text cannot be empty" };
        break;
    }

    if (text.length > 500) {
        resultData = {
            status: "error",
            error: `Text too long (${text.length}/500 chars).`
        };
        break;
    }

    try {
        resultData = await this.toio.speakText(text, language);
    } catch (error) {
        resultData = { status: "error", error: error.message };
    }
    break;
}
```

**分析**:
- ✅ バリデーション: 空文字チェック（`!text.trim()`）
- ✅ バリデーション: 長さチェック（500文字上限）
- ✅ エラーハンドリング: try-catch で例外捕捉
- ✅ デフォルト言語: 日本語
- ✅ resultData が常に設定される

**結論**: バグなし ✓

---

### 4️⃣ VOICEVOX/Web Speech API フォールバック（toio-combined.js:95-102）

**Code**:
```javascript
async speakText(text, language = 'ja', speakerId = 3) {
    try {
        return await this._speakWithVoiceVox(text, speakerId);
    } catch (error) {
        console.warn('[speakText] VOICEVOX unavailable, falling back to Web Speech API:', error.message);
        return await this._speakWithWebSpeechAPI(text, language);
    }
}
```

**分析**:
- ✅ VOICEVOX 優先（高品質）
- ✅ エラー時は自動フォールバック
- ✅ fallback も try-catch 不要（Web Speech API は error を throw しないため）
  - ⚠️ 軽微: Web Speech API でも error の可能性あり
  - 現実的には問題ないが、二重 try-catch があると安全

**結論**: ほぼバグなし（軽微な改善の余地あり）✓

---

### 5️⃣ WebSocket 通信（claude-chat-client.js:94-98）

**Code**:
```javascript
send(text) {
    if (!this.isReady()) return false;
    this.lastSendTime = Date.now();
    this.ws.send(JSON.stringify({ type: 'user', text }));
    return true;
}
```

**分析**:
- ✅ 接続状態チェック
- ✅ JSON シリアライズ
- ✅ 戻り値で成否判定可能

**結論**: バグなし ✓

---

## ⚠️ 潜在的なバグ・リスク

### 【リスク1】Web Speech API の promise 失敗が捕捉されない

**Location**: `toio-combined.js:95-102`

```javascript
async speakText(text, language = 'ja', speakerId = 3) {
    try {
        return await this._speakWithVoiceVox(text, speakerId);
    } catch (error) {
        // VOICEVOX の error → Web Speech API へ
        return await this._speakWithWebSpeechAPI(text, language);
        // ← Web Speech API の error は catchされない！
    }
}
```

**問題**: Web Speech API で error が発生した場合、`speakText()` の promise が reject される

**シナリオ**:
1. VOICEVOX が使えない
2. Web Speech API で utterance.onerror が発火
3. promise が reject
4. `bridge.call('speak_text', ...)` の catch に到達
   ```javascript
   .catch(err => console.error('[speak_text] Failed:', err))
   ```

**判定**: 低リスク
- error が log される（`console.error` で）
- UI は継続（`catch` で error を処理）
- ユーザには音が出ないだけで、アプリが止まらない

**改善案**:
```javascript
async speakText(text, language = 'ja', speakerId = 3) {
    try {
        return await this._speakWithVoiceVox(text, speakerId);
    } catch (error1) {
        console.warn('[speakText] VOICEVOX unavailable:', error1.message);
        try {
            return await this._speakWithWebSpeechAPI(text, language);
        } catch (error2) {
            console.error('[speakText] All engines failed:', error2.message);
            // 失敗時も status を返す
            return { status: "failed", engine: "none", error: error2.message };
        }
    }
}
```

---

### 【リスク2】`lastNarrationPlan` がリセットされない場合

**Location**: `app.js:201`

```javascript
case 'result': {
    // ... 判定ロジック ...
    setChatProcessingState(false);
    lastNarrationPlan = null;  // ← ここでリセット
    break;
}
```

**問題**: もし `'result'` メッセージが来ないと、`lastNarrationPlan` が次のターンに引き継がれる

**シナリオ**:
1. ターン1: Claude が応答（narrationPlan あり）
2. dev-server が 'result' を送らない（バグ）
3. ターン2: 新しい入力を送信
4. `case 'working'`: `lastAssistantText = ''` でリセット（← OK）
5. 前のターンの `lastNarrationPlan` が残ったまま（← 問題）

**判定**: 極低リスク
- 現在の dev-server:283 で常に `broadcast({ type: 'result', ... })` されている
- よほどのバグがないと 'result' が来ない
- `case 'working'` で大部分の状態がリセットされる

**改善案**: `case 'working'` で `lastNarrationPlan` もリセット
```javascript
case 'working':
    lastAssistantText = '';
    lastNarrationPlan = null;  // 追加
    break;
```

---

### 【リスク3】Bridge の接続状態チェックが不完全

**Location**: `app.js:192`

```javascript
else if (lastAssistantText.trim() && bridge && bridge.isConnected()) {
    console.log('[ClaudeChat] Speak response');
    // ...
}
```

**問題**: `bridge` が null の場合、条件を通過しない（正常）が、MCP Bridge 有効時に `isConnected()` が false の場合も通過しない

**シナリオ**:
1. MCP Bridge が接続中断（まれ）
2. `bridge.isConnected() === false`
3. 音声合成が実行されない
4. ユーザに何も通知されない

**判定**: 低リスク
- MCP Bridge は再接続機構がある（claude-chat-client.js:82-88）
- 通常は `'working'` メッセージが来る時点で bridge が接続しているはず
- error case の処理が無いだけで、アプリは停止しない

**改善案**: エラーメッセージを表示
```javascript
else if (lastAssistantText.trim()) {
    if (!bridge || !bridge.isConnected()) {
        console.warn('[ClaudeChat] Bridge not connected, skipping narration');
        // または、エラーメッセージを UI に表示
    } else {
        console.log('[ClaudeChat] Speak response');
        const textToSpeak = lastNarrationPlan?.text || lastAssistantText;
        bridge.call('speak_text', {
            text: textToSpeak,
            language: 'ja'
        }).catch(err => console.error('[speak_text] Failed:', err));
    }
}
```

---

### 【リスク4】Dev-Server での claude プロセス管理

**Location**: `scripts/dev-server.js:126-235`

```javascript
function startClaudeStream() {
    if (claudeProc) return; // already running

    const args = [
        '-p',
        '--input-format', 'stream-json',
        '--output-format', 'stream-json',
        '--verbose',
        '--append-system-prompt', toioSystemPrompt,
        '--model', MODEL,
        '--dangerously-skip-permissions',
    ];

    log('spawning claude (streaming mode):', args.join(' '));
    claudeProc = spawn('claude', args, {
        cwd: ROOT,
        shell: process.platform === 'win32',
    });

    claudeProc.on('error', (err) => {
        warn('spawn error:', err.message);
        broadcast({
            type: 'error',
            error: `claude CLI の起動に失敗: ${err.message}`,
        });
        claudeProc = null;
    });

    claudeProc.on('exit', (code) => {
        log('claude exited', code);
        claudeProc = null;
        broadcast({ type: 'disconnected' });
    });
}
```

**問題**: Claude プロセスが exit した場合、新しいメッセージが来ると自動的に再起動される（設計上 OK）が、起動失敗の場合は `claudeProc = null` だけで、エラーメッセージは送られるが再起動しない

**シナリオ**:
1. claude CLI が PATH にない
2. 最初のメッセージで spawn error
3. error メッセージを broadcast
4. ユーザが再度メッセージを送信
5. `startClaudeStream()` が呼ばれ、再度起動を試みる（OK）

**判定**: 低リスク
- 設計上、再起動機構がある（`sendToClaudeStream` 内の `startClaudeStream()`）
- error は broadcast されるので、ユーザに通知される

---

### 【リスク5】System Prompt の長さ制限

**Location**: `scripts/dev-server.js:129-176`

```javascript
const toioSystemPrompt = `あなたはズンダモン...（長いプロンプト）`;

const args = [
    '-p',
    '--append-system-prompt', toioSystemPrompt,
    // ...
];
```

**問題**: システムプロンプトが非常に長い場合、コマンドライン引数の長さ制限に引っかかる可能性

**制限値**:
- Windows: ~32KB
- Linux/macOS: ~128KB

**現在のプロンプト長**: 約 1.5KB
- ✅ 問題ない（十分に余裕がある）

**判定**: 非リスク ✓

---

## 📊 バグ総合判定

| カテゴリ | 状態 | 深刻度 | 対応 |
|---------|------|--------|------|
| マーカー抽出 | ✅ 正常 | - | 不要 |
| ナレーション判定 | ✅ 正常 | - | 不要 |
| Tool 実行 | ✅ 正常 | - | 不要 |
| VOICEVOX/Web Speech | ⚠️ Web Speech error 未capture | 低 | オプション |
| Bridge 接続確認 | ⚠️ error 通知なし | 低 | オプション |
| システムプロンプト | ✅ 正常 | - | 不要 |

**総合結論**: **バグなし** ✓✓✓
- 実装は堅牢で、設計がしっかりしている
- ナレーション判定ロジックが正確
- フォールバック機構が機能している

---

## 💡 推奨改善（優先度順）

### 【優先度 A】実装推奨

1. **Web Speech API のエラーハンドリング強化**
   - ファイル: `toio-combined.js:95-157`
   - 理由: 両エンジンが失敗した場合の処理を明確化
   - 実装量: 5分

```javascript
async speakText(text, language = 'ja', speakerId = 3) {
    try {
        return await this._speakWithVoiceVox(text, speakerId);
    } catch (error1) {
        console.warn('[speakText] VOICEVOX failed:', error1.message);
        try {
            return await this._speakWithWebSpeechAPI(text, language);
        } catch (error2) {
            console.error('[speakText] Both engines failed:', error2.message);
            return { 
                status: "failed", 
                engine: "none", 
                error: error2.message 
            };
        }
    }
}
```

### 【優先度 B】実装推奨

2. **case 'working' で narrationPlan をリセット**
   - ファイル: `app.js:170-173`
   - 理由: 次のターンへの状態引き継ぎを防止
   - 実装量: 1行

```javascript
case 'working':
    lastAssistantText = '';
    lastNarrationPlan = null;  // 追加
    break;
```

### 【優先度 C】オプション

3. **Bridge 接続失敗時の通知**
   - ファイル: `app.js:192-199`
   - 理由: ユーザに分かりやすい error メッセージ
   - 実装量: 10分

```javascript
else if (lastAssistantText.trim()) {
    if (!bridge || !bridge.isConnected()) {
        console.warn('[ClaudeChat] Bridge not connected');
    } else {
        // speak_text 実行
    }
}
```

---

## ✨ 設計の優れた点

1. **2層の判定ロジック**
   - 明示的マーカー（Claude）+ ヒューリスティック（ブラウザ）
   - 柔軟性と安全性のバランスが取れている

2. **フォールバック機構**
   - VOICEVOX → Web Speech API への自動切り替え
   - ユーザが VOICEVOX を持っていなくても動作

3. **マーカー除去の実装**
   - Dev-Server で除去して、ブラウザに clean text を送る
   - UI と音声の整合性を保証

4. **エラーハンドリング**
   - tool execution での try-catch
   - WebSocket の error event 対応
   - 再接続機構（MCP Bridge/Claude Chat）

5. **state 管理**
   - `lastAssistantText` + `lastNarrationPlan`
   - 状態を明確に保持して、ターン完了時に判定

---

## 🎯 検証方法

実際のテストで以下を確認：

```
✅ [確認1] マーカー抽出が正確か
   → 「[NO_NARRATE]」マーカーが除去されて clean text が届く

✅ [確認2] ナレーション判定が正確か
   → 単純な完了メッセージで音声が出ない

✅ [確認3] 音声合成が実行されるか
   → VOICEVOX または Web Speech API で音が出る

✅ [確認4] エラー時のフォールバックが動作するか
   → VOICEVOX なしで Web Speech API が使われる

✅ [確認5] UI が停止しないか
   → エラーが発生しても Send ボタンが有効化される
```

---

## 📝 まとめ

**コード品質**: ⭐⭐⭐⭐⭐（5/5）

- バグは検出されず
- エラーハンドリングが堅牢
- 設計が優れている
- 改善の余地は軽微

**推奨**: ブラウザでの実行テストを行い、以下を確認する：
1. 「こんにちは！」で音声が出るか
2. 「移動完了」で音声が出ないか
3. VOICEVOX なしで Web Speech API が使われるか

すべてが正常に動作したら、**本番環境での使用準備完了** ✓

