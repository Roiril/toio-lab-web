---
status: in-progress
description: マット端のセンサー読み取り不良を防ぐための安全な移動範囲の実装
---

# 目的
toioキューブをマットの端ギリギリまで移動させると、底面のセンサーがIDを読み取れなくなる問題を解決します。マット境界からキューブの幅を考慮した「安全な移動範囲（マージン）」を定義し、エージェントがその範囲外へ誤って移動指示を出した場合でも、実行時に安全範囲内にクランプ（制限）されるようにします。

## 変更内容

### 1. `js/spatial-awareness.js`
- `this.mat` 設定に `safeMargin` （20単位。物理サイズで約27mm）を追加。
- 座標を安全範囲内に制限する `clampToSafeRange(x, y)` メソッドを実装。
- LLMへの事前知識として渡す `getStaticGuide()` を更新し、「移動可能な安全範囲」を伝達するように修正。

### 2. `js/tool-executor.js`
- `executeAll` 内の `move_to` ツールの処理において、要求された `args.x` と `args.y` を `this.env.spatial.clampToSafeRange(args.x, args.y)` を使って安全範囲に制限してからキューブに送信するよう実装。
