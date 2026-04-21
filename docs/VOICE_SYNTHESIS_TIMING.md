# 音声合成のタイミングと対象文字

ユーザが「こんにちは！」と入力したときに、**いつ音声が出るのか**、**何が読み上げられるのか**を詳細に解説します。

---

## 🎯 簡潔な回答

| 項目 | 内容 |
|------|------|
| **実行タイミング** | Claude の応答がすべて届いた後（`result` メッセージ受信時） |
| **読み上げ対象** | Claude が生成した応答テキスト（`[SHOULD_NARRATE]`/`[NO_NARRATE]`マーカーは除外） |
| **判定タイミング** | `result` メッセージが来た瞬間に、3つの条件で判定 |
| **実際の例** | `case 'result':` → 判定ロジック実行 → `bridge.call('speak_text', ...)` |

---

## 📍 タイミング図

```
ユーザが「こんにちは！」入力
        ↓
Claude が応答を生成
        ↓
─── 前半：テキスト受信と表示 ─────────────────────────────────
        ↓
case 'assistant':  ← 受け取った瞬間（応答の一部）
  - チャット画面に表示
  - lastAssistantText に保存
  - lastNarrationPlan に保存
  ※ この時点では音声は出ない
        ↓
（応答の残り部分が続々と届く）
        ↓
─── 後半：応答完了で判定 ──────────────────────────────────────
        ↓
case 'result':     ← 応答完了（ここで初めて判定）
  
  1️⃣ 判定ロジック実行
     - lastNarrationPlan.should_narrate === false ? → スキップ
     - isSingleLineCompletion ? → スキップ
     - テキスト存在 && bridge接続 ? → 実行
  
  2️⃣ textToSpeak を決定
     - ナレーション計画に text あり → それを使う
     - なし → 元の応答テキストを使う
  
  3️⃣ bridge.call('speak_text', ...)
        ↓
💬 MCP Bridge が tool call を処理
        ↓
🔊 VOICEVOX（またはWeb Speech API）で音声合成 & 再生
```

---

## 🔍 詳細：3つの判定ポイント

ユーザが「こんにちは！」と入力 → Claude が「こんにちは！私はズンダモン...」と返す場合

### 【File】: [app.js:183-203](js/app.js)

```javascript
case 'result': {
    // ═══════════════════════════════════════════════════════════
    // 判定1️⃣: 明示的なナレーション計画をチェック
    // ═══════════════════════════════════════════════════════════
    if (lastNarrationPlan && lastNarrationPlan.should_narrate === false) {
        //
        // Dev-Server が Claude 応答から [NO_NARRATE] を検出した
        //
        // 例: 「移動完了[NO_NARRATE]」
        //
        console.log('[ClaudeChat] Narration plan: skip');
        // → 音声合成は実行されない ✗
    }
```

**条件1: `lastNarrationPlan.should_narrate === false`**

- Claude の応答に `[NO_NARRATE]` マーカーがあると true
- Claude の応答に `[SHOULD_NARRATE]` マーカーがあると false
- マーカーなしなら `null` → この条件は false

**例**:
```
Claude の応答:
「移動完了しました[NO_NARRATE]」

↓ dev-server で抽出

narrationPlan: {
    should_narrate: false,  ← これ
    text: "移動完了しました"
}

↓ ブラウザで判定

if (lastNarrationPlan && lastNarrationPlan.should_narrate === false)
    // true → スキップ（音声出ない）
```

---

```javascript
    // ═══════════════════════════════════════════════════════════
    // 判定2️⃣: ヒューリスティック（単純な完了メッセージ判定）
    // ═══════════════════════════════════════════════════════════
    else if (isSingleLineCompletion) {
        //
        // 以下の両方を満たす場合スキップ：
        // 1. 1行のテキスト（改行なし）
        // 2. 完了系の日本語を含む：「完了」「終了」「完了しました」など
        //
        // これは意図的マーカーがない場合の自動判定
        //
        console.log('[ClaudeChat] Heuristic: skip simple completion');
        // → 音声合成は実行されない ✗
    }
```

**条件2: `isSingleLineCompletion`**

