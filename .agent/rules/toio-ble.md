---
trigger: model_decision
description: toioのBluetooth通信やツール実行に関する実装ルール
---

# toio制御ルール

1. **非同期処理**: BLEのコマンド送信（`writeValueWithoutResponse` 等）後は、ハードウェアの処理完了を待機するため、適切なディレイ（`Promise(resolve => setTimeout(...))`）を挟むこと。
2. **接続確認**: 任意の操作を実行する前に、必ず `this.isConnected` のチェックを行い、未接続時のエラーハンドリングを実装すること。