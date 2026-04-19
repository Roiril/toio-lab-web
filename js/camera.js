/**
 * CameraClient — XIAO ESP32S3 Sense カメラモジュール
 *
 * 使い方:
 *   const cam = new CameraClient('http://192.168.x.x');
 *   await cam.checkConnection();
 *   cam.startPreview(imgElement, 5); // 5fps でプレビュー
 *   const base64 = await cam.captureBase64(); // LLMに渡す画像
 */
class CameraClient {
    constructor(baseUrl = '') {
        this.baseUrl = baseUrl.replace(/\/$/, '');
        this.isStreaming = false;
        this.streamInterval = null;
    }

    setUrl(url) {
        this.baseUrl = (url || '').replace(/\/$/, '');
        this.stopPreview();
    }

    async checkConnection() {
        if (!this.baseUrl) return false;
        try {
            const res = await fetch(`${this.baseUrl}/status`, {
                signal: AbortSignal.timeout(3000)
            });
            return res.ok;
        } catch {
            return false;
        }
    }

    // imgElement の src を定期更新してプレビュー表示
    startPreview(imgElement, fps = 5) {
        this.stopPreview();
        if (!this.baseUrl) return;
        this.isStreaming = true;
        const interval = Math.round(1000 / fps);
        const update = () => {
            if (!this.isStreaming) return;
            imgElement.src = `${this.baseUrl}/capture?t=${Date.now()}`;
        };
        update();
        this.streamInterval = setInterval(update, interval);
    }

    stopPreview() {
        this.isStreaming = false;
        if (this.streamInterval) {
            clearInterval(this.streamInterval);
            this.streamInterval = null;
        }
    }

    // 1枚撮影してdata:image/jpeg;base64,...形式で返す
    async captureBase64() {
        if (!this.baseUrl) throw new Error('カメラURLが設定されていません');
        const res = await fetch(`${this.baseUrl}/capture?t=${Date.now()}`, {
            signal: AbortSignal.timeout(5000)
        });
        if (!res.ok) throw new Error(`カメラキャプチャ失敗: HTTP ${res.status}`);
        const blob = await res.blob();
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }
}
