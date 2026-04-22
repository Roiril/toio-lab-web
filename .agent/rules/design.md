# UI デザイン規約

toio Lab Web の視覚言語。VSCode 相当のフラット・ミニマル設計。UI/CSS を変更する前に必ず読むこと。

## 原則

1. **フラット** — 半透明・`backdrop-filter`・グラデーション・glow を使わない
2. **ニュートラル** — グレースケール基調 + アクセント1色
3. **直線主義** — 角丸は限定要素のみ。既定は矩形（`border-radius: 0`）
4. **最小装飾** — 影・発光・パルスを避け、色と余白と 1px border で情報を表現
5. **VSCode 相当の情報密度** — 小さめフォント（13px 基準）、タイトな余白

## カラーパレット

`css/style.css` の `:root` で一元管理。直接 `#rrggbb` を書かない。

| 変数 | 値 | 用途 |
|---|---|---|
| `--bg` | `#1e1e1e` | アプリ背景（エディタ相当） |
| `--bg-sidebar` | `#252526` | サイドバー・モーダル・ヘッダー |
| `--bg-raised` | `#2d2d30` | セカンダリボタン・cube-info・ホバー時 |
| `--bg-input` | `#3c3c3c` | input/select/textarea |
| `--border` | `#3c3c3c` | パネル分割線・既定の枠線 |
| `--border-strong` | `#505050` | 強調枠・hover 時の枠線 |
| `--text` | `#cccccc` | 本文 |
| `--text-muted` | `#858585` | ラベル・セカンダリ情報 |
| `--accent` | `#0e639c` | プライマリボタン・フォーカス枠 |
| `--accent-hover` | `#1177bb` | プライマリボタン hover |
| `--danger` | `#f48771` | 切断・エラー表示 |
| `--ok` | `#4ec9b0` | 接続・成功表示 |

### カラー使用ルール

- `--accent` はインタラクティブ要素のアクティブ状態のみ。装飾に使わない
- `--ok` / `--danger` はステータス表示限定（接続 LED、エラー文字等）
- hover は background の明度変化、focus は border 色変化で表現
- 複数アクセント（cyan/pink/green 併用等）禁止

## タイポグラフィ

- 本文/UI: `Inter`, **13px**
- パネル見出し（`.control-section h2` 等）: **11px**, `uppercase`, `letter-spacing: 1px`, `--text-muted`, `weight: 600`
- モーダル見出し (`h2`): **14px**, weight 600
- アプリタイトル (`h1`): **13px**, weight 500（装飾しない）
- 小さいラベル (`small`, form label): **11-12px**, `--text-muted`
- モノスペース: `JetBrains Mono` は **コードブロック・`.tool-call-block`・`.message.system`** のみ

## 角丸ルール

| 要素 | 角丸 | 理由 |
|---|---|---|
| `.message-content` | 12px (対応コーナー 4px) | チャットバブルの慣用表現 |
| `.dot`（ステータス LED） | 50% | 丸は「状態」の記号 |
| `.color-btn`（色選択） | 50% | カラースウォッチの慣用 |
| `.sim-cube` | 4px | toio 物理キューブ形状の模倣 |
| **上記以外すべて** | **0** | パネル・ボタン・入力・モーダル・シミュレータマット・プレビュー枠等 |

新要素を追加する際、上記リストに該当しなければ必ず `border-radius: 0`。

## ボタン

| クラス | 見た目 |
|---|---|
| `.primary-btn` | `--accent` 塗り・白文字・矩形・padding `6px 14px`・font 13px |
| `.secondary-btn` | `--bg-raised` + `1px solid --border`・`--text` |
| `.icon-btn` | 透明・`--text-muted`、hover で `--bg-raised` + `--text` |

hover: background 明度を 1 段上げる。transform・scale は使わない。

## フォーム

- `input` / `select` / `textarea`: `--bg-input` + `1px solid --border`・矩形・`6-10px` padding
- focus: `border-color: --accent`（glow 禁止）
- ラベル: 12px uppercase・`letter-spacing: 0.5px`・`--text-muted`
- `<select>` は CSS で完結させる（インライン style 禁止）

## パネル・セクション

- 背景: `--bg-sidebar`
- 枠: `1px solid --border` または `border-right` / `border-bottom` で分割
- 角丸 0、影なし、`backdrop-filter` なし
- セクション間は `border-bottom: 1px solid --border` で区切る（余白だけで区切らない）

## アニメーション

- **許可**: 出現用 `fadeIn`（0.2s 以内、transform は translateY 4px 程度）、`transition: background-color 0.1s` / `border-color 0.1s`
- **禁止**: `box-shadow` の glow パルス、浮遊アニメ、回転、cubic-bezier のスプリング、`scale`/`translateY` によるホバー飛び出し

## 禁止事項（まとめ）

- `linear-gradient` を UI 装飾に使う（マット背景の grid 線など機能的用途は可）
- `-webkit-background-clip: text` + `-webkit-text-fill-color: transparent` でのグラデ文字
- `backdrop-filter`
- `box-shadow` を使った発光・浮き出し
- 複数アクセント色の併用
- 角丸を例外リスト外の要素に付ける
- インライン style でフォームの見た目を上書き

## 新規 UI 追加時のチェックリスト

1. [ ] 要素は角丸例外リストにあるか? なければ `border-radius: 0`
2. [ ] 色はパレット変数 (`var(--...)`) を使っているか?（直接 `#rrggbb` 禁止）
3. [ ] 影・glow・独自アニメを追加していないか?
4. [ ] フォントサイズは 10 / 11 / 12 / 13 / 14px のどれか?
5. [ ] border は `var(--border)` / `var(--border-strong)` を使っているか?
6. [ ] hover 効果は色・背景の変化のみか?（transform/scale 禁止）
7. [ ] ボタンは `.primary-btn` / `.secondary-btn` / `.icon-btn` のどれかに揃えたか?
