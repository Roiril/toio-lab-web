---
name: mycobot-firmware-quirks
description: myCobot 320 firmware の癖 — 特に servo latch / 復旧不能状態
metadata:
  type: project
---

myCobot 320-M5 firmware の API 経由では復旧できない / 観測困難な事象。実機押下や負荷イベントの後に発覚。

## 「J5 latch」の真の正体 = self-collision 摩擦による servo overload

**最初は「謎の servo latch」と思っていたが、ユーザー指摘により判明** — アーム同士の
リンクが「ガッ」と接触しない程度に擦れていて、その摩擦が J5 を止めて servo
overload を起こしていた。J5 自体に固有のバグはない（J5 を HOME 姿勢で 0→±90° まで
振っても全く問題なく動く）。

**測定値からの教訓**:
- 失敗姿勢 4 例で **link0-link2 = 74.2mm が共通** だが、HOME も 74.2mm
- これは d2=88.78mm の DH offset に由来する **幾何学的不変量**で衝突判定に使えない
- 真の collision 指標は **可変ペア** (link1-link5, link2-link4 等)
- HOME 最小可変ペア距離 = 135mm、stall 姿勢では 92-119mm まで縮む

**修正済み (commit 後の状態)**:
- `safety.py` の pairs リストから (0,2), (3,5) を除外（幾何学的不変量）
- `SELF_CLEARANCE` 60→105mm
- それでもモデルから漏れる軽接触は `send_angles_and_wait` の stall detector で
  runtime に捕捉される

**How to apply**:
- 新規 IK 解候補や reachable 判定では、**SELF_CLEARANCE=105 を満たす解を選ぶ**
- pre-flight で通っても rub する場合がある（モデル限界）→ stall detector 任せ
- ペイロード/グリッパー装着で実効半径が変わる → constants.py の値要再評価

## J5 (および恐らく他関節) の latched lock

**症状**: send_angles で命令しても特定の servo だけ動かない。診断 API では全て正常に見える：
- `is_servo_enable(n) == 1` （ON 扱い）
- `get_servo_currents()` = 0 （無負荷）
- `get_servo_temps()` 正常
- `get_servo_voltages()` 正常

**復旧 API は効かない**:
- `clear_error_information()` → ok 返るが直らない
- `focus_servo(n)` → -1 (拒否)
- `power_on()` → 既に ON なので no-op

**唯一の復旧**: M5 本体の電源ボタンで再起動 → Transponder → USB UART で再接続。
**注意**: 電源再起動後も同じ姿勢に近づくと J5 が再 latch することがある（実機で2回確認）。
電源再起動だけでは恒久解決ではなく、根本原因（姿勢 or 負荷条件）が消えるまで再発しうる。

**発火条件 (推定)**:
- ユーザーが手で押した結果 firmware が overload protection を発動した直後
- joint limit 近傍 (例 J5=75°, 90 が上限のとき) を伴う負荷
- 連続した急な姿勢変化 (workspace probe で 1 サンプル目→2 サンプル目で発生)
- J5 が +70°〜+90° 付近で長時間ホールド状態 (重力で wrist が垂れ下がりトルク要求)

**検知**: 角度進捗監視 (stall detection in `src/arm/hub.py:send_angles_and_wait`)
が早期に `stuck_joints` を特定して abort してくれる。current 監視より遥かに有効。

**How to apply**:
- 押下イベント / 大電流イベントの後、必ず一度 `/move` で小さいテスト動作をして全関節が動くか確認すべき
- workspace probe や自動 sweep スクリプトには「1 関節でも 2 連続で reach 失敗したら abort」のサーキットブレーカを入れる
- UI には「特定 joint だけ frozen」を検知する仕組みが欲しい（角度命令と readback の差を監視）

## get_servo_currents は torque を反映しない

[[mycobot-firmware-quirks]] と関連。`get_servo_currents()` の戻り値は実トルク電流ではない（PWM duty 等の filtered 値と推定）。ユーザーが強く押している間も最大 24mA しか出ない。

**含意**:
- Python 側 `CurrentMonitor` (CURRENT_THRESHOLD_MA=800/1500) は collision 検出として実質機能しない — firmware 保護のほうが先に動く
- 衝突検知は本来 `get_servo_status()` の fault flag を見るべき設計

## /home の readback timeout = 衝突 or latch の可能性大

WAYPOINT_TIMEOUT=8s 内に到達できない場合、joint limit や latched servo が疑い。「とりあえずもう一度」しないで `/servo_diagnostics?full=1` で各 joint の温度・電圧・current を確認すること。