```javascript
const isSingleLineCompletion = 
    lastAssistantText.trim().split('\n').length === 1 &&  // 1行のみ
    /^(.*?(完了|終了|完了しました|してきました|到達しました).*)$/.test(lastAssistantText);
    // ↑ これらのキーワードを含む
```

**例**:
```
Claude の応答：
「移動完了しました」

↓ チェック

isSingleLineCompletion = true
  - split('\n').length === 1  ✓ （改行なし）
  - /...完了しました.../.test(...)  ✓ （完了キーワード）

↓ ブラウザで判定

if (isSingleLineCompletion)
    // true → スキップ（音声出ない）
```

**スキップされる例**:
- 「完了しました」
- 「到達しました」
- 「終了です」
- 「してきました」

**スキップされない例**（複数行 or キーワード未含）:
- 「完了しました。\n次に何をしましょうか？」（複数行）
- 「移動しました」（「完了」ではなく「しました」のみ）
- 「今から移動を開始します」（完了ではなく開始）

---

```javascript
    // ═══════════════════════════════════════════════════════════
    // 判定3️⃣: 条件満たす → 実行
    // ═══════════════════════════════════════════════════════════
    else if (lastAssistantText.trim() && bridge && bridge.isConnected()) {
        //
        // 判定1と判定2で スキップ されなかった場合、ここで実行
        //
        // 条件：
        // - lastAssistantText が空ではない（テキストがある）
        // - bridge が接続している（MCP Bridge が使える）
        //
        console.log('[ClaudeChat] Speak response');
        
        // ═══════════════════════════════════════════════════════════
        // 🎯 どのテキストが読み上げられるか決定
        // ═══════════════════════════════════════════════════════════
        const textToSpeak = lastNarrationPlan?.text || lastAssistantText;
        //                   ↑優先                   ↑ フォールバック
        //
        // ナレーション計画に text があればそれ、なければ元の応答を使う
        //
        
        bridge.call('speak_text', {
            text: textToSpeak,
            language: 'ja'
        }).catch(err => console.error('[speak_text] Failed:', err));
        
        // ← ここで音声合成が実行される 🔊
    }
    
    setChatProcessingState(false);
    lastNarrationPlan = null;
    break;
}
```

**条件3: `lastAssistantText.trim() && bridge && bridge.isConnected()`**

条件1と2で「スキップ」されなかった場合に実行。

---

## 📝 実例：「こんにちは！」の場合

### 【シナリオ】

**ユーザ入力**:
```
こんにちは！
```

**Claude の応答**（システムプロンプト付き）:
```
こんにちは！私はズンダモン、toioキューブロボットの操作を助けるアシスタントです。
何かお手伝いできることはありますか？[SHOULD_NARRATE]
```

### 【Dev-Server での処理】

[scripts/dev-server.js:290-314](scripts/dev-server.js)

```javascript
function extractNarrationPlan(text) {
    let shouldNarrate = null;
    let cleanText = text;

    // マーカーを検出
    if (text.includes('[SHOULD_NARRATE]')) {
        shouldNarrate = true;
        cleanText = text.replace(/\s*\[SHOULD_NARRATE\]\s*$/m, '');
        // cleanText = "こんにちは！私はズンダモン...何かお手伝いできることはありますか？"
    }
    
    return {
        cleanText: cleanText.trim(),
        narrationPlan: {
            should_narrate: true,  // ← 重要
            text: cleanText.trim()
        }
    };
}
```

**ブロードキャスト**:
```javascript
broadcast({ 
    type: 'assistant', 
    text: "こんにちは！私はズンダモン...何かお手伝いできることはありますか？",
    narrationPlan: {
        should_narrate: true,
        text: "こんにちは！私はズンダモン...何かお手伝いできることはありますか？"
    }
});
```

### 【ブラウザでの処理】

#### 1️⃣ `case 'assistant':` で受信

[app.js:174-182](js/app.js)

