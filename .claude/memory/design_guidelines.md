---
name: design_guidelines
description: UI/CSS 変更の前に .agent/rules/design.md を必ず参照する。VSCode ライクなフラット・ミニマル設計
type: feedback
originSessionId: 7f1cb632-d104-4310-8835-57bb9402ce3e
---
UI / CSS を変更する作業（`css/style.css`, `index.html` のレイアウト・見た目、新規 UI 要素の追加等）に着手する前に必ず [.agent/rules/design.md](../../.agent/rules/design.md) を読むこと。

**Why:** 2026-04-22 に glassmorphism + cyan/pink グラデ + 全面角丸の「ノーコードツール感」を払拭して VSCode 相当のフラット設計に刷新した。規約を参照せず UI を足すと、glow・角丸・複数アクセント色が混入して一貫性が崩れる（ユーザーはそれを強く嫌う）。

**How to apply:**
- CSS の見た目に関わる変更、新しい UI コンポーネントの追加、モーダル・フォーム要素の調整、その他視覚的な差分を含む作業は、最初に `.agent/rules/design.md` を開いてから設計する
- 特に注意: 角丸はチャットバブル・ステータス LED・色選択・sim-cube 以外ゼロ。影・glow・グラデーション・backdrop-filter・複数アクセントは全禁止。色は CSS 変数経由で直接 `#rrggbb` を書かない
- バグ修正や挙動修正で見た目に影響しない場合は参照不要
