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
