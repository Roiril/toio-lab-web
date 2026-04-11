class SpatialAwareness {
    constructor() {
        // === マット仕様 (Simple Play Mat) ===
        this.mat = {
            // Position ID 座標範囲
            coordRange: { x: { min: 98, max: 402 }, y: { min: 142, max: 358 } },
            // 座標系のサイズ（単位数）
            coordSize: { width: 304, height: 216 },
            // 物理サイズ（mm）— 公式仕様: 約411mm × 292mm (読み取り有効範囲)
            physicalSize: { width: 411, height: 292 },
            // 座標1単位 ≈ 何mm（概算）
            unitToMm: { x: 1.35, y: 1.35 },
            // マットの中心座標
            center: { x: 250, y: 250 },
        };

        // === キューブ仕様 ===
        this.cube = {
            // 物理サイズ（mm）
            physicalSize: { width: 32, height: 32, depth: 23 },
            // 座標系での占有サイズ（概算）
            coordFootprint: 24,
            // ホイール間距離（mm）
            wheelBase: 26,
        };

        // === 速度・距離の対応表 ===
        this.speedTable = {
            10:  23,
            30:  69,
            50:  115,
            80:  184,
            100: 230,
        };
    }

    // キューブの現在位置からマット端までの余裕（座標単位）
    getMargins(cubeX, cubeY) {
        return {
            top:    cubeY - this.mat.coordRange.y.min,
            bottom: this.mat.coordRange.y.max - cubeY,
            left:   cubeX - this.mat.coordRange.x.min,
            right:  this.mat.coordRange.x.max - cubeX,
        };
    }

    coordToMm(coordUnits) {
        return Math.round(coordUnits * this.mat.unitToMm.x);
    }

    mmToCoord(mm) {
        return Math.round(mm / this.mat.unitToMm.x);
    }

    // LLMにシステムプロンプトとして1回だけ注入する静的な空間情報
    getStaticGuide() {
        return [
            `## 空間情報（車両感覚）`,
            `座標範囲: X(98〜402: 幅304単位), Y(142〜358: 高さ216単位)`,
            `キューブサイズ: 約 24 × 24 単位`,
            ``,
            `## 移動の目安（speed=50の場合）`,
            `- ちょっと動く: 300ms → 約 26 単位`,
            `- 普通に進む: 700ms → 約 59 単位`,
            `- 大きく進む: 1500ms → 約 126 単位`,
            `- 端から端: 約 304 単位 (X方向) / 約 216 単位 (Y方向)`,
            ``,
            `## 回転の目安（speed=50の場合）`,
            `- 90度: 約280ms / 180度: 約560ms / 1回転: 約1120ms`
        ].join('\n');
    }

    // LLMに状態として毎ループ注入する動的な空間情報
    getDynamicContext(cubeX, cubeY, cubeAngle) {
        const margins = this.getMargins(cubeX, cubeY);

        return [
            `現在位置: (${cubeX}, ${cubeY}), 角度: ${cubeAngle}°`,
            `端までの余裕: 上${margins.top}単位 / 下${margins.bottom}単位 / 左${margins.left}単位 / 右${margins.right}単位`,
            // 警告を追加（落下防止）
            (margins.top < 30 || margins.bottom < 30 || margins.left < 30 || margins.right < 30) ? `⚠️ 警告: マット端に接近しています。慎重に移動してください。` : ""
        ].filter(Boolean).join('\n');
    }
}
