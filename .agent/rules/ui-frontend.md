---
trigger: model_decision
description: UI / DOM / Canvas / セキュリティに関する実装ルール
---

# UI / フロントエンド実装ルール

## DOM / スタイル

1. **スタイリング**: 既存の CSS 変数（`var(--accent-cyan)` 等）と `glass-panel` クラスを再利用し、デザインの統一性を保つ。
2. **イベントリスナーの多重登録を防ぐ**: 初期化関数内で一括登録し、再入しても重複しない設計にする。動的要素には event delegation（親要素でイベント監視）を優先。
3. **Bound handler の参照を保持**: `removeEventListener` と対になる場合、`this._boundFoo = this.foo.bind(this)` のように同一参照を再利用する。

## セキュリティ（XSS / CSP）

1. **ユーザー入力・LLM 出力は必ずサニタイズ**:
   - **プレーンテキストとして挿入する場合**: `textContent` または `escapeHTML` 経由でセット（`innerHTML` 直接代入は禁止）。
   - **HTML（Markdown レンダリング結果など）として挿入する場合**: [DOMPurify](https://github.com/cure53/DOMPurify) を通す。OWASP もブラウザ側の HTML サニタイズとして推奨（regex ベースの単純エスケープは obfuscated payload をすり抜ける）。現状の `escapeHTML` はプレーンテキスト用途では十分だが、LLM 出力を HTML としてレンダリングする場面を増やす場合は DOMPurify 導入を検討する。
2. **`.env` / API キーの扱い**: ソースに直書きしない。`js/config.js` は `start-app.bat` が生成する中間ファイルなので手動編集禁止（`.gitignore` 確認）。
3. **Content Security Policy**: 外部 CDN からのスクリプトを追加する場合は `script-src` を明示的に許可。`unsafe-inline` / `unsafe-eval` は避ける。

## Canvas 2D（toio-sim.js 系）

1. **アニメーションは `requestAnimationFrame`**: `setInterval` / `setTimeout` でのフレーム駆動は使わない。バックグラウンドタブで自動停止する利点も享受できる。
2. **差分再描画**: 毎フレーム全面 `clearRect` せず、変化した矩形のみを clear & redraw する（[MDN Optimizing canvas](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas)）。大きなシミュレーション規模になった場合は OffscreenCanvas + Web Worker も検討。
3. **論理座標と描画座標を分離**: 物理キューブ座標系（mm 単位）と Canvas px 座標系を混ぜない。描画直前に変換関数を通す。

## アクセシビリティ

1. **キーボード操作**: クリック可能要素は `button` またはフォーカス可能な要素を使い、`Enter` / `Space` で発火できるようにする。
2. **aria-live**: 非同期で変わるステータス表示（接続状態・エラーなど）には `aria-live="polite"` を付け、スクリーンリーダーに通知する。
3. **配色コントラスト**: Glassmorphism は背景依存でコントラストが落ちやすい。主要テキストは WCAG AA（4.5:1）を満たす色を採用。

## 参考

- [MDN: Optimizing canvas](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas)
- [OWASP XSS Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html)
- [DOMPurify](https://github.com/cure53/DOMPurify)