```javascript
case 'assistant': {
    const displayText = msg.text || '(空のレスポンス)';
    
    // チャット画面に表示
    addMessage('ai', displayText);
    // → "こんにちは！私はズンダモン...何かお手伝いできることはありますか？"
    
    // 状態を保存
    lastAssistantText = msg.text;
    // = "こんにちは！私はズンダモン...何かお手伝いできることはありますか？"
    
    lastNarrationPlan = msg.narrationPlan;
    // = { should_narrate: true, text: "こんにちは！..." }
    
    break;
}
```

**この時点**:
- ✅ チャット画面に「こんにちは！私はズンダモン...」と表示される
- ✅ 音声はまだ出ない ⏸️

#### 2️⃣ `case 'result':` で判定と実行

[app.js:183-203](js/app.js)

```javascript
case 'result': {
    // 判定1️⃣: 明示的なナレーション計画
    if (lastNarrationPlan && lastNarrationPlan.should_narrate === false) {
        console.log('[ClaudeChat] Narration plan: skip');
    }
    // → false（should_narrate は true だから）
    
    // 判定2️⃣: ヒューリスティック
    const isSingleLineCompletion = 
        lastAssistantText.trim().split('\n').length === 1 &&
        /^(.*?(完了|終了|完了しました|してきました|到達しました).*)$/.test(lastAssistantText);
    // 
    // split('\n').length = 3（「こんにちは！」「私はズンダモン...」「何かお手伝い...」で複数行）
    // → isSingleLineCompletion = false
    
    else if (isSingleLineCompletion) {
        console.log('[ClaudeChat] Heuristic: skip simple completion');
    }
    // → false を評価しない
    
    // 判定3️⃣: テキスト存在 && bridge接続
    else if (lastAssistantText.trim() && bridge && bridge.isConnected()) {
        console.log('[ClaudeChat] Speak response');
        
        // textToSpeak を決定
        const textToSpeak = lastNarrationPlan?.text || lastAssistantText;
        // lastNarrationPlan?.text が存在するので
        // = "こんにちは！私はズンダモン...何かお手伝いできることはありますか？"
        
        // 🔊 音声合成実行
        bridge.call('speak_text', {
            text: textToSpeak,  // ここが読み上げられるテキスト！
            language: 'ja'
        });
    }
    // → ここで実行される ✓
```

**この時点**:
- ✅ 判定1: `should_narrate === false` ではない → スキップしない
- ✅ 判定2: 複数行なので `isSingleLineCompletion = false` → スキップしない
- ✅ 判定3: テキスト存在＆bridge接続 → **実行**
- 🔊 **スピーカーから読み上げられる**

```
「こんにちは！私はズンダモン、toioキューブロボットの操作を助けるアシスタントです。
何かお手伝いできることはありますか？」
```

---

## 📊 判定フロー（デシジョンツリー）

```
result メッセージ受信
    ↓
┌─ 判定1️⃣: should_narrate === false ?
│   └─→ YES : スキップ 🚫
│   └─→ NO  : 判定2へ
│
├─ 判定2️⃣: isSingleLineCompletion ?
│   └─→ YES : スキップ 🚫
│   └─→ NO  : 判定3へ
│
└─ 判定3️⃣: テキスト存在 && bridge接続 ?
    └─→ YES : 実行 ✅ 🔊
    └─→ NO  : スキップ 🚫
```

---

## 🎙️ 実行される音声合成（VOICEVOX）

判定3で実行されると、以下が実行される：

[js/toio-combined.js:95-138](js/toio-combined.js)

