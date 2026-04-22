---
trigger: model_decision
description: toio の Web Bluetooth 通信・GATT 操作に関する実装ルール
---

# toio / Web Bluetooth 実装ルール

## 接続・切断

1. **接続前チェック**: 任意の操作前に `this.isConnected` を検証し、未接続時は明示的なエラーを投げる（黙って失敗させない）。
2. **`gattserverdisconnected` 監視**: 切断イベントは必ずリスナーを張る。`navigator.bluetooth.requestDevice` の返値 `device` に対して `device.addEventListener('gattserverdisconnected', ...)` で登録（Chrome の [Automatic Reconnect サンプル](https://googlechrome.github.io/samples/web-bluetooth/automatic-reconnect.html) 準拠）。
3. **再接続は指数バックオフ**: 自動再接続を行う場合は `exponentialBackoff(maxRetries, initialDelay, fn)` パターンで実装。ユーザーに「再接続中」UI を示し、失敗時は停止してマニュアル再接続ボタンを提示。
4. **再接続後は characteristic を取り直す**: 切断で GATT 属性（service / characteristic）は **invalidate される**。再接続後は `getPrimaryService` → `getCharacteristic` をやり直し、古い参照を使わない。
5. **ハンドラの対称登録**: `addEventListener` と `removeEventListener` で同じ bound 関数参照を使う（`this._boundHandle* = this._handle*.bind(this)` パターンを踏襲）。無名アロー関数を直接渡さない。

## 書き込み（Write）

1. **書き込みはキューで直列化**: `writeValueWithoutResponse` / `writeValue` の並列実行は "GATT operation already in progress" エラーになる（[WebBluetoothCG/web-bluetooth #188](https://github.com/WebBluetoothCG/web-bluetooth/issues/188)）。`_writeQueue = _writeQueue.then(fn).catch(...)` の Promise チェーンで直列化する（[toio-ble.js:71](../../js/toio-ble.js#L71) の `_enqueueWrite` を踏襲）。
2. **失敗してもキューを止めない**: `catch` で握りつぶしつつ呼び出し元には throw する「二股」パターンを維持する（既存実装）。
3. **write 後のディレイ**: toio 公式仕様には明示的な最小間隔は定義されていないが、モーター速度通知は 100ms 間隔で配信される。連続コマンドを投げる場合は **50ms 程度のディレイ** を `await new Promise(r => setTimeout(r, 50))` で挟む。

## 通知（Notify）・状態更新

1. **高頻度通知はスロットル**: position id 通知など高頻度なイベントは `_positionUpdateThrottleMs`（既存 50ms）でスロットル。毎通知で UI 更新しない。
2. **デッドバンドでノイズ除去**: 座標・角度の微小変動は `_positionDeadbandMm` / `_angleDeadbandDeg` でフィルタし、意味のある変化のみ伝播させる（既存実装）。

## セキュリティ・環境

1. **HTTPS / localhost 必須**: Web Bluetooth は secure context でのみ動作。`dev-server.js` のポート 3000 は `localhost` 扱いで OK だが、LAN 越しに触る場合は HTTPS 化が必要。
2. **Permissions Policy**: iframe 埋め込み時は `allow="bluetooth"` が必要（デフォルト allowlist は `self`）。
3. **実機検証は自動化不可**: `requestDevice` のペアリングダイアログは Playwright を通せない。BLE を伴う検証は手動テストをユーザーに依頼する（CLAUDE.md の自動テスト運用に準拠）。

## 参考

- [toio™ Core Cube 技術仕様](https://toio.github.io/toio-spec/en/) — プロトコルの一次情報
- [MDN: Web Bluetooth API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Bluetooth_API)
- [Chrome Web Bluetooth Samples](https://googlechrome.github.io/samples/web-bluetooth/)
