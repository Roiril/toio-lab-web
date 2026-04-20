# toio Lab Web

ブラウザからLLM（Ollama または Google Gemini）を呼び出し、自然言語でtoioコアキューブを操作するWebアプリです。

## 特徴

- **自然言語操作**: 「中央に移動して赤く光って！」のようなチャット入力でtoioを動かせます
- **LLM選択**: Ollama（ローカル）または Google Gemini API を設定画面から切り替え可能
- **ビジュアルシミュレーター**: 物理的なtoioがなくてもブラウザ上でキューブの動きを確認できます
- **BLE同時接続**: 実機のtoioとシミュレーターを同時に動かすことができます
- **エージェントループ**: `think → 実行 → 評価 → リトライ` のサイクルで指示を確実に実行します
- **セッション記憶**: 前回の指示内容を次回起動時にも引き継ぎます
- **並列ツール実行**: 光・音など独立した操作は同時に実行します

## 必要要件

| 項目 | 内容 |
|------|------|
| ブラウザ | Chrome または Edge（Web Bluetooth API対応必須） |
| Node.js | `npx serve` でローカルサーバーを起動するために必要 |
| LLM | Ollama（ローカル）または Google Gemini API キー |
| toio | 任意（なくてもシミュレーターで動作確認可能） |

---

## セットアップ

### 1. Ollama を使う場合（ローカルLLM）

LLMを動かすPCで `start-llm.bat` を実行します。

```
start-llm.bat
```

初回起動時に以下の処理が自動で行われます：

1. Ollamaのインストール・アップデート確認
2. LAN公開用のファイアウォール設定
3. Ollamaサーバーの起動
4. モデルの選択とダウンロード（対話式）

**対応モデル:**

| モデル | Ollamaタグ | 特徴 |
|--------|-----------|------|
| Gemma4 e4b | `gemma4:e4b` | 軽量・高速（推奨） |
| Gemma4 26B A4B | `gemma4:26b` | 26B MoE、Active 4B・高品質 |

モデルの選択フロー：
- 両方インストール済み → どちらを使うか選択
- 片方のみ → もう片方をダウンロードするか確認後、使用モデルを選択
- 両方なし → ダウンロードするモデルを選択後、使用モデルを選択

### 2. Google Gemini を使う場合

`.env.local` ファイルをプロジェクトルートに作成します。

```env
LLM_PROVIDER=gemini
GEMINI_API_KEY=your_api_key_here
GEMINI_MODEL=gemini-2.5-flash
```

---

## アプリの起動

アプリを動かすPCで `start-app.bat` を実行します。

```
start-app.bat
```

`.env.local` の設定を読み込んで `js/config.js` を生成し、`http://localhost:3000` でWebサーバーが立ち上がります。

### LLMサーバーとアプリを別PCで動かす場合

1. LLMサーバーPC: `start-llm.bat` を実行 → 完了画面に表示されたIPアドレスを控える
2. アプリPC: `start-app.bat` を実行 → UIの設定画面でOllamaのURLを `http://<LLMサーバーのIP>:11434` に変更

---

## 使い方

1. `http://localhost:3000` にブラウザでアクセス
2. サイドバーのLLMステータスが `Ready` になっていることを確認
3. （実機使用時）**Connect Cube** ボタンを押してtoioをBluetooth接続
4. チャットに話しかける

```
例:
「右に少し動いて」
「中央に移動して、赤く光りながらスピンして！」
「バッテリー残量を教えて」
「ドの音を鳴らして」
```

### 設定画面（⚙️ボタン）

| 設定項目 | 説明 |
|----------|------|
| LLMプロバイダー | Ollama / Gemini を切り替え |
| OllamaサーバーURL | デフォルト `http://localhost:11434` |
| Ollamaモデル | `gemma4:e4b` / `gemma4:26b` など |
| Gemini APIキー | Google AI Studio で取得 |
| Geminiモデル | `gemini-2.5-flash` など |
| セッション記憶クリア | 蓄積した記憶を初期化 |

---

## システム構成

```
index.html
js/
├── app.js              # UI・状態管理・イベントハンドリング
├── agent-loop.js       # エージェントループ（think→実行→評価→リトライ）
├── tool-executor.js    # ツール実行（並列実行対応）
├── tools-schema.js     # LLMに渡すツール定義（JSON Schema）
├── ollama-client.js    # Ollama REST APIクライアント
├── gemini-client.js    # Google Gemini APIクライアント
├── toio-ble.js         # Web Bluetooth APIラッパー
├── toio-sim.js         # ビジュアルシミュレーター
├── toio-combined.js    # BLE + シミュレーターの統合レイヤー
├── spatial-awareness.js# マット座標・安全範囲・移動目安の管理
├── environment.js      # キューブ状態のスナップショット提供
├── session-memory.js   # セッション間記憶（localStorage）
└── config.js           # start-app.bat が自動生成（git管理外）
```

### エージェントの動作フロー

