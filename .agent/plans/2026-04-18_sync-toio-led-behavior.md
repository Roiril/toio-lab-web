# toio LED 挙動の同期と不具合修正計画

シミュレーターと実機の間で生じている LED 点灯の挙動不一致を解消し、より正確なフィードバックを提供するための修正を行います。

## 背景
- **シミュレーター**: `setLight` で点灯後、消灯する処理が欠落しているため、時間が経過しても光り続けてしまう。
- **実機**: 点灯時間が極端に短い場合に計算誤差で `0`（無限点灯）として解釈される可能性や、短いパルスが視認しにくい問題への対応。

## 変更内容

### [toio-sim.js](file:///c:/Users/kouga/Documents/GitHub/toio-lab-web/js/toio-sim.js)
- `_lightTimeoutId` を保持するようにし、`setLight` 実行時に以前のタイマーをクリアしてから新しいタイマーをセットする。
- `durationMs > 0` の場合、その時間経過後に `style` をリセット（消灯）する。
- `setLightPattern` でも再生終了時に消灯するよう調整。

### [toio-ble.js](file:///c:/Users/kouga/Documents/GitHub/toio-lab-web/js/toio-ble.js)
- `setLight` における `dur` の計算で、`durationMs > 0` の場合に `Math.max(1, ...)` を使用し、意図せぬ無限点灯（0）を防止する。
- `setLightPattern` の各フレームの duration についても同様に最小値を確保する。

## 検証計画
### 手動検証
- シミュレーター上で `set_light` を実行し、指定された秒数後に色が消えることを確認。
- 実機で短い点灯（10msなど）を指示し、正常に点灯・消灯することを確認。
