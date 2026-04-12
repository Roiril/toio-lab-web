# 実機のtoioゴースト表示の実装計画

実機が接続されている際、その現在位置をシミュレータ上に半透明の「ゴースト」として表示し、実機とシミュレータの同期状態を視覚化します。

## ユーザーレビューが必要な事項

> [!NOTE]
> ゴーストは実機のBLEから送られてくる座標をそのまま反映するため、シミュレータ上のキューブ（目標位置または理論位置）とは独立して動きます。

## 変更計画

### HTML / CSS

#### [MODIFY] [index.html](file:///c:/Users/kouga/Projects/Web/toio-lab-web/index.html)
- `#simulation-mat` 内に `<div id="ghost-cube" class="sim-cube ghost" style="display: none;">REAL</div>` を追加します。

#### [MODIFY] [style.css](file:///c:/Users/kouga/Projects/Web/toio-lab-web/css/style.css)
- `.sim-cube.ghost` クラスを定義します。
- `opacity: 0.5;`
- `background: rgba(0, 212, 255, 0.2);`
- `border: 2px solid var(--accent-cyan);`
- `z-index: 5;` (通常のキューブより下に配置、または重なりを許容)
- `pointer-events: none;`
- 実機感を出すためのパルスアニメーションを追加します。

### JavaScript

#### [MODIFY] [app.js](file:///c:/Users/kouga/Projects/Web/toio-lab-web/js/app.js)
- `toioBle.onIdUpdateCallback` を設定し、受信した座標 `(x, y, angle)` を `toioSim.matToSim()` を使ってシミュレータ座標に変換します。
- `ghost-cube` の `left`, `top`, `transform` を更新します。
- `updateToioUIState()` 内で、BLE接続時はゴーストを表示、切断時は非表示にする処理を追加します。

## 検証プラン

### 手動確認
- シミュレータを起動し、BLEで実機を接続する。
- 実機を手で動かした際、シミュレータ上のゴーストが追従することを確認する。
- 切断時にゴーストが消えることを確認する。
- ゴーストとシミュレータキューブが重なった際の見え方に問題がないか確認する。