```
ユーザー入力
    ↓
システムプロンプト組み立て
  ・行動ルール・few-shot examples
  ・マット空間情報（座標範囲・安全範囲・移動目安）
  ・前回セッションの記憶
    ↓
LLM（Ollama or Gemini）
  ← ツール定義（move_to / set_light / spin / play_sound 等）
  ← 現在のキューブ位置・向き
    ↓
think() で計画 → tool_calls を返す
    ↓
ToolExecutor で実行
  ・独立ツール（光・音）は並列実行
  ・move_to 等は逐次実行
    ↓
ローカルで到達判定（LLM不要）
  → 未到達なら warning を注入してリトライ
  → 完了ならループ終了
    ↓
セッション記憶に保存（次回起動時に引き継ぎ）
```

### 利用可能なツール

| ツール | 説明 |
|--------|------|
| `move_to` | 指定座標へ移動（回転→直進→向き調整の3ステップ） |
| `move_path` | 複数ウェイポイントを順番に移動 |
| `spin` | その場でスピン |
| `set_light` | LEDの色を設定 |
| `set_light_pattern` | アニメーション点灯パターンを再生 |
| `play_sound` | 単音を再生 |
| `play_melody` | メロディを再生（最大59音） |
| `stop` | 動作を即停止 |
| `wait` | 指定時間待機 |
| `get_position` | 現在位置・向き・マット端までの余裕を取得 |
| `get_battery` | バッテリー残量を取得 |
| `think` | LLMの内部思考（計画の明示化） |

---

## 🎤 音声合成機能 (Voice Synthesis)

toio-lab-web は Zundamon（ズンダモン）キャラクターの **日本語音声フィードバック** をサポートしています。

### 特徴

- **VOICEVOX 統合**: 高品質な日本語音声合成（別途インストール必須）
- **Web Speech API フォールバック**: VOICEVOX が利用不可時は自動的にブラウザのネイティブTTSに切り替え
- **自動ナレーション**: Claude が重要な応答を自動的に音声で出力
- **日本語対応**: 日本語での自然な会話と音声出力

### VOICEVOX セットアップ

VOICEVOX を使用する場合は別途インストールが必要です：

```bash
# Windows: https://voicevox.port.in.net/
# macOS/Linux: https://github.com/VOICEVOX/voicevox_engine

# インストール後、ポート 50021 で起動
voicevox_engine
```

詳細は [VOICEVOX_SETUP_GUIDE.md](VOICEVOX_SETUP_GUIDE.md) を参照してください。

---

## 🧪 テストスクリプト

### dev-server 接続テスト

```bash
# dev-server が起動しているか、WebSocket 接続が正常か確認
npm run dev &
node test-connection.js
```

**出力例:**
```
[test] Trying port 3000...
✅ Connected to port 3000!
[test] Sending test message: こんにちは
[response 1] type='ready'
[response 2] type='working'
[response 3] type='assistant' | text="こんにちは！ズンダモンです！..."
[response 4] type='result'

✅ Test completed successfully on port 3000!
```

### 音声合成テスト（ブラウザコンソール）

アプリを起動後、ブラウザコンソール (F12) で実行：

```javascript
// VOICEVOX 利用可能性確認
test_voicevoxStatus = async () => {
  const response = await fetch('http://localhost:50021/version');
  console.log('VOICEVOX:', response.ok ? '✅ 利用可能' : '❌ 利用不可');
};
test_voicevoxStatus();

// 直接音声合成テスト
test_directVoiceSynthesis = async () => {
  await window.bridge.executor.toio.speakText('テスト音声です', 'ja');
};
test_directVoiceSynthesis();
```

詳細は [VOICE_SYNTHESIS_TEST_GUIDE.md](VOICE_SYNTHESIS_TEST_GUIDE.md) を参照してください。

---

## 🔌 Claude Code 統合（実験機能）

このプロジェクトは **Claude Code** の MCP (Model Context Protocol) との統合をサポートしています。

### セットアップ

```bash
# Claude CLI がインストールされていることを確認
which claude

# dev-server を起動
npm run dev

# ブラウザで ?mcp=1 パラメータを付けてアクセス
http://localhost:3000/?mcp=1
```

### 機能

- **MCP Tool Bridge**: Claude がブラウザ経由で toio を制御
- **リアルタイムフィードバック**: tool 実行結果がすぐに Claude に返される
- **Zundamon キャラ統合**: Claude が Zundamon として自動的に音声ナレーション

詳細は [js/mcp-bridge.js](js/mcp-bridge.js) と [VOICE_SYNTHESIS_SYSTEM.md](VOICE_SYNTHESIS_SYSTEM.md) を参照してください。

---

## 🔧 トラブルシューティング

### 起動時に "Port XXXX is in use" と表示される

**原因**: TCP ポートが既に他のプロセスで使用中です。

**対策**:
1. **自動フォールバック（推奨）**: dev-server は自動的に次のポート（3001, 3002...）を試します。ターミナルログで最終的に使用されたポート番号を確認してください
2. **ポートを明示的に変更**: 
   ```bash
   PORT=4000 npm run dev
   ```
3. **既存プロセスを確認・終了**:
   ```bash
   # Windows
   netstat -ano | findstr :3000
   taskkill /PID <PID> /F
   
   # Mac/Linux
   lsof -i :3000
   kill -9 <PID>
   ```

