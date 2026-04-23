/**
 * Hand position tracker (MediaPipe Tasks Vision - HandLandmarker)
 *
 * CDN の ESM モジュールを動的 import で読み込むのでビルドは不要。
 * 初回のみモデル (~8MB) を取得するため少し遅い。
 *
 * 使い方:
 *   const tracker = new HandTracker();
 *   await tracker.init();
 *   tracker.start(videoEl, (hand) => { ... });
 *   tracker.stop();
 *
 * onUpdate の引数:
 *   { present: boolean, x: number, y: number, confidence: number }
 *   x, y は 0–1 正規化（映像の左上が原点）。左右反転は呼び出し側で行う。
 */
class HandTracker {
    constructor() {
        this.landmarker = null;
        this.videoEl = null;
        this.onUpdate = null;
        this.rafId = null;
        this.lastVideoTime = -1;
        this.initPromise = null;
    }

    async init() {
        if (this.landmarker) return;
        if (this.initPromise) return this.initPromise;
        this.initPromise = (async () => {
            const vision = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.9/vision_bundle.mjs');
            const fileset = await vision.FilesetResolver.forVisionTasks(
                'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.9/wasm'
            );
            this.landmarker = await vision.HandLandmarker.createFromOptions(fileset, {
                baseOptions: {
                    modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
                    delegate: 'GPU'
                },
                runningMode: 'VIDEO',
                numHands: 1
            });
        })();
        return this.initPromise;
    }

    start(videoEl, onUpdate) {
        this.stop();
        this.videoEl = videoEl;
        this.onUpdate = onUpdate;
        const loop = () => {
            if (!this.videoEl) return;
            this.rafId = requestAnimationFrame(loop);
            if (!this.landmarker || this.videoEl.readyState < 2) return;
            const t = this.videoEl.currentTime;
            if (t === this.lastVideoTime) return;
            this.lastVideoTime = t;
            let result;
            try {
                result = this.landmarker.detectForVideo(this.videoEl, performance.now());
            } catch {
                return;
            }
            const lm = result?.landmarks?.[0];
            if (!lm || lm.length === 0) {
                this.onUpdate?.({ present: false, x: 0, y: 0, confidence: 0 });
                return;
            }
            // 21 個のランドマークの重心を手の中心として扱う
            let sx = 0, sy = 0;
            for (const p of lm) { sx += p.x; sy += p.y; }
            const cx = sx / lm.length;
            const cy = sy / lm.length;
            const conf = result?.handedness?.[0]?.[0]?.score ?? 1;
            this.onUpdate?.({ present: true, x: cx, y: cy, confidence: conf });
        };
        loop();
    }

    stop() {
        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
        this.videoEl = null;
        this.onUpdate = null;
        this.lastVideoTime = -1;
    }
}
