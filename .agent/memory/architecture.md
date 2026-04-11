# プロジェクトアーキテクチャ

> このファイルは全エージェント共通の参照用です。構造変更時に更新してください。

## スタック

| レイヤー | 技術 |
|---|---|
| フロントエンド | Vanilla HTML/CSS/JS（ビルドツール不要） |
| LLM | Ollama (gemma4:4b-it) — ローカル実行 |
| ハードウェア | toio コアキューブ — Web Bluetooth API |
| シミュレーション | Canvas 2D ベースの toio-sim.js |

## ファイル構成

toio-lab-web/
├── index.html              # エントリポイント
├── css/style.css           # Glassmorphism ベースの統一スタイル
├── js/
│   ├── app.js              # UI・状態管理・イベントバインディング
│   ├── agent-loop.js       # 自律的 Evaluate-Act-Observe ループ ★
│   ├── environment.js      # キューブと空間の状態統合 ★
│   ├── spatial-awareness.js # 車両感覚（距離・サイズのメタデータ） ★
│   ├── session-memory.js   # 長期コンテキスト（会話要約・永続化） ★
│   ├── ollama-client.js    # Ollama REST API クライアント
│   ├── toio-ble.js         # Web Bluetooth API ラッパー（物理キューブ）
│   ├── toio-sim.js         # ブラウザ内シミュレータ（Canvas 2D）
│   ├── tools-schema.js     # Gemma4 向け Tool 定義（JSON Schema）
│   └── tool-executor.js    # ToolCall → BLE/Sim 結合レイヤー
├── start.ps1               # Ollama 自動起動スクリプト (Windows)
├── start.bat               # start.ps1 のラッパー
└── .agent/                 # AIエージェントハーネス
```

## データフロー

```
ユーザー入力 (チャット)
    ↓
app.js (UI)
    ↓
┌─────────────────────────────────────────────────┐
│            AgentLoop (agent-loop.js)              │
│  ┌──────────┐    ┌──────────┐    ┌─────────┐     │
│  │ Evaluate  │───→│  Decide  │───→│   Act   │     │
│  │(LLM + Env │    │(tool_calls│    │(Execute)│     │
│  │ + Spatial) │    │  or done) │    └────┬────┘     │
│  └─────↑────┘    └──────────┘         │           │
│        │                              ↓           │
│        │         ┌──────────┐   ┌──────────┐      │
│        └─────────│  Observe │←──│ Results + │      │
│                  │(+ Env+Sp)│   │ Env State │      │
│                  └──────────┘   └──────────┘      │
└─────────────────────────────────────────────────────┘
         ↓                    ↓
    ┌──────────┐        ┌──────────┐
    │ Ollama   │        │ Tool     │
    │ Client   │        │ Executor │
    └──────────┘        └─────┬────┘
                              ↓
                  ┌───────────┴───────────┐
                  │ toio-ble  │ toio-sim  │
                  └───────────┴───────────┘
```

## 起動方法

```bash
# Windows: Ollama自動起動 + ローカルサーバー
.\start.ps1

# 手動
npx serve .
```

## 設計原則

- **ビルドレス**: バンドラー・トランスパイラ不使用。`<script>` 直接読み込み
- **Glassmorphism UI**: CSS変数 (`--accent-cyan` 等) と `glass-panel` クラスで統一
- **マルチキャスト制御**: コマンドはシミュレータと物理キューブの両方に送信
