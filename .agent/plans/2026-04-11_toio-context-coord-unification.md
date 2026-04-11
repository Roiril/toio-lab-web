# toioコンテキストの座標単位統一計画

toioが取得する絶対座標（Position ID）は独自の単位（1単位 ≒ 約1.35mm）であり、現在のエージェントに渡しているコンテキスト情報（マットサイズ、距離、余裕など）がミリメートルやセンチメートルの物理単位になっているため、LLMが「位置座標」と「距離」の相関を正しく理解しづらいという問題があります。

これを解決するため、LLMに渡す空間コンテキストの全てを「Position IDの座標単位」に統一します。

## User Review Required

> [!IMPORTANT]
> コンテキストの単位を `mm/cm` から `座標単位 (ユニット)` に完全に置き換えます。これにより、エージェントは「X座標が400だから、あと幅200ユニット進めるな」といった計算を直接行えるようになり、空間認識能力の向上が期待できます。
> 内容をご確認いただき、問題なければ承認をお願いします。

## Proposed Changes

### 空間認識ロジック (Context Layer)

#### [MODIFY] [spatial-awareness.js](file:///c:/Users/kouga/Projects/Web/toio-lab-web/js/spatial-awareness.js)
- `getStaticGuide()`:
  - 「マットサイズ: 約41cm × 29cm」を「座標範囲: X(98〜402: 幅304単位), Y(142〜358: 高さ216単位)」に変更。
  - 「キューブサイズ: 3.2cm × 3.2cm」を「キューブサイズ: 約 24 × 24 単位」に変更。
  - 移動の目安をcmから座標単位に換算して記載。
    - 300ms → 約 26 単位
    - 700ms → 約 59 単位
    - 1500ms → 約 126 単位
- `getDynamicContext()`:
  - 毎ターン提示する「端までの余裕」の値を `marginMm`（ミリメートル）から `margins`（座標単位）を出力するように修正。
  - プロンプト文を `mm` から `単位` という表記に変更。
- `mmToCoord` 等の換算関数は、将来的に必要になる可能性があるため内部用として残すが、コンテキストへの出力には使用しない。

### メモリ・仕様ドキュメント (Documentation)

#### [MODIFY] [toio-context-spec.md](file:///c:/Users/kouga/Projects/Web/toio-lab-web/.agent/memory/toio-context-spec.md)
- `getStaticGuide` と `getDynamicContext` の変更に合わせて、エージェントの基本ルールやコンテキストの仕様書を更新し、「mm単位は使用せず、すべて座標単位（Position IDユニット）で思考・計画する」というルールを追記。

## Open Questions

特にありませんが、もし「toio Do」と同等の独自の座標変換系（中心を0,0にするなど）をご希望の場合はお知らせください。現状はtoioの生の絶対座標（Position ID）をそのまま使用する想定です。

## Verification Plan

### Manual Verification
- 修正後、ブラウザでアプリケーションを起動し、エージェントの思考ログ（thought）を確認。
- 「端まであと〇〇ミリ」ではなく「端まであと〇〇単位」として認識し、移動量や目標座標を正しく見積もって行動できるかを確認。
