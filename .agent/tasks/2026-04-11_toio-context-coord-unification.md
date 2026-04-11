# Task: toioコンテキストの座標単位統一

toioエージェントに提供する空間情報を、物理単位（mm/cm）からtoioの絶対座標単位（Position IDユニット）に統一します。

## 進捗状況

- [x] `js/spatial-awareness.js` の修正
    - [x] `getStaticGuide()` の単位統一（cm -> 単位）
    - [x] `getDynamicContext()` の単位統一（mm -> 単位）
- [x] `.agent/memory/toio-context-spec.md` の更新
- [/] 動作確認（エージェントの思考ログにおける単位の確認）

## 完了定義
- エージェントが「mm」ではなく「単位」で空間を認識し、計算の齟齬がなくなっていること。
- メモリドキュメントと実装が整合していること。
