# 2026-04-12 toio座標同期と角度定義の修正

シミュレーション上のtoioと実機の位置がずれる問題を修正します。主な原因は同期ループにおける座標の二重変換と、シミュレーションと実機間での角度（向き）の定義の不一致です。

## ユーザーレビューが必要な項目

> [!IMPORTANT]
> **角度の定義変更**: シミュレーションの「0度 = 上」を、toioの標準仕様である「0度 = 右」に変更します。これにより、ツール呼び出し時の角度指定の挙動が変わりますが、実機との整合性が取れるようになります。

## 変更内容

---

### [UI/Styling]

#### [MODIFY] [style.css](file:///c:/Users/kouga/Projects/Web/toio-lab-web/css/style.css)
- `.simulation-mat` の `aspect-ratio` を `7 / 5` から `304 / 216` に変更。
- 背景グリッドの `background-size` を調整。

---

### [Simulation Logic]

#### [MODIFY] [toio-sim.js](file:///c:/Users/kouga/Projects/Web/toio-lab-web/js/toio-sim.js)
- 角度系を「0度=右、90度=下」に変更。
- `_update` メソッド内の移動計算ロジック（`rad` の算出）を修正。
- レンダリング時の `rotate` を調整（CSSは0度で上向き、toioは0度で右向きのため）。

---

### [App Control]

#### [MODIFY] [app.js](file:///c:/Users/kouga/Projects/Web/toio-lab-web/js/app.js)
- 同期ループ内の座標二重変換を削除。
- 角度の不一致を考慮した同期処理の追加。

## 検証計画

### 手動検証
- ブラウザをリロードし、実機と接続した際の初期位置が重なることを確認。
- チャット指示で、シミュレーションと実機が同じ方向に移動することを確認。
- 角度の整合性を確認。
