# toio移動の同期化とタスク論理パスの統合計画

toioの移動ツール (`move_to`) を「到着を待つ」同期的な動作に変更し、エージェントが「移動 ＋ 目的地での動作」を1つの論理的なタスクとして扱えるようにリファクタリングします。

## User Review Required

> [!IMPORTANT]
> - `move_to` ツールが「到着するまで待機」するようになるため、エージェントの思考ループが1つのタスクに費やす時間が長くなります。
> - 物理的な toio が障害物などでスタックした場合、タイムアウト（約10秒程度を想定）で次へ進むようにします。
> - シミュレーターでもテレポートではなく、移動時間を模擬した遅延を入れることで、物理環境との挙動の乖離を防ぎます。

## Proposed Changes

### 1. Bluetooth通信レイヤー (Core Connection)

#### [MODIFY] [toio-ble.js](file:///c:/Users/kouga/Projects/Web/toio-lab-web/js/toio-ble.js)
- **モーター通知の有効化**: `connect()` 時に `MOTOR_CHAR_UUID` の `startNotifications` を呼び出し、移動結果のレスポンスを受け取れるようにします。
- **移動レスポンスの処理**: `_handleMotorUpdate(event)` ハンドラを追加し、コマンド `0x83`（目標指定移動の応答）を解析します。
- **`moveTo(x, y, angle)` のプロミス化**:
  - 呼び出し時に `Promise` を作成し、クラス内の `this._pendingMove` に保存します。
  - モーター通知で「完了 (0x00)」が届いたら `resolve()` します。
  - 10秒のセーフティ・タイムアウトを設け、通知が届かない場合でもループを継続させます。

### 2. エージェント・ループ (Reasoning Layer)

#### [MODIFY] [agent-loop.js](file:///c:/Users/kouga/Projects/Web/toio-lab-web/js/agent-loop.js)
- **Plannerプロンプトの調整**:
  - タスクの最小単位を「目的地への到達 ＋ そこでの追加アクション（光る/鳴る）」と定義します。
  - 「移動」と「光る」を別々のタスクに分離せず、1つにまとめるよう指示を強化します。
- **Generatorプロンプトの調整**:
  - `move_to` と `set_light` 等を1回のターンで順番に実行するように指示します。
  - `move_to` が同期実行されるため、到着を待ってから次のツールが動くことを前提とした推論を促します。

### 3. シミュレーター (Simulation Layer)

#### [MODIFY] [toio-sim.js](file:///c:/Users/kouga/Projects/Web/toio-lab-web/js/toio-sim.js)
- **`moveTo` の遅延実装**:
  - 現在地から目的地までの距離に応じた `setTimeout` を挟むことで、擬似的に移動時間を発生させます。

## Verification Plan

### Automated/Manual Verification
- **単一タスクの検証**: 「300, 300に移動して、青色に光ってください」と指示。
  - 期待値: 目的地に到着した瞬間に青色に光り、その後評価フェーズに入ること。
- **スタック時の検証**: 物理 toio を手で押さえて目的地へ行かせないようにする。
  - 期待値: 10秒後にタイムアウトし、失敗として評価・リトライが行われること。
- **シミュレーター**: テレポートせず、じわっと待ってから完了することを確認。
