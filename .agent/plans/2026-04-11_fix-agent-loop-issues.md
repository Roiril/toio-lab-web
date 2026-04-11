# AgentLoop.js の構文エラー修正と再構築

`js/agent-loop.js` における構文エラーおよびロジックの不整合を修正し、安定したエージェントループを再構築します。

## ユーザーレビューが必要な事項

- 以前のコードが断片化しており、一部のロジックが重複または破損しています。本修正では、本来の「Planner -> Generator -> Evaluator」の設計に基づき、コードをクリーンに書き換えます。

## 変更内容

### [Component] AgentLoop

#### [MODIFY] [agent-loop.js](file:///c:/Users/kouga/Projects/Web/toio-lab-web/js/agent-loop.js)
- `generatorRequest` の重複宣言を修正。
- 89行目付近の文字列リテラルのエラーを修正。
- `try-catch` およびループの構造を整理。
- Generatorフェーズで複数回のツール呼び出しを許容し、その後にEvaluatorフェーズで結果を判定する正しいフローを確立。

## 検証計画

### 自動テスト
- ブラウザのコンソールで `AgentLoop` のインスタンス化および実行がエラーなく行えるか確認。
- 構文チェック（リンターまたはIDEの指摘が消えることの確認）。

### 手動確認
- エージェントを起動し、最初のタスク生成（Planner）から行動（Generator）、評価（Evaluator）までがスムーズに遷移することを確認。
