# シミュレーション・レイアウトと操作パネルの刷新

シミュレーションマットが領域からはみ出ている問題を修正し、レイアウトをよりコンパクトかつ機能的に刷新します。

## ユーザー承認が必要な事項
- **中央のシミュレーションエリアの削除**: シミュレーションを左側の操作パネル（サイドバー）内に移動し、中央の広いエリアはチャット履歴が占有するように変更します。これにより、シミュレーションが「横長」のコンパクトな表示になります。
- **QuickActionsの削除**: ご要望通り、手動操作ボタン群（矢印キー、色指定ボタン）を削除します。

## 提案される変更点

### UI・レイアウトの変更

#### [MODIFY] [index.html](file:///c:/Users/kouga/Projects/Web/toio-lab-web/index.html)
- `<section class="simulation-area">` を丸ごと削除。
- サイドバー内の `<section class="quick-actions">` を削除し、代わりにシミュレーションマット (`#simulation-mat`) を含む新しいセクションを追加。
- チャット入力エリアをより広く使えるように調整。

#### [MODIFY] [style.css](file:///c:/Users/kouga/Projects/Web/toio-lab-web/css/style.css)
- `main-content` のフレックスレイアウトを調整（サイドバーとチャットの2列構成へ）。
- `.simulation-mat` のスタイルを修正：
    - `width: 100%` と `aspect-ratio: 304 / 216` を使用し、親要素（サイドバー）の幅に合わせて自動的に高さが決まるように変更。
    - `max-height` などの制約を適切に設定し、はみ出しを防止。
- サイドバー内の各セクションの間隔を調整。

### ロジックの修正

#### [MODIFY] [toio-sim.js](file:///c:/Users/kouga/Projects/Web/toio-lab-web/js/toio-sim.js)
- シミュレーションの座標変換 (`matToSim`, `simToMat`) で、要素の現在の `clientWidth` / `clientHeight` を常に参照するようにし、リサイズに対応。

#### [MODIFY] [app.js](file:///c:/Users/kouga/Projects/Web/toio-lab-web/js/app.js)
- 削除された `QuickActions` のイベントリスナー（`.action-btn`, `.color-btn` のクリック処理）を削除。

## 検証プラン

### 自動テスト / ブラウザ検証
- ブラウザを起動し、以下の点を確認：
    1. 左パネルに「LLM Connection」「toio Connection」「Simulation」が縦に並んでいること。
    2. シミュレーションがパネル幅いっぱいに表示され、アス比（横長）が保たれていること。
    3. ウィンドウをリサイズしても、シミュレーションマットがはみ出さず、追従してリサイズされること。
    4. エージェントによる操作（移動など）が、リサイズされたマット上でも正しく反映されること。

### 手動検証
- チャットで「少し前に進んで」と指示し、サイドバー内のシミュレーター上のキューブが正しく動くことを確認。
