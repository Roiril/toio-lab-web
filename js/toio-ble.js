/**
 * Web Bluetooth wrapper for toio™ Core Cube
 * Reference: https://toio.github.io/toio-spec/en/
 */

const TOIO_SERVICE_UUID = "10b20100-5b3b-4571-9508-cf3efcd7bbae";
const POSITION_ID_CHAR_UUID = "10b20101-5b3b-4571-9508-cf3efcd7bbae";
const MOTOR_CHAR_UUID = "10b20102-5b3b-4571-9508-cf3efcd7bbae";
const LIGHT_CHAR_UUID = "10b20103-5b3b-4571-9508-cf3efcd7bbae";
const SOUND_CHAR_UUID = "10b20104-5b3b-4571-9508-cf3efcd7bbae";
const BATTERY_CHAR_UUID = "10b20108-5b3b-4571-9508-cf3efcd7bbae";
const BUTTON_CHAR_UUID = "10b20107-5b3b-4571-9508-cf3efcd7bbae";

class ToioBLE {
    constructor() {
        this.device = null;
        this.server = null;
        this.service = null;
        this.characteristics = {
            id: null, motor: null, light: null,
            sound: null, battery: null, button: null
        };

        // State
        this.x = 0;
        this.y = 0;
        this.angle = 0;
        this.isMoving = false;

        this.onDisconnectCallback = null;
        this.onReconnectCallback = null;
        this.onBatteryUpdateCallback = null;
        this.onButtonUpdateCallback = null;
        this.onIdUpdateCallback = null;

        this._pendingMove = null;
        this._controlId = 0;
        this._shouldReconnect = false;
        this._writeQueue = Promise.resolve();
        this._lastPositionUpdateTime = 0;
        this._positionUpdateThrottleMs = 50;

        // Position noise filtering (deadband)
        this._lastReportedX = 0;
        this._lastReportedY = 0;
        this._lastReportedAngle = 0;
        this._positionDeadbandMm = 3;
        this._angleDeadbandDeg = 2;

        // JS-driven light pattern animation token
        this._lightPatternToken = null;

        // Bound handlers — stored so addEventListener/removeEventListener are symmetric
        this._boundHandleIdUpdate = this._handleIdUpdate.bind(this);
        this._boundHandleMotorUpdate = this._handleMotorUpdate.bind(this);
        this._boundHandleBatteryUpdate = this._handleBatteryUpdate.bind(this);
        this._boundHandleButtonUpdate = this._handleButtonUpdate.bind(this);
    }

    get isConnected() {
        return !!(this.device && this.device.gatt.connected);
    }

    _getNextControlId() {
        this._controlId = (this._controlId + 1) % 256;
        if (this._controlId === 0) this._controlId = 1;
        return this._controlId;
    }

    /**
     * Enqueue a BLE write to prevent "GATT operation already in progress" errors.
     * All writes are serialized through a single Promise chain.
     */
    _enqueueWrite(writeFn) {
        const queued = this._writeQueue.then(writeFn).catch(e => {
            console.warn('[toio] BLE write error:', e.name || 'Unknown', '-', e.message || e);
            throw e;
        });
        // Keep queue alive even when a write fails
        this._writeQueue = queued.then(() => {}, () => {});
        return queued;
    }

    /**
     * Wait for motion to complete by detecting position stability.
     * Monitors position updates until coordinates stop changing for 100ms.
     */
    async _waitForMotionComplete(maxWaitMs = 3000) {
        return new Promise(resolve => {
            const startTime = performance.now();
            let lastX = this.x;
            let lastY = this.y;
            let lastAngle = this.angle;
            let stableMs = 0;
            const requiredStableMs = 100;

            const checkStability = () => {
                const elapsed = performance.now() - startTime;

                if (this.x === lastX && this.y === lastY && this.angle === lastAngle) {
                    stableMs += 50;
                } else {
                    stableMs = 0;
                }

                if (stableMs >= requiredStableMs) {
                    console.log(`[toio] Motion complete (stable for ${requiredStableMs}ms)`);
                    resolve();
                    return;
                }

                if (elapsed > maxWaitMs) {
                    console.warn(`[toio] Motion wait timeout after ${maxWaitMs}ms`);
                    resolve();
                    return;
                }

                lastX = this.x;
                lastY = this.y;
                lastAngle = this.angle;

                setTimeout(checkStability, 50);
            };

            checkStability();
        });
    }

