# toio playSound コマンドの修正計画

toio Core Cube において音を鳴らすコマンド (`0x03`) のバイナリデータ構造が誤っていたため、音が鳴らない場合がある問題を修正します。

## 背景
toio のサウンド再生コマンド（MIDIノート番号指定）は、バイト列の3番目に「オペレーション（音符）の数」を指定する必要があります。現状のコードではこの1バイトが欠落しており、後続のデータがズレて解釈されていました。

## 変更内容

### [toio-ble.js](file:///c:/Users/kouga/Documents/GitHub/toio-lab-web/js/toio-ble.js)

#### [MODIFY] playSound メソッド
- `Uint8Array` の生成時に、オペレーション数を示す `0x01` を挿入します。

```javascript
// 修正前
const buf = new Uint8Array([0x03, 0x01, dur, noteId, 0xff]);

// 修正後
const buf = new Uint8Array([0x03, 0x01, 0x01, dur, noteId, 0xff]);
```

## 検証計画
### 手動検証
- 実機（toio Core Cube）を接続し、AIとの会話を通じて `playsound` ツールを実行させ、音が鳴ることを確認します。
- ブラウザのコンソールで `toio.playSound()` を直接呼び出し、エラーが出ないこととパケットが送信されることを確認します。