### "Claude Code への接続に失敗" エラーが表示される

**原因**: Claude CLI がインストールされていないか、PATH に含まれていません。

**対策**:
1. Claude Code CLI をインストール:
   ```bash
   npm install -g @anthropic-ai/claude
   ```
2. PATH を確認:
   ```bash
   # Windows
   where claude
   
   # Mac/Linux
   which claude
   ```
   出力がない場合は、Claude Code CLI が正しくインストールされていません

3. ブラウザコンソール (F12) で詳細エラーを確認

### システムプロンプトが読み込まれない

**原因**: `prompts/claude-code-system.txt` ファイルが見つかりません。

**対策**:
1. ファイルが存在するか確認:
   ```bash
   ls -la prompts/claude-code-system.txt
   ```

2. カスタムプロンプトを使用する場合:
   ```bash
   CLAUDE_SYSTEM_PROMPT_FILE=path/to/custom-prompt.txt npm run dev
   ```

3. ファイルが見つからない場合、dev-server は自動的に埋め込み prompts を使用します（警告メッセージが表示されます）

### WebSocket 接続がタイムアウトする

**原因**: ネットワーク設定またはファイアウォールの問題です。

**対策**:
1. ブラウザコンソール (F12) で WebSocket URL を確認:
   ```javascript
   console.log(window.claudeClient);
   ```

2. ファイアウォール設定を確認（Port 3000 が開いているか）

3. 別ブラウザでテスト

---

## 🌐 環境変数リファレンス

`.env.local` ファイルで以下の環境変数を設定できます。設定テンプレートは [.env.example](.env.example) を参照してください。

### Claude Code Mode

| 環境変数 | デフォルト | 説明 |
|---------|-----------|------|
| `PORT` | `3000` | HTTP サーバーのポート番号。使用中の場合は自動的に次のポートを試します |
| `CLAUDE_MODEL` | `claude-haiku-4-5-20251001` | Claude モデル。例: `claude-3-5-sonnet`, `claude-opus-4-7` |
| `CLAUDE_SYSTEM_PROMPT_FILE` | `prompts/claude-code-system.txt` | システムプロンプトのファイルパス。カスタムプロンプト使用時に指定 |
| `CLAUDE_MCP_AUTO_APPROVE` | `true` | MCP ツール呼び出しの自動承認。開発時は `true`、本番環境では `false` |

### LLM Provider

| 環境変数 | 説明 |
|---------|------|
| `LLM_PROVIDER` | `claude-code`, `ollama`, または `gemini` を選択 |

### Ollama Settings (LLM_PROVIDER=ollama)

| 環境変数 | デフォルト | 説明 |
|---------|-----------|------|
| `OLLAMA_URL` | `http://localhost:11434` | Ollama API エンドポイント |
| `OLLAMA_MODEL` | `gemma4:e4b` | 使用する Ollama モデル |

### Google Gemini Settings (LLM_PROVIDER=gemini)

| 環境変数 | 説明 |
|---------|------|
| `GEMINI_API_KEY` | Google Gemini API キー（[Google AI Studio](https://makersuite.google.com/app/apikey) から取得） |
| `GEMINI_MODEL` | Gemini モデル。デフォルト: `gemini-2.5-flash` |

### その他

| 環境変数 | デフォルト | 説明 |
|---------|-----------|------|
| `CAMERA_URL` | （未設定） | ESP32S3 カメラストリーム URL （オプション） |

### 環境変数の設定方法

#### 方法 1: `.env.local` ファイル（推奨）

プロジェクトルートに `.env.local` を作成:
```env
PORT=3000
CLAUDE_MODEL=claude-haiku-4-5-20251001
LLM_PROVIDER=claude-code
```

#### 方法 2: シェルで直接設定

```bash
# Windows (PowerShell)
$env:PORT="3000"; npm run dev

# Mac/Linux
PORT=3000 npm run dev
```

#### 方法 3: .env.example をコピー

```bash
cp .env.example .env.local
# エディタで編集
```

---

## 📚 追加ドキュメント

| ドキュメント | 説明 |
|------------|------|
| [VOICE_SYNTHESIS_INDEX.md](VOICE_SYNTHESIS_INDEX.md) | 音声合成システムのナビゲーションガイド |
| [VOICE_SYNTHESIS_SYSTEM.md](VOICE_SYNTHESIS_SYSTEM.md) | アーキテクチャ・実装詳細 |
| [VOICE_SYNTHESIS_EXAMPLES.md](VOICE_SYNTHESIS_EXAMPLES.md) | コード例・統合パターン |
| [VOICE_SYNTHESIS_TEST_GUIDE.md](VOICE_SYNTHESIS_TEST_GUIDE.md) | テスト手順・デバッグ方法 |
| [VOICEVOX_SETUP_GUIDE.md](VOICEVOX_SETUP_GUIDE.md) | VOICEVOX インストール・設定 |
| [USER_EXPERIENCE_FLOW.md](USER_EXPERIENCE_FLOW.md) | ユーザー操作フロー・UX設計 |

---
