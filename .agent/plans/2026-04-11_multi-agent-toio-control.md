# Toio Multi-Agent Control Architecture

現在のToioエージェントは1つのLLMプロンプトで「意図解釈」「目標座標の決定」「移動コマンド（ツール）生成」を同時に行っており、特に `move_forward` や `turn` といった相対移動コマンドを組み合わせているため、結果として途中で止まったり想定外の方向へ進んだりする問題が発生しています。

これを解決するため、役割を分割したサブエージェントアーキテクチャへ移行します。

## Proposed Changes

### 1. `js/ollama-client.js`
- [MODIFY] `OllamaClient._sendRequest`
  - `format: "json"` のオプションをサポートし、LLMに安定してJSON構造のみを出力させる機能を追加します（Target Coordinatorで使用）。
- [MODIFY] `OllamaClient.chat` に引数 `options` を追加し、呼び出し側からJSONモードや温度（temperature）を調整できるようにします。

### 2. `js/tools-schema.js`
- [MODIFY] ツール定義の更新
  - 新規ツール `move_to(x, y, angle)` を追加します。座標指定を用いた絶対移動（Targeted Move）をExecution Plannerに開放します。

### 3. `js/tool-executor.js`
- [MODIFY] `ToolExecutor.execute`
  - `move_to` ツールのハンドラを追加し、既存の `this.toio.moveTo(x, y, angle)` メソッドを呼び出すようにします。

### 4. `js/agent-loop.js`
- [MODIFY] `AgentLoop` の構造を段階的（階層的）パイプラインに変更します。
  - **Phase 1: Target Coordinator (目標決定)**
    - 入力: ユーザー指示 + （`spatial-awareness.js` による）空間コンテキスト
    - 出力: `{"target_x": X, "target_y": Y, "reasoning": "..."}` 形式のJSON
  - **Phase 2: Execution Planner (実行計画)**
    - 入力: Phase 1で決定した目標座標 + 現在状態
    - 処理: `move_to` などのツールを呼び出し、Toioを目標へ移動させる。
  - **Phase 3: Evaluator (評価)**
    - 入力: 実行後のToio座標 + 目標座標
    - 出力: 到達成功判定。不十分と判断した場合はPhase 2へ差し戻して再調整を行う。

## User Review Required

> [!IMPORTANT]
> 既存の `AgentLoop` は、単一のチャット履歴（`chatHistory`）を共有する方式でしたが、3つのエージェントに分割することで、プロンプトのコンテキスト管理が複雑になります。
> 今回の実装では、`OllamaClient` をラップするか複数のインスタンスを用意することで、「コーディネーター用」「プランナー用」としてシステムプロンプトや履歴を独立して管理するよう改修します。

> [!NOTE]
> Phase 3 (Evaluator) が「まだ到達していない」と判断した際の「再試行上限」を何回に設定すべきか、（例: 最大3回まで補正移動を試みる等）ご意見はありますでしょうか？（デフォルトでは3回程度の制限を設けます）

## Verification Plan

### Automated Tests
- シミュレータ側（`toio-sim.js`）で「下端へ移動」などの指示を出し、ブラウザコンソールにて Phase 1〜3 が正しく連携して動くかログを確認します。
- JSONモードで正しく X, Y 座標が抽出できているかのパース処理をテストします。

### Manual Verification
- ユーザーにブラウザUI上で様々な空間的指示（「上端へ」「真ん中へ」）を出していただき、Toioが斜めに回転しすぎたり途中で止まる問題が解消され、正確に座標に移動することを確認します。
