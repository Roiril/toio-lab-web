---
description: BLE接続・通信の問題をデバッグする際に参照するスキル
---

# BLEデバッグ手順

## 1. 接続確認

1. ブラウザの DevTools → Application → Bluetooth で接続状態を確認
2. `toio-ble.js` の `isConnected` プロパティをコンソールから確認:
   ```js
   console.log(toioBLE.isConnected);
   ```

## 2. GATT プロファイル確認

toio のサービス/キャラクタリスティック UUID:
- **Service**: `10b20100-5b3b-4571-9508-cf3efcd7bbae`
- **Motor**: `10b20102-5b3b-4571-9508-cf3efcd7bbae`
- **Light**: `10b20103-5b3b-4571-9508-cf3efcd7bbae`
- **Sound**: `10b20104-5b3b-4571-9508-cf3efcd7bbae`
- **ID Sensor**: `10b20101-5b3b-4571-9508-cf3efcd7bbae`

## 3. コマンド送信テスト

DevTools Console からモーター直接制御:
```js
// 前進テスト (左右モーター速度50, 1秒)
const motor = toioBLE.characteristics?.motor;
if (motor) {
  motor.writeValueWithoutResponse(
    new Uint8Array([0x02, 0x01, 0x01, 50, 0x02, 0x01, 50, 100])
  );
}
```

## 4. よくある原因

| 症状 | 原因 | 対処 |
|---|---|---|
| 接続直後に切れる | デバイス参照がGCされた | 参照をクラスプロパティに保持 |
| コマンドが効かない | Characteristic未取得 | `getPrimaryService` → `getCharacteristic` を確認 |
| ペアリングダイアログが出ない | `optionalServices` 未指定 | `requestDevice` の options 確認 |
| writeエラー | BLE未接続中に送信 | `isConnected` ガード追加 |
