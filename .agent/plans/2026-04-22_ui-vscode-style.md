# UI を VSCode ライクなシンプル設計に刷新

- **作成日**: 2026-04-22
- **ステータス**: in-progress
- **対象ファイル**: `css/style.css`, `index.html`

## 目的

現状の UI は glassmorphism + cyan/pink グラデーション + 全面角丸 + glow アニメで「ノーコードツール感」が強い。VSCode ライクなフラット・ニュートラル・最小装飾のデザインに刷新する。

## 方針

1. **フラット**: 半透明・backdrop-filter・グラデーション・box-shadow の glow を全廃
2. **ニュートラル**: グレースケール基調 + アクセント1色（VSCode blue `#0e639c`）
3. **直線主義**: 角丸は **チャットメッセージバブル** (`.message-content`) のみ。パネル・ボタン・入力・モーダル・シミュレータは矩形
4. **1px ボーダー**: 領域分けは薄い border で（VSCode 分割線と同じ）

## カラーパレット（VSCode Dark+ 準拠）

```
--bg:           #1e1e1e
--bg-sidebar:   #252526
--bg-input:     #3c3c3c
--border:       #3c3c3c
--text:         #cccccc
--text-muted:   #858585
--accent:       #0e639c
--accent-hover: #1177bb
--danger:       #f48771
--ok:           #4ec9b0
```

フォント: Inter 単体。JetBrains Mono は `.tool-call-block` と `.message.system` のみ残す。

## 変更詳細

### HTML (`index.html`)

- `<div class="bg-shape shape-1"></div>` / `shape-2` を削除
- `<select id="llm-provider">` のインライン style（`color:#000` 等）を削除し、CSS 側でダーク対応

### CSS (`css/style.css`) — 主要差し替え

#### ルート変数
- cyan/pink/green の3系統を廃止し、上記パレットに統一
- メッセージ色（`--message-user-bg` 等）も再定義：user は accent 薄色、ai は border グレー、system は透明 + 左 border

#### 廃止
- `.bg-shape`, `.shape-1`, `.shape-2`, `@keyframes float`
- `.glass-panel` の `backdrop-filter`, `box-shadow`, `border-radius: 16px`
- `h1` の `linear-gradient` + `-webkit-text-fill-color: transparent`
- すべての `box-shadow: 0 0 Npx ...`（glow）
- `@keyframes ghostPulse`, `thinkingPulse`, `cubePulse`（keyframes 自体を削除、呼び出しも除去）

#### 角丸ルール

| セレクタ | border-radius |
|---|---|
| `.glass-panel`, `header`, `.sidebar`, `.chat-area`, `.modal-content` | 0 |
| `.primary-btn`, `.secondary-btn`, `.action-btn`, `.icon-btn`, `.camera-capture-btn`, `.send-btn`, `.stop-btn` | 0 |
| `.chat-input-container`, `#chat-input`, `.form-group input`, `select` | 0 |
| `.simulation-mat`, `.camera-preview-box`, `.cube-info`, `.tool-call-block` | 0 |
| **`.message-content`**（user/ai/system） | **12px のまま** |
| `.dot` (ステータスLED) | 50% のまま（機能的） |
| `.color-btn` | 50% のまま（機能的） |
| `.sim-cube` | 4px のまま（物理キューブ形状） |

#### 背景・枠

- `body` 背景: `#1e1e1e`
- `.glass-panel`: `background: #252526; border: 1px solid #3c3c3c; border-radius: 0; box-shadow: none; backdrop-filter: none;`
- `header` は下 border のみで視覚分離

#### 入力欄（チャット）

- 現状ピル型 24px → フラット矩形
- `border: 1px solid var(--border); background: var(--bg-input); border-radius: 0`
- フォーカス時: `border-color: var(--accent)` の色変化のみ（glow なし）
- 送信/停止/カメラボタンも矩形、hover は background 明度のみ

#### シミュレータ

- `.simulation-mat`: 角丸 0、枠線 `1px solid var(--border)`、白背景は維持（toio マット物理色）
- `.sim-cube`: 4px 角丸維持
- `.sim-cube.ghost`: glow と pulse 削除、`border: 1px dashed var(--text-muted); opacity: 0.5`

#### モーダル

- overlay: `rgba(0,0,0,0.6)`
- `.modal-content`: 単色 `#252526`、角丸0、1px border
- `<select>` を CSS でダーク化：`background: var(--bg-input); color: var(--text); border: 1px solid var(--border); border-radius: 0`

## 実施順序

1. 本計画ファイル作成（本コミット）
2. `css/style.css` 全面書き換え
3. `index.html` 微修正（bg-shape 削除、select style 削除）
4. dev-server をバックグラウンド起動
5. Playwright MCP で `localhost:3000` を開いて視覚確認 + コンソールエラーチェック
6. 問題なければコミット（`refactor：UI を VSCode ライクなフラット設計に刷新`）

## 検証項目

- [ ] 背景の浮遊円が消えていること
- [ ] 全パネル・ボタンが矩形になっていること
- [ ] チャットメッセージバブルのみ角丸が残っていること
- [ ] cyan/pink のグラデ文字が消えていること
- [ ] glow / pulse アニメが残っていないこと
- [ ] コンソールエラーが出ていないこと
- [ ] 実機 BLE 経路は未検証（手動確認依頼）