    async connect() {
        try {
            if (!navigator.bluetooth) {
                throw new Error("この環境ではWeb Bluetoothがサポートされていません。\n(Chrome/Edgeを使用し、URLが localhost または HTTPS であるか確認してください)");
            }
            console.log("Requesting toio Bluetooth Device...");
            this.device = await navigator.bluetooth.requestDevice({
                filters: [{ services: [TOIO_SERVICE_UUID] }]
            });

            this.device.addEventListener('gattserverdisconnected', async () => {
                console.log("[toio] Disconnected");
                if (this.onDisconnectCallback) this.onDisconnectCallback();
                // Keep device reference when auto-reconnect is active
                this._cleanup(/* keepDevice= */ this._shouldReconnect);

                if (this._shouldReconnect) {
                    await this._attemptReconnect();
                }
            });

            console.log("Connecting to GATT Server...");
            this.server = await this.device.gatt.connect();
            this._shouldReconnect = true;

            console.log("Getting Service...");
            this.service = await this.server.getPrimaryService(TOIO_SERVICE_UUID);

            console.log("Getting Characteristics...");
            await this._initCharacteristics();

            console.log("toio Connected!");

            setTimeout(async () => {
                try { await this.getBattery(); }
                catch (e) { console.warn("Initial battery read failed, but connection is OK.", e); }
            }, 500);

            return true;
        } catch (error) {
            console.error("Connection failed:", error);
            this._shouldReconnect = false;
            this.disconnect();
            throw error;
        }
    }

    /** Fetch all characteristics in parallel and register notification handlers. */
    async _initCharacteristics() {
        [
            this.characteristics.id,
            this.characteristics.motor,
            this.characteristics.light,
            this.characteristics.sound,
            this.characteristics.battery,
            this.characteristics.button
        ] = await Promise.all([
            this.service.getCharacteristic(POSITION_ID_CHAR_UUID),
            this.service.getCharacteristic(MOTOR_CHAR_UUID),
            this.service.getCharacteristic(LIGHT_CHAR_UUID),
            this.service.getCharacteristic(SOUND_CHAR_UUID),
            this.service.getCharacteristic(BATTERY_CHAR_UUID),
            this.service.getCharacteristic(BUTTON_CHAR_UUID)
        ]);

        await this.characteristics.id.startNotifications();
        this.characteristics.id.addEventListener('characteristicvaluechanged', this._boundHandleIdUpdate);

        await this.characteristics.motor.startNotifications();
        this.characteristics.motor.addEventListener('characteristicvaluechanged', this._boundHandleMotorUpdate);

        await this.characteristics.battery.startNotifications();
        this.characteristics.battery.addEventListener('characteristicvaluechanged', this._boundHandleBatteryUpdate);

        await this.characteristics.button.startNotifications();
        this.characteristics.button.addEventListener('characteristicvaluechanged', this._boundHandleButtonUpdate);
    }

    /**
     * Attempt auto-reconnect with exponential backoff (up to 3 attempts: 1s, 2s, 4s).
     * Reinitializes service, characteristics, and notification listeners on success.
     */
    async _attemptReconnect() {
        const MAX_ATTEMPTS = 3;
        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            if (!this._shouldReconnect || !this.device) return;

            const delay = 1000 * Math.pow(2, attempt - 1);
            console.log(`[toio] Auto-reconnect attempt ${attempt}/${MAX_ATTEMPTS} in ${delay}ms...`);
            await new Promise(r => setTimeout(r, delay));

            if (!this._shouldReconnect || !this.device) return;

            try {
                this.server = await this.device.gatt.connect();
                this.service = await this.server.getPrimaryService(TOIO_SERVICE_UUID);
                await this._initCharacteristics();
                console.log("[toio] Auto-reconnect successful!");
                if (this.onReconnectCallback) this.onReconnectCallback();
                return;
            } catch (e) {
                console.warn(`[toio] Reconnect attempt ${attempt} failed:`, e.message);
            }
        }

