---
name: feedback-estop-no-connect
description: ユーザーが緊急停止ボタンを押している間は myCobot に接続を試みない。ソフト側を直してから「接続してOK」と言われるまで待つ
metadata: 
  node_type: memory
  type: feedback
  originSessionId: a7486d90-60d7-477b-a872-3ff815486ff9
---

ユーザーが「緊急停止してます」「e-stop 押してる」等と明言した時、もしくはソフトに重大な安全問題があってユーザーがそれを直して欲しいと言った時：

**Why:** ユーザーは危険な状況を物理的に止めて、ソフトを直す時間を作っている。E-stop 押下中はサーボ無通電で `power_on()` / `is_power_on()` / `get_angles()` 全部失敗する。失敗した接続試行はユーザーのフィードバックループを遅らせるだけで、何の情報も得られない。

**How to apply:**
- E-stop 押下中の接続試行は一切しない（`Arm()` インスタンス化も避ける — シリアル開くだけで権限取られる）
- COM ポート占有状態の確認 (`[System.IO.Ports.SerialPort]::GetPortNames()` 等) も避ける（ユーザーが触ってる時に PowerShell から PnP デバイス列挙すると割込みになる）
- 代わりにソフト側の作業（コード、UI、ドキュメント）を進める
- ユーザーから「接続して OK」「e-stop 解除した」等の明示があってから初めて再接続を試みる

参照: [[project_overview]] (mycobot-lab の起動手順)
