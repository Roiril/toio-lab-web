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
            id: null,
            motor: null,
            light: null,
            sound: null,
            battery: null,
            button: null
        };

        // State
        this.x = 0;
        this.y = 0;
        this.angle = 0;
        this.isMoving = false;

        this.onDisconnectCallback = null;
        this.onBatteryUpdateCallback = null;
        this.onButtonUpdateCallback = null;
        this.onIdUpdateCallback = null;
        this._pendingMove = null;
    }

    get isConnected() {
        return this.device && this.device.gatt.connected;
    }

    async connect() {
        try {
            console.log("Requesting toio Bluetooth Device...");
            this.device = await navigator.bluetooth.requestDevice({
                filters: [{ services: [TOIO_SERVICE_UUID] }]
            });

            this.device.addEventListener('gattserverdisconnected', () => {
                console.log("toio disconnected");
                if (this.onDisconnectCallback) this.onDisconnectCallback();
                this._cleanup();
            });

            console.log("Connecting to GATT Server...");
            this.server = await this.device.gatt.connect();

            console.log("Getting Service...");
            this.service = await this.server.getPrimaryService(TOIO_SERVICE_UUID);

            console.log("Getting Characteristics...");
            this.characteristics.id = await this.service.getCharacteristic(POSITION_ID_CHAR_UUID);
            this.characteristics.motor = await this.service.getCharacteristic(MOTOR_CHAR_UUID);
            this.characteristics.light = await this.service.getCharacteristic(LIGHT_CHAR_UUID);
            this.characteristics.sound = await this.service.getCharacteristic(SOUND_CHAR_UUID);
            this.characteristics.battery = await this.service.getCharacteristic(BATTERY_CHAR_UUID);
            this.characteristics.button = await this.service.getCharacteristic(BUTTON_CHAR_UUID);

            // Enable Notifications
            await this.characteristics.id.startNotifications();
            this.characteristics.id.addEventListener('characteristicvaluechanged', this._handleIdUpdate.bind(this));

            await this.characteristics.motor.startNotifications();
            this.characteristics.motor.addEventListener('characteristicvaluechanged', this._handleMotorUpdate.bind(this));

            await this.characteristics.battery.startNotifications();
            this.characteristics.battery.addEventListener('characteristicvaluechanged', this._handleBatteryUpdate.bind(this));

            await this.characteristics.button.startNotifications();
            this.characteristics.button.addEventListener('characteristicvaluechanged', this._handleButtonUpdate.bind(this));

            console.log("toio Connected!");

            // Trigger initial battery read safely with a slight delay
            setTimeout(async () => {
                try {
                    await this.getBattery();
                } catch (e) {
                    console.warn("Initial battery read failed, but connection is OK.", e);
                }
            }, 500);

            return true;
        } catch (error) {
            console.error("Connection failed:", error);
            this.disconnect();
            throw error;
        }
    }

    disconnect() {
        if (this.device && this.device.gatt.connected) {
            this.device.gatt.disconnect();
        } else {
            this._cleanup();
        }
    }

    _cleanup() {
        this.device = null;
        this.server = null;
        this.service = null;
        this.characteristics = {
            id: null,
            motor: null,
            light: null,
            sound: null,
            battery: null,
            button: null
        };
        this._pendingMove = null;
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
                // [0x83, ControlID, Result]
                const result = dv.getUint8(2);
                console.log(`[toio] Motor move response: 0x${result.toString(16).padStart(2, '0')}`);
                
                if (this._pendingMove) {
                    this._pendingMove.resolve(result);
                    this._pendingMove = null;
                }
            }
        } catch (e) {
            console.warn("Motor update parse error:", e);
        }
    }

    _handleBatteryUpdate(event) {
        const value = event.target.value.getUint8(0);
        if (this.onBatteryUpdateCallback) {
            this.onBatteryUpdateCallback(value);
        }
    }

    _handleButtonUpdate(event) {
        try {
            const dv = event.target.value;
            // toio button characteristic: byte0 = info type (0x01), byte1 = state (0x00 or 0x80)
            // Some firmware versions may send only 1 byte
            let isPressed = false;
            if (dv.byteLength >= 2) {
                isPressed = dv.getUint8(1) === 0x80;
            } else if (dv.byteLength === 1) {
                isPressed = dv.getUint8(0) === 0x80;
            }
            if (this.onButtonUpdateCallback) {
                this.onButtonUpdateCallback(isPressed);
            }
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
            if(dur > 255) dur = 255;
            
            const buf = new Uint8Array([0x02, 0x01, leftDir, lSpd, 0x02, rightDir, rSpd, dur]);
            await this.characteristics.motor.writeValueWithoutResponse(buf);

            return new Promise(resolve => {
                setTimeout(() => {
                    this.isMoving = false;
                    resolve();
                }, durationMs + 50);
            });
        } else {
            const buf = new Uint8Array([0x01, 0x01, leftDir, lSpd, 0x02, rightDir, rSpd]);
            await this.characteristics.motor.writeValueWithoutResponse(buf);
            return Promise.resolve();
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
     * @returns {Promise<number>} Result code from toio (0x00 = success)
     */
    async moveTo(x, y, angle = 0) {
        if (!this.isConnected) return 0xFF;

        const buf = new Uint8Array(13);
        buf[0] = 0x03; // Targeted move
        buf[1] = 0x00; // Control ID
        buf[2] = 0x00; // Timeout
        buf[3] = 0x01; // Movement type (Target + Angle)
        buf[4] = 0x50; // Max speed
        buf[5] = 0x00; // Speed type
        buf[6] = 0x00; // Reserved
        
        const dv = new DataView(buf.buffer);
        dv.setUint16(7, x, true);
        dv.setUint16(9, y, true);
        dv.setUint16(11, angle, true);

        return new Promise((resolve) => {
            // Safety timeout (15 seconds)
            const timeout = setTimeout(() => {
                if (this._pendingMove) {
                    console.warn("[toio] MoveTo timed out after 15s");
                    this._pendingMove = null;
                    this.isMoving = false;
                    resolve(0x01); // 0x01 = Timeout
                }
            }, 15000);

            this._pendingMove = {
                resolve: (result) => {
                    clearTimeout(timeout);
                    this.isMoving = false;
                    resolve(result);
                }
            };

            this.characteristics.motor.writeValueWithoutResponse(buf)
                .then(() => {
                    this.isMoving = true;
                })
                .catch(err => {
                    console.error("[toio] moveTo write failed:", err);
                    clearTimeout(timeout);
                    this._pendingMove = null;
                    this.isMoving = false;
                    resolve(0xFF);
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
        
        // 0x03: turn on/off light
        // duration: (durationMs / 10). 0 means infinite. Max 255 (2.55s). If larger, limit it.
        let dur = durationMs > 0 ? Math.floor(durationMs / 10) : 0;
        if(dur > 255) dur = 255;

        // Command: 0x03, duration, count(0x01), 0x01(always on), r, g, b
        const buf = new Uint8Array([0x03, dur, 0x01, 0x01, r, g, b]);
        await this.characteristics.light.writeValueWithoutResponse(buf);
        
        if (durationMs > 0) {
            return new Promise(resolve => setTimeout(resolve, durationMs));
        }
    }

    // --- Sound Control ---

    async playSound(noteId = 60, durationMs = 500) {
        if (!this.isConnected) return;

        // Note: 0-128 (MIDI note number)
        // Note volume: 0-255
        let dur = durationMs > 0 ? Math.floor(durationMs / 10) : 0;
        if(dur > 255) dur = 255;

        const buf = new Uint8Array([0x03, 0x01, dur, noteId, 0xff]);
        await this.characteristics.sound.writeValueWithoutResponse(buf);

        return new Promise(resolve => setTimeout(resolve, durationMs));
    }

    // --- Info ---

    async getBattery() {
        if (!this.isConnected) return 0;
        const dataview = await this.characteristics.battery.readValue();
        const battery = dataview.getUint8(0);
        if (this.onBatteryUpdateCallback) {
            this.onBatteryUpdateCallback(battery);
        }
        return battery;
    }
}
