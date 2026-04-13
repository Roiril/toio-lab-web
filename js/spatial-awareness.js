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
            // 安全な移動範囲のマージン（キューブの対角線の半分 ≈ 17単位 + 余裕 6単位）
            safeMargin: 23,
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
            10: 23,
            30: 69,
            50: 115,
            80: 184,
            100: 230,
        };
    }

    // キューブの現在位置からマット端までの余裕（座標単位）
    getMargins(cubeX, cubeY) {
        return {
            top: cubeY - this.mat.coordRange.y.min,
            bottom: this.mat.coordRange.y.max - cubeY,
            left: cubeX - this.mat.coordRange.x.min,
            right: this.mat.coordRange.x.max - cubeX,
        };
    }

    /**
     * 指定された座標をマットの安全な範囲（端からマージンを持たせた範囲）にクランプ（制限）します。
     * @param {number} x 指定されたX座標
     * @param {number} y 指定されたY座標
     * @returns {{x: number, y: number}} 安全な座標
     */
    clampToSafeRange(x, y) {
        const margin = this.mat.safeMargin;
        const safeX = Math.max(this.mat.coordRange.x.min + margin, Math.min(this.mat.coordRange.x.max - margin, x));
        const safeY = Math.max(this.mat.coordRange.y.min + margin, Math.min(this.mat.coordRange.y.max - margin, y));
        return { x: safeX, y: safeY };
    }

    /**
     * 速度と時間から移動距離（座標単位）を概算します。
     * speedTable を線形補間して使用。
     * @param {number} speed 速度 (10-100)
     * @param {number} durationMs 時間 (ms)
     * @returns {number} 推定移動距離（座標単位）
     */
    estimateMoveDistance(speed, durationMs) {
        // speedTable: speed -> coord units per second
        const entries = Object.entries(this.speedTable)
            .map(([s, d]) => [Number(s), d])
            .sort((a, b) => a[0] - b[0]);

        let unitsPerSec;
        if (speed <= entries[0][0]) {
            unitsPerSec = entries[0][1];
        } else if (speed >= entries[entries.length - 1][0]) {
            unitsPerSec = entries[entries.length - 1][1];
        } else {
            // 線形補間
            for (let i = 0; i < entries.length - 1; i++) {
                if (speed >= entries[i][0] && speed <= entries[i + 1][0]) {
                    const ratio = (speed - entries[i][0]) / (entries[i + 1][0] - entries[i][0]);
                    unitsPerSec = entries[i][1] + ratio * (entries[i + 1][1] - entries[i][1]);
                    break;
                }
            }
        }

        return (unitsPerSec * durationMs) / 1000;
    }

    /**
     * 現在位置と向きから、進行方向のマット端までの安全距離（safeMargin を差し引いた値）を返します。
     * @param {number} cubeX 現在のX座標
     * @param {number} cubeY 現在のY座標
     * @param {number} angleDeg 現在の角度（度数法、0=右、90=下、180=左、270=上）
     * @param {boolean} reverse trueなら逆方向（後退時）の距離を返す
     * @returns {number} 安全に移動できる最大距離（座標単位）。0以下なら既にマージン内。
     */
    getSafeDistance(cubeX, cubeY, angleDeg, reverse = false) {
        const margin = this.mat.safeMargin;
        const range = this.mat.coordRange;

        // 有効な角度を計算（後退時は180度反転）
        let effectiveAngle = angleDeg;
        if (reverse) effectiveAngle = (angleDeg + 180) % 360;

        const rad = effectiveAngle * Math.PI / 180;
        const cosA = Math.cos(rad);
        const sinA = Math.sin(rad);

        // 各壁までの距離を方向ベクトルで割って最小値を求める
        let minDist = Infinity;

        // X方向の壁
        if (cosA > 0.01) {
            // 右の壁まで
            minDist = Math.min(minDist, ((range.x.max - margin) - cubeX) / cosA);
        } else if (cosA < -0.01) {
            // 左の壁まで
            minDist = Math.min(minDist, ((range.x.min + margin) - cubeX) / cosA);
        }

        // Y方向の壁（toio座標系: 角度0=右、sinで下方向）
        if (sinA > 0.01) {
            // 下の壁まで
            minDist = Math.min(minDist, ((range.y.max - margin) - cubeY) / sinA);
        } else if (sinA < -0.01) {
            // 上の壁まで
            minDist = Math.min(minDist, ((range.y.min + margin) - cubeY) / sinA);
        }

        return Math.max(0, minDist);
    }

    coordToMm(coordUnits) {
        return Math.round(coordUnits * this.mat.unitToMm.x);
    }

    mmToCoord(mm) {
        return Math.round(mm / this.mat.unitToMm.x);
    }

    // LLMにシステムプロンプトとして1回だけ注入する静的な空間情報
    getStaticGuide() {
        const m = this.mat.safeMargin;
        const range = this.mat.coordRange;
        return [
            `## 空間情報（車両感覚）`,
            `マット座標範囲: X(${range.x.min}〜${range.x.max}), Y(${range.y.min}〜${range.y.max})`,
            `移動推奨範囲: X(${range.x.min + m}〜${range.x.max - m}), Y(${range.y.min + m}〜${range.y.max - m})`,
            `※ Y座標がより小さい方が上（北）、より大きい方が下（南）を表します。`,
            `※ センサーの読み取り安定のため、周辺${m}単位は「端」とみなし、移動指示は推奨範囲内で行ってください。`,
            `キューブサイズ: 約 24 × 24 単位`,
            ``,
            `## 移動の目安（スピード=50のとき）`,
            `- ちょっと動く: 300ms → 約 26 単位`,
            `- 普通に進む: 700ms → 約 59 単位`,
            `- 大きく進む: 1500ms → 約 126 単位`,
            `- 端から端: 約 304 単位 (X方向) / 約 216 単位 (Y方向)`,
            ``,
            `## 回転の目安（スピード=50のとき）`,
            `- 90度: 約280ms / 180度: 約560ms / 1回転: 約1120ms`,
            `※ \`move_to\` で目的地の角度 (angle) を指定する場合も、この時間を参考に移動時間をイメージできます。`,
            ``,
            `## 推奨される操縦方法`,
            `- 特定の場所へ行くには \`move_to(x, y, angle)\` を使用するのが最も確実です。`,
            `- 向きだけを変えたい場合は \`turn\` または \`move_to\` で現在位置のまま角度だけを指定してください。`,
            ``,
            `## ⚠️ マット端の安全制御`,
            `- \`move_to\` は自動的に安全範囲にクランプされます（端から${m}単位のマージン）。`,
            `- \`move_forward\` / \`move_backward\` も端に衝突しそうな場合は自動的に距離が制限されます。`,
            `- 端付近（余裕${m}単位以内）では短距離の移動を心がけてください。`
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
