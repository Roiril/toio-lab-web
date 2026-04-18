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
        this._writeQueue = Promise.resolve(); // serializes BLE writes to avoid GATT race conditions

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
            console.warn('[toio] BLE write error:', e);
            throw e;
        });
        // Keep queue alive even when a write fails
        this._writeQueue = queued.then(() => {}, () => {});
        return queued;
    }

    async connect() {
        try {
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
    }

    // --- Private Handlers ---

    _handleIdUpdate(event) {
        try {
            const dv = event.target.value;
            const type = dv.getUint8(0);
            if (type === 0x01) { // Position ID
                this.x = dv.getUint16(1, true);
                this.y = dv.getUint16(3, true);
                this.angle = dv.getUint16(5, true);
                if (this.onIdUpdateCallback) {
                    this.onIdUpdateCallback({ x: this.x, y: this.y, angle: this.angle });
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

        if (durationMs > 0) {
            let dur = Math.floor(durationMs / 10);
            if (dur > 255) dur = 255;
            const buf = new Uint8Array([0x02, 0x01, leftDir, lSpd, 0x02, rightDir, rSpd, dur]);
            await this._enqueueWrite(() => this.characteristics.motor.writeValueWithoutResponse(buf));
            return new Promise(resolve => {
                setTimeout(() => { this.isMoving = false; resolve(); }, durationMs + 50);
            });
        } else {
            const buf = new Uint8Array([0x01, 0x01, leftDir, lSpd, 0x02, rightDir, rSpd]);
            await this._enqueueWrite(() => this.characteristics.motor.writeValueWithoutResponse(buf));
        }
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
     * Move to target coordinate
     * @param {number} x Mat coordinate X
     * @param {number} y Mat coordinate Y
     * @param {number} angle Angle 0-360
     * @returns {Promise<{result: number, resultStr: string}>}
     */
    async moveTo(x, y, angle = 0) {
        if (!this.isConnected) return { result: 0xFF, resultStr: "Not connected" };

        // Cancel any in-flight moveTo before issuing a new one to prevent Promise leaks
        if (this._pendingMove) {
            if (this._pendingMove._timeoutId) clearTimeout(this._pendingMove._timeoutId);
            this._pendingMove.resolve({ result: 0x04, resultStr: "Interrupted by new command" });
            this._pendingMove = null;
        }

        const controlId = this._getNextControlId();
        const buf = new Uint8Array(13);
        buf[0] = 0x03; // Targeted move
        buf[1] = controlId;
        buf[2] = 0x00; // No firmware timeout; we use our own 15s timeout
        buf[3] = 0x01; // Movement type (Target + Angle)
        buf[4] = 0x50; // Max speed (80)
        buf[5] = 0x00; // Speed type (Uniform speed)
        buf[6] = 0x00; // Reserved

        const dv = new DataView(buf.buffer);
        dv.setUint16(7, x, true);
        dv.setUint16(9, y, true);
        const normalizedAngle = ((angle % 360) + 360) % 360;
        dv.setUint16(11, normalizedAngle, true);

        return new Promise((resolve) => {
            const timeoutId = setTimeout(() => {
                if (this._pendingMove && this._pendingMove.controlId === controlId) {
                    console.warn(`[toio] MoveTo (ID:${controlId}) timed out after 15s`);
                    this._pendingMove = null;
                    this.isMoving = false;
                    resolve({ result: 0x01, resultStr: "Timeout" });
                }
            }, 15000);

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
        });
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
        if (!this.isConnected) return;
        let dur = durationMs > 0 ? Math.floor(durationMs / 10) : 0;
        if (dur > 255) dur = 255;
        const buf = new Uint8Array([0x03, dur, 0x01, 0x01, r, g, b]);
        await this._enqueueWrite(() => this.characteristics.light.writeValueWithoutResponse(buf));
        if (durationMs > 0) {
            return new Promise(resolve => setTimeout(resolve, durationMs));
        }
    }

    async setLightPattern(frames, repetitions = 1) {
        if (!this.isConnected || !frames || frames.length === 0) return;
        
        let reps = Math.min(255, repetitions);
        let numFrames = Math.min(29, frames.length); // Max 29 frames per characteristic size limit 
        
        let buf = new Uint8Array(3 + numFrames * 6);
        buf[0] = 0x04; // Continuous turn on
        buf[1] = reps;
        buf[2] = numFrames;
        
        let totalDurationMs = 0;
        for (let i = 0; i < numFrames; i++) {
            const f = frames[i];
            let durMs = f.duration_ms || 100;
            let dur10ms = Math.min(255, Math.floor(durMs / 10));
            totalDurationMs += durMs;
            
            let offset = 3 + i * 6;
            buf[offset] = dur10ms;
            buf[offset+1] = 0x01; // Light count (always 1 for toio)
            buf[offset+2] = 0x01; // Light ID
            buf[offset+3] = f.red || 0;
            buf[offset+4] = f.green || 0;
            buf[offset+5] = f.blue || 0;
        }
        
        await this._enqueueWrite(() => this.characteristics.light.writeValueWithoutResponse(buf));
        
        if (reps > 0) {
            return new Promise(resolve => setTimeout(resolve, totalDurationMs * reps));
        }
    }

    // --- Sound Control ---

    async playSound(noteId = 60, durationMs = 500) {
        if (!this.isConnected) return;
        let dur = durationMs > 0 ? Math.floor(durationMs / 10) : 0;
        if (dur > 255) dur = 255;
        const buf = new Uint8Array([0x03, 0x01, dur, noteId, 0xff]);
        await this._enqueueWrite(() => this.characteristics.sound.writeValueWithoutResponse(buf));
        return new Promise(resolve => setTimeout(resolve, durationMs));
    }

    async playMelody(notes) {
        if (!this.isConnected || !notes || notes.length === 0) return;
        
        let numNotes = Math.min(59, notes.length); // Max 59 operations per characteristic size limit 
        let buf = new Uint8Array(3 + numNotes * 3);
        
        buf[0] = 0x03; // MIDI Note sequence
        buf[1] = 0x01; // Repeat count
        buf[2] = numNotes; // Operation count
        
        let totalDurationMs = 0;
        for (let i = 0; i < numNotes; i++) {
            const n = notes[i];
            let durMs = n.duration_ms || 300;
            let dur10ms = Math.max(1, Math.min(255, Math.floor(durMs / 10)));
            totalDurationMs += durMs;
            
            let offset = 3 + i * 3;
            buf[offset]   = dur10ms;
            buf[offset+1] = n.note || 60; // Note ID
            buf[offset+2] = 0xff;         // Volume
        }
        
        await this._enqueueWrite(() => this.characteristics.sound.writeValueWithoutResponse(buf));
        return new Promise(resolve => setTimeout(resolve, totalDurationMs));
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