```javascript
async speakText(text, language = 'ja', speakerId = 3) {
    try {
        // 1. VOICEVOX へリクエスト
        const queryParams = new URLSearchParams({ text, speaker: speakerId });
        // text = "こんにちは！私はズンダモン...何かお手伝いできることはありますか？"
        // speaker = 3 (Zundamon female character voice)
        
        const queryResponse = await fetch(`http://localhost:50021/audio_query?${queryParams}`, {
            method: 'POST',
        });
        
        const audioQuery = await queryResponse.json();
        
        // 2. 音声を合成
        const synthResponse = await fetch(`http://localhost:50021/synthesis?speaker=${speakerId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(audioQuery),
        });
        
        const audioBlob = await synthResponse.blob();
        
        // 3. 音声を再生
        await this._playAudio(audioBlob);
        // ← ここで実際に音が出る 🔊
        
        return {
            status: "success",
            text_length: text.length,
            engine: "voicevox",
            speaker_id: speakerId
        };
    } catch (error) {
        // VOICEVOX が使えない場合は Web Speech API へフォールバック
        return await this._speakWithWebSpeechAPI(text, language);
    }
}
```

**実際の音**:
```
Zundamon（ズンダモン）の女性キャラクターボイスで：
「こんにちは！私はズンダモン、toioキューブロボットの操作を
助けるアシスタントです。何かお手伝いできることはありますか？」
（約4-5秒）
```

---

## 🔄 複数ターンの例

### ターン1: ユーザ「こんにちは！」

**Claude 応答**:
```
こんにちは！何かお手伝いできることはありますか？[SHOULD_NARRATE]
```

**判定結果**:
- `should_narrate === true` ✓
- 複数行 ✗
- → **実行** 🔊 「こんにちは！...」と音声出力

---

### ターン2: ユーザ「中央に移動して」

**Claude 応答**:
```
中央に移動します[NO_NARRATE]
```

**Dev-Server での抽出**:
```javascript
// [NO_NARRATE] マーカーを検出
narrationPlan = {
    should_narrate: false,
    text: "中央に移動します"
}
```

**判定結果**:
- `should_narrate === false` ✗ → **スキップ** 🚫
- 音声は出ない

---

### ターン3: ユーザ「赤く光って」

**Claude 応答**（マーカーなし）:
```
赤く光らせました
```

**Dev-Server での抽出**:
```javascript
// マーカーなし
narrationPlan = null
```

**判定結果**:
- `should_narrate === false` ではない → 判定2へ
- `isSingleLineCompletion`: 
  - 1行 ✓
  - /完了|終了|.../.test("赤く光らせました") ✗
  → `isSingleLineCompletion = false`
- → **実行** 🔊 「赤く光らせました」と音声出力

---

### ターン4: ユーザ「移動完了した？」

**Claude 応答**（マーカーなし）:
```
はい、移動完了しました
```

**判定結果**:
- `should_narrate === false` ではない → 判定2へ
- `isSingleLineCompletion`:
  - 1行 ✓
  - /完了|終了|.../.test("はい、移動完了しました") ✓
  → `isSingleLineCompletion = true`
- → **スキップ** 🚫
- 音声は出ない

---

## 📋 まとめ：何が読み上げられるか

| 場面 | Claude の応答 | マーカー | 結果 | 読み上げられる文字 |
|------|---------------|---------|------|------------------|
| 初期応答 | 「こんにちは！何かお手伝い...」 | `[SHOULD_NARRATE]` | ✅ | 「こんにちは！何かお手伝...」 |
| 移動指示 | 「中央に移動します」 | `[NO_NARRATE]` | ❌ | （なし） |
| 色設定 | 「赤く光らせました」 | なし | ✅ | 「赤く光らせました」 |
| 移動完了 | 「移動完了しました」 | なし | ❌ | （なし） |
| ユーザ質問への応答 | 「移動は終わりました。\n次は何しましょう？」 | なし | ✅ | 「移動は終わりました。次は何しましょう？」 |

---

## 💡 設計のポイント

### 1️⃣ **2層の判定**
- **明示的**: Claude が `[SHOULD_NARRATE]` / `[NO_NARRATE]` で指示
- **ヒューリスティック**: 単純な完了メッセージは自動スキップ

### 2️⃣ **タイミングは「応答完了後」**
- テキストがすべて届く前に音声は出ない
- `result` メッセージで初めて判定

### 3️⃣ **読み上げるテキスト**
- Dev-Server が `[SHOULD_NARRATE]` / `[NO_NARRATE]` マーカーを除去
- ブラウザは「クリーンなテキスト」だけを受け取る
- 音声化するのもこのクリーンなテキスト

### 4️⃣ **フォールバック機能**
- VOICEVOX が使えない → Web Speech API に自動切り替え
- 判定でスキップ → 音声なし（エラーではない）

