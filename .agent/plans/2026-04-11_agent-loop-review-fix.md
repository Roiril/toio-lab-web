# エージェンティックループ導入計画 — レビュー反映・洗練

レビュー結果を詳細にチェックした結果、大部分は実装済み（または実装中）でしたが、APIの設計や一部のバグ、および推奨されるリファクタリングが残っています。これらを反映し、より堅牢なエージェントループを構築します。

## ユーザー承認が必要な事項
- `combinedToio` をクラスとして独立させる際、`js/toio-combined.js` という新ファイルを作成します。 `index.html` への script タグ追加が必要です。

## 修正計画

### 1. OllamaClient の拡張
レビューで指摘された「ループ内での制御」を容易にするため、以下のメソッドを追加します。
- `addToolResults(toolCalls, results)`: ツール実行結果を履歴に追加するのみ（API呼び出しなし）。
- `_sendRequest` を `sendMessages(tools, options)` として公開し、ユーザーメッセージの追加なしで現在の履歴を送信可能にします。

### 2. combinedToio のクラス化
`app.js` 内でオブジェクトリテラルとして定義されている `combinedToio` を `ToioCombined` クラスとして `js/toio-combined.js` に抽出します。
これにより、シミュレータと実機のマルチキャストロジックが隠蔽され、保守性が向上します。

### 3. AgentLoop のバグ修正とリファクタリング
- **バグ修正**: `SpatialAwareness.getStaticGuide()` を呼べき箇所で `getStaticContext()` を呼んでいる問題を修正します。
- **設定値反映**: `maxIterations` のデフォルトをレビュー推奨の `10` に変更します。
- **callbackの標準化**: `onStep` に渡すオブジェクトの構造を統一し、UI側での処理をより堅牢にします。

### 4. シミュレータの物理挙動調整 (Q1対応)
`SpatialAwareness` の「移動の目安」とシミュレータの実際の挙動に乖離があるため、`toio-sim.js` の `linearScale` や `angularScale` を調整し、ガイドに近い感覚で動くようにします。

## 変更ファイル

### [NEW] [toio-combined.js](file:///c:/Users/kouga/Projects/Web/toio-lab-web/js/toio-combined.js)
- シミュレータとBLEへのマルチキャストを行う `ToioCombined` クラス。

### [MODIFY] [ollama-client.js](file:///c:/Users/kouga/Projects/Web/toio-lab-web/js/ollama-client.js)
- `addToolResults` メソッドの追加。
- `_sendRequest` の改名と公開。

### [MODIFY] [agent-loop.js](file:///c:/Users/kouga/Projects/Web/toio-lab-web/js/agent-loop.js)
- `getStaticGuide` への修正。
- `maxIterations` の調整。
- `onStep` のデータ構造統一。

### [MODIFY] [toio-sim.js](file:///c:/Users/kouga/Projects/Web/toio-lab-web/js/toio-sim.js)
- 物理スケールの微調整（ガイドとの整合性）。

### [MODIFY] [app.js](file:///c:/Users/kouga/Projects/Web/toio-lab-web/js/app.js)
- `combinedToio` の置き換え。

### [MODIFY] [index.html](file:///c:/Users/kouga/Projects/Web/toio-lab-web/index.html)
- `js/toio-combined.js` の読み込み追加。

## 完了後の検証計画
### 自動テスト・手動検証
1. **ループ実行の確認**: 複数のツール呼び出しを伴う指示（例：「赤く光ってから(200, 200)に移動して」）を出し、ループが正しく継続することを確認。
2. **空間情報の整合性**: `get_position` ツールで得られる値が `SpatialAwareness` の定義と一致しているか確認。
3. **シミュレータの速度**: スピード50での移動時間がガイドの「普通に進む（700msで約59単位）」に近いかストップウォッチ等で簡易計測。