        // All attempts exhausted
        this._shouldReconnect = false;
        this.device = null;
        console.error("[toio] Auto-reconnect failed. Manual reconnect required.");
    }

    disconnect() {
        this._shouldReconnect = false;
        if (this.device && this.device.gatt.connected) {
            this.device.gatt.disconnect();
        } else {
            this._cleanup(false);
        }
    }

    /**
     * @param {boolean} keepDevice - true during auto-reconnect to preserve the device reference
     */
    _cleanup(keepDevice = false) {
        // Remove notification listeners before nulling characteristics
        if (this.characteristics.id) {
            this.characteristics.id.removeEventListener('characteristicvaluechanged', this._boundHandleIdUpdate);
        }
        if (this.characteristics.motor) {
            this.characteristics.motor.removeEventListener('characteristicvaluechanged', this._boundHandleMotorUpdate);
        }
        if (this.characteristics.battery) {
            this.characteristics.battery.removeEventListener('characteristicvaluechanged', this._boundHandleBatteryUpdate);
        }
        if (this.characteristics.button) {
            this.characteristics.button.removeEventListener('characteristicvaluechanged', this._boundHandleButtonUpdate);
        }

        if (!keepDevice) this.device = null;
        this.server = null;
        this.service = null;
        this.characteristics = { id: null, motor: null, light: null, sound: null, battery: null, button: null };

        // Resolve any pending moveTo so callers don't hang
        if (this._pendingMove) {
            if (this._pendingMove._timeoutId) clearTimeout(this._pendingMove._timeoutId);
            this._pendingMove.resolve({ result: 0xFF, resultStr: "Disconnected" });
            this._pendingMove = null;
        }
        this.isMoving = false;

        // Reset deadband tracking
        this._lastReportedX = 0;
        this._lastReportedY = 0;
        this._lastReportedAngle = 0;

        // Stop any running light animation
        if (this._lightPatternToken) {
            this._lightPatternToken.cancelled = true;
            this._lightPatternToken = null;
        }
    }

    // --- Private Handlers ---

    _handleIdUpdate(event) {
        try {
            const now = performance.now();
            if (now - this._lastPositionUpdateTime < this._positionUpdateThrottleMs) {
                return;
            }

            const dv = event.target.value;
            const type = dv.getUint8(0);
            if (type === 0x01) {
                const newX = dv.getUint16(1, true);
                const newY = dv.getUint16(3, true);
                const newAngle = dv.getUint16(5, true);

                // Deadband filter: only update if change exceeds threshold
                const dx = Math.abs(newX - this._lastReportedX);
                const dy = Math.abs(newY - this._lastReportedY);
                const distance = Math.sqrt(dx * dx + dy * dy);
                const angleDiff = Math.abs(newAngle - this._lastReportedAngle);
                const angleDiffClamped = Math.min(angleDiff, 360 - angleDiff);

                if (distance >= this._positionDeadbandMm || angleDiffClamped >= this._angleDeadbandDeg) {
                    this.x = newX;
                    this.y = newY;
                    this.angle = newAngle;
                    this._lastReportedX = newX;
                    this._lastReportedY = newY;
                    this._lastReportedAngle = newAngle;
                    this._lastPositionUpdateTime = now;

                    if (this.onIdUpdateCallback) {
                        this.onIdUpdateCallback({ x: this.x, y: this.y, angle: this.angle });
                    }
                }
            }
        } catch (e) {
            console.warn("ID update parse error:", e);
        }
    }

    _handleMotorUpdate(event) {
        try {
            const dv = event.target.value;
            const type = dv.getUint8(0);
            if (type === 0x83) { // Targeted move response
                const controlId = dv.getUint8(1);
                const result = dv.getUint8(2);
                const resultsMap = {
                    0x00: "Success", 0x01: "Timeout", 0x02: "Reached target with error",
                    0x03: "Parameter error", 0x04: "Interrupted by new command",
                    0x05: "Internal error", 0x06: "Invalid Mat ID",
                    0x07: "Transmission error", 0x62: "Target move interrupted",
                    0xFF: "Unknown error"
                };
                const resultStr = resultsMap[result] || `Other error (0x${result.toString(16)})`;
                console.log(`[toio] Motor response (ID:${controlId}): 0x${result.toString(16).padStart(2, '0')} (${resultStr})`);

                if (this._pendingMove && this._pendingMove.controlId === controlId) {
                    this._pendingMove.resolve({ result, resultStr });
                    this._pendingMove = null;
                }
            }
        } catch (e) {
            console.warn("Motor update parse error:", e);
        }
    }

    _handleBatteryUpdate(event) {
        const value = event.target.value.getUint8(0);
        if (this.onBatteryUpdateCallback) this.onBatteryUpdateCallback(value);
    }

    _handleButtonUpdate(event) {
        try {
            const dv = event.target.value;
            let isPressed = false;
            if (dv.byteLength >= 2) {
                isPressed = dv.getUint8(1) === 0x80;
            } else if (dv.byteLength === 1) {
                isPressed = dv.getUint8(0) === 0x80;
            }
            if (this.onButtonUpdateCallback) this.onButtonUpdateCallback(isPressed);
        } catch (e) {
            console.warn("Button update parse error:", e);
        }
    }

    // --- Motor Control ---

    /**
     * Move with specified speeds and duration
     * @param {number} leftSpeed -100 to 100
     * @param {number} rightSpeed -100 to 100
     * @param {number} durationMs ms (converted to 10ms units internally)
     */
    async move(leftSpeed, rightSpeed, durationMs = 0) {
        if (!this.isConnected) return;

        this.isMoving = (leftSpeed !== 0 || rightSpeed !== 0);

        const leftDir = leftSpeed >= 0 ? 0x01 : 0x02;
        const rightDir = rightSpeed >= 0 ? 0x01 : 0x02;
        const lSpd = Math.min(255, Math.abs(leftSpeed));
        const rSpd = Math.min(255, Math.abs(rightSpeed));

        return new Promise((resolve) => {
            const sendFn = () => {
                if (durationMs > 0) {
                    let dur = Math.floor(durationMs / 10);
                    if (dur > 255) dur = 255;
                    const buf = new Uint8Array([0x02, 0x01, leftDir, lSpd, 0x02, rightDir, rSpd, dur]);
                    return this.characteristics.motor.writeValueWithoutResponse(buf).then(() => {
                        setTimeout(() => { this.isMoving = false; resolve(); }, durationMs + 50);
                    });
                } else {
                    const buf = new Uint8Array([0x01, 0x01, leftDir, lSpd, 0x02, rightDir, rSpd]);
                    return this.characteristics.motor.writeValueWithoutResponse(buf).then(() => {
                        resolve();
                    });
                }
            };
            this._enqueueWrite(sendFn).catch(() => resolve());
        });
    }

    async stop() {
        this.isMoving = false;
        return this.move(0, 0, 0);
    }

    async spin(speed, durationMs, direction = 'cw') {
        const s = direction === 'cw' ? speed : -speed;
        return this.move(s, -s, durationMs);
    }

    /**
     * Move to target coordinate with retry logic
     * @param {number} x Mat coordinate X
     * @param {number} y Mat coordinate Y
     * @param {number} angle Angle 0-360
     * @returns {Promise<{result: number, resultStr: string}>}
     */
    async _sendMoveToTarget(x, y, angle, retries = 2) {
        if (this._pendingMove) {
            if (this._pendingMove._timeoutId) clearTimeout(this._pendingMove._timeoutId);
            this._pendingMove.resolve({ result: 0x04, resultStr: "Interrupted by new command" });
            this._pendingMove = null;
        }

        const controlId = this._getNextControlId();
        const buf = new Uint8Array(13);
        buf[0] = 0x03;
        buf[1] = controlId;
        buf[2] = 0x00;
        buf[3] = 0x01;
        buf[4] = 0x50;
        buf[5] = 0x00;
        buf[6] = 0x00;

        const dv = new DataView(buf.buffer);
        dv.setUint16(7, x, true);
        dv.setUint16(9, y, true);
        dv.setUint16(11, ((angle % 360) + 360) % 360, true);

        return new Promise((resolve) => {
            const attemptSend = (attempt) => {
                const timeoutId = setTimeout(() => {
                    if (this._pendingMove && this._pendingMove.controlId === controlId) {
                        this._pendingMove = null;
                        this.isMoving = false;
                        if (attempt < retries) {
                            console.warn(`[toio] MoveTo (ID:${controlId}) timeout, retrying (${attempt + 1}/${retries})...`);
                            attemptSend(attempt + 1);
                        } else {
                            console.warn(`[toio] MoveTo (ID:${controlId}) timed out after ${retries} retries`);
                            resolve({ result: 0x01, resultStr: "Timeout" });
                        }
                    }
                }, 10000);

                this._pendingMove = {
                    controlId,
                    _timeoutId: timeoutId,
                    resolve: (res) => {
                        clearTimeout(timeoutId);
                        this.isMoving = false;
                        resolve(res);
                    }
                };

                this._enqueueWrite(() => this.characteristics.motor.writeValueWithoutResponse(buf))
                    .then(() => {
                        this.isMoving = true;
                        console.log(`[toio] Sent moveTo(ID:${controlId}) to (${x}, ${y}) angle ${angle}`);
                    })
                    .catch(err => {
                        clearTimeout(timeoutId);
                        if (this._pendingMove && this._pendingMove.controlId === controlId) {
                            this._pendingMove = null;
                        }
                        this.isMoving = false;
                        resolve({ result: 0xFF, resultStr: err.message });
                    });
            };

            attemptSend(0);
        });
    }

    /**
     * Move to target coordinate in 3 sequential steps:
     * 1. Rotate in place to face the target
     * 2. Move straight to the target (no rotation during travel)
     * 3. Rotate in place to the final angle
     */
    async moveTo(x, y, angle = 0) {
        if (!this.isConnected) return { result: 0xFF, resultStr: "Not connected" };

        const dx = x - this.x;
        const dy = y - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > 10) {
            const bearing = Math.round(((Math.atan2(dy, dx) * 180 / Math.PI) % 360 + 360) % 360);

            // Step 1: Rotate in place to face target
            const r1 = await this._sendMoveToTarget(this.x, this.y, bearing);
            if (r1.result === 0x04) return r1;
            if (r1.result !== 0x00) return r1;
            await this._waitForMotionComplete();

            // Step 2: Move straight to target (already facing the right direction, no rotation)
            const r2 = await this._sendMoveToTarget(x, y, bearing);
            if (r2.result === 0x04) return r2;
            if (r2.result !== 0x00) return r2;
            await this._waitForMotionComplete();
        }

        // Step 3: Rotate in place to final angle
        return await this._sendMoveToTarget(x, y, angle);
    }

    // --- Indicator Control ---

    /**
     * Set cube light color
     * @param {number} r 0-255
     * @param {number} g 0-255
     * @param {number} b 0-255
     * @param {number} durationMs
     */
    async setLight(r, g, b, durationMs = 0) {
        // 公開 API は走行中パターンを上書きする意図とみなしてキャンセルする
        this._cancelLightPattern();
        return this._writeLight(r, g, b, durationMs);
    }

    /**
     * LED に書き込むだけの内部メソッド。パターンループはこちらを使うことで
     * 自分自身をキャンセルしないようにする。
     */
    async _writeLight(r, g, b, durationMs = 0) {
        if (!this.isConnected) return;

        return new Promise((resolve) => {
            const sendFn = () => {
                let dur = durationMs > 0 ? Math.max(1, Math.floor(durationMs / 10)) : 0;
                if (dur > 255) dur = 255;
                const buf = new Uint8Array([0x03, dur, 0x01, 0x01, r, g, b]);
                return this.characteristics.light.writeValueWithoutResponse(buf).then(() => {
                    if (durationMs > 0) {
                        setTimeout(resolve, durationMs);
                    } else {
                        resolve();
                    }
                });
            };
            this._enqueueWrite(sendFn).catch(() => resolve());
        });
    }

    /**
     * JS-driven light animation.
     * toio の 0x04 (Repeat Operations) コマンドは仕様上 1 回の write が 20 バイト上限のため、
     * 3 フレーム以上 (3 + N*6) は cube に投げると silently drop される。
     * ここでは setLight を順次呼び出してフレームを再現する。
     *
     * @param {Array} frames - [{red, green, blue, duration_ms}, ...]
     * @param {number} repetitions - 0 = 無限ループ。次の light 系コマンドで停止。
     */
    async setLightPattern(frames, repetitions = 1) {
        if (!this.isConnected || !frames || frames.length === 0) return;

        // 既存パターンをキャンセル
        this._cancelLightPattern();

        const token = { cancelled: false };
        this._lightPatternToken = token;

        const runOnce = async () => {
            for (const f of frames) {
                if (token.cancelled || !this.isConnected) return;
                await this._writeLight(f.red || 0, f.green || 0, f.blue || 0, 0);
                await new Promise(r => setTimeout(r, f.duration_ms || 100));
            }
        };

        if (repetitions === 0) {
            // 無限ループ: バックグラウンド再生で即 resolve
            (async () => {
                while (!token.cancelled && this.isConnected) {
                    await runOnce();
                }
            })().catch(e => console.warn('[toio] light pattern loop error:', e));
            return;
        }

        const reps = Math.min(255, repetitions);
        for (let i = 0; i < reps; i++) {
            if (token.cancelled) break;
            await runOnce();
        }
        if (this._lightPatternToken === token) this._lightPatternToken = null;
    }

    _cancelLightPattern() {
        if (this._lightPatternToken) {
            this._lightPatternToken.cancelled = true;
            this._lightPatternToken = null;
        }
    }

    /** Cancel any running pattern and turn the LED off. */
    async clearLight() {
        this._cancelLightPattern();
        return this._writeLight(0, 0, 0, 0);
    }

    // --- Sound Control ---

    async playSound(noteId = 60, durationMs = 500) {
        if (!this.isConnected) return;
        if (!this.characteristics.sound) {
            console.warn('[toio] playSound: sound characteristic not available');
            return;
        }

        return new Promise((resolve, reject) => {
            const sendFn = () => {
                let dur = durationMs > 0 ? Math.floor(durationMs / 10) : 0;
                if (dur > 255) dur = 255;
                const buf = new Uint8Array([0x03, 0x01, 0x01, dur, noteId, 0xff]);
                return this.characteristics.sound.writeValueWithoutResponse(buf).then(() => {
                    setTimeout(resolve, durationMs);
                });
            };
            this._enqueueWrite(sendFn).catch((err) => {
                console.warn('[toio] playSound failed:', err.message || err);
                reject(err);
            });
        });
    }

    async playMelody(notes) {
        if (!this.isConnected || !notes || notes.length === 0) return;
        if (!this.characteristics.sound) {
            console.warn('[toio] playMelody: sound characteristic not available');
            return;
        }

        const BLE_MAX_NOTES = 16;
        let noteIdx = 0;
        let totalDurationMs = 0;
        console.log(`[toio] playMelody: starting ${notes.length} notes in batches of ${BLE_MAX_NOTES}`);

        return new Promise((resolve, reject) => {
            const sendNextBatch = () => {
                if (noteIdx >= notes.length) {
                    console.log(`[toio] playMelody: all ${noteIdx} notes sent, waiting ${totalDurationMs}ms for playback`);
                    setTimeout(resolve, totalDurationMs);
                    return Promise.resolve();
                }

                const batchSize = Math.min(BLE_MAX_NOTES, notes.length - noteIdx);
                let buf = new Uint8Array(3 + batchSize * 3);

                buf[0] = 0x03;
                buf[1] = 0x01;
                buf[2] = batchSize;

                for (let i = 0; i < batchSize; i++) {
                    const n = notes[noteIdx + i];
                    let durMs = n.duration_ms || 300;
                    let dur10ms = Math.max(1, Math.min(255, Math.floor(durMs / 10)));
                    totalDurationMs += durMs;

                    let offset = 3 + i * 3;
                    buf[offset] = dur10ms;
                    buf[offset+1] = n.note || 60;
                    buf[offset+2] = 0xff;
                }

                const currentBatch = noteIdx / BLE_MAX_NOTES + 1;
                console.log(`[toio] playMelody: sending batch ${currentBatch}, notes ${noteIdx}-${noteIdx + batchSize - 1}`);
                noteIdx += batchSize;
                return this.characteristics.sound.writeValueWithoutResponse(buf);
            };

            this._enqueueWrite(() => {
                const recursiveSend = () => {
                    return sendNextBatch().then(() => {
                        if (noteIdx < notes.length) {
                            return new Promise(r => setTimeout(r, 200)).then(() => recursiveSend());
                        }
                    });
                };
                return recursiveSend();
            }).catch((err) => {
                console.error('[toio] playMelody failed:', err.name || 'Unknown', '-', err.message || err);
                reject(err);
            });
        });
    }

    // --- Info ---

    async getBattery() {
        if (!this.isConnected) return 0;
        const dataview = await this.characteristics.battery.readValue();
        const battery = dataview.getUint8(0);
        if (this.onBatteryUpdateCallback) this.onBatteryUpdateCallback(battery);
        return battery;
    }
}
