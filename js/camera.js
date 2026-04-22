/**
 * Camera clients for LLM image input.
 *
 * 2 つの実装を同じインタフェースで提供する:
 *   - UsbCameraClient: ブラウザの getUserMedia 経由で USB/内蔵 Web カメラを使用（デフォルト）
 *   - Esp32CameraClient: XIAO ESP32S3 Sense を HTTP 経由で使用（旧 CameraClient）
 *
 * 共通インタフェース:
 *   await client.checkConnection() -> boolean
 *   client.startPreview(targetEl)  // UsbCameraClient は <video>, Esp32 は <img>
 *   client.stopPreview()
 *   await client.captureBase64() -> "data:image/jpeg;base64,..."
 *   client.previewTagName // "video" | "img"
 */

class UsbCameraClient {
    constructor(deviceId = null) {
        this.deviceId = deviceId || null;
        this.stream = null;
        this.videoEl = null;
    }

    get previewTagName() { return 'video'; }

    setUrl(_url) { /* no-op — USB カメラは URL を持たない */ }

    setDeviceId(deviceId) {
        if (this.deviceId === deviceId) return;
        this.deviceId = deviceId || null;
        // ストリーム中なら再開して切り替え
        if (this.stream && this.videoEl) {
            const v = this.videoEl;
            this.stopPreview();
            this.startPreview(v).catch(e => console.warn('[camera] switch device failed:', e));
        }
    }

    _buildConstraints() {
        const video = this.deviceId
            ? { deviceId: { exact: this.deviceId } }
            : true;
        return { video, audio: false };
    }

    async checkConnection() {
        if (!navigator.mediaDevices?.enumerateDevices) return false;
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            return devices.some(d => d.kind === 'videoinput');
        } catch {
            return false;
        }
    }

    /**
     * 利用可能な videoinput デバイスの配列を返す。
     * getUserMedia 権限が未付与だと label が空文字になる点に注意。
     */
    async listDevices() {
        if (!navigator.mediaDevices?.enumerateDevices) return [];
        const all = await navigator.mediaDevices.enumerateDevices();
        return all.filter(d => d.kind === 'videoinput').map(d => ({
            deviceId: d.deviceId,
            label: d.label || '(ラベル未取得 — 一度プレビューすると取得できます)'
        }));
    }

    async startPreview(videoEl) {
        this.stopPreview();
        if (!navigator.mediaDevices?.getUserMedia) {
            throw new Error('この環境では getUserMedia が使えません');
        }
        this.stream = await navigator.mediaDevices.getUserMedia(this._buildConstraints());
        this.videoEl = videoEl;
        videoEl.srcObject = this.stream;
        videoEl.muted = true;
        videoEl.playsInline = true;
        await videoEl.play().catch(() => {});
    }

    stopPreview() {
        if (this.stream) {
            this.stream.getTracks().forEach(t => t.stop());
            this.stream = null;
        }
        if (this.videoEl) {
            this.videoEl.srcObject = null;
            this.videoEl = null;
        }
    }

    async captureBase64() {
        // プレビュー中ならそのフレームをグラブ、そうでなければ一瞬だけストリームを開く
        if (this.stream && this.videoEl && this.videoEl.videoWidth > 0) {
            return this._grab(this.videoEl);
        }
        const tempStream = await navigator.mediaDevices.getUserMedia(this._buildConstraints());
        const tempVideo = document.createElement('video');
        tempVideo.srcObject = tempStream;
        tempVideo.muted = true;
        tempVideo.playsInline = true;
        await tempVideo.play();
        // 1フレーム待つ
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        const b64 = this._grab(tempVideo);
        tempStream.getTracks().forEach(t => t.stop());
        return b64;
    }

    _grab(videoEl) {
        const c = document.createElement('canvas');
        c.width = videoEl.videoWidth;
        c.height = videoEl.videoHeight;
        c.getContext('2d').drawImage(videoEl, 0, 0);
        return c.toDataURL('image/jpeg', 0.85);
    }
}

/**
 * XIAO ESP32S3 Sense カメラモジュール (HTTP 経由)
 *
 * 使い方:
 *   const cam = new Esp32CameraClient('http://192.168.x.x');
 *   await cam.checkConnection();
 *   cam.startPreview(imgElement, 5); // 5fps でプレビュー
 *   const base64 = await cam.captureBase64();
 */
class Esp32CameraClient {
    constructor(baseUrl = '') {
        this.baseUrl = (baseUrl || '').replace(/\/$/, '');
        this.isStreaming = false;
        this.streamInterval = null;
        this.imgEl = null;
    }

    get previewTagName() { return 'img'; }

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

    startPreview(imgElement, fps = 5) {
        this.stopPreview();
        if (!this.baseUrl) return;
        this.isStreaming = true;
        this.imgEl = imgElement;
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
        this.imgEl = null;
    }

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

// 後方互換: 既存コードが new CameraClient(...) を呼んだ場合は ESP32 版を返す
const CameraClient = Esp32CameraClient;
