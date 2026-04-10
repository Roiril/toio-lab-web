/**
 * Web Bluetooth wrapper for toio™ Core Cube
 * Reference: https://toio.github.io/toio-spec/en/
 */

const TOIO_SERVICE_UUID = "10b20100-5b3b-4571-9508-cf3efcd7bbae";
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
            motor: null,
            light: null,
            sound: null,
            battery: null,
            button: null
        };
        this.onDisconnectCallback = null;
        this.onBatteryUpdateCallback = null;
        this.onButtonUpdateCallback = null;
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
            this.characteristics.motor = await this.service.getCharacteristic(MOTOR_CHAR_UUID);
            this.characteristics.light = await this.service.getCharacteristic(LIGHT_CHAR_UUID);
            this.characteristics.sound = await this.service.getCharacteristic(SOUND_CHAR_UUID);
            this.characteristics.battery = await this.service.getCharacteristic(BATTERY_CHAR_UUID);
            this.characteristics.button = await this.service.getCharacteristic(BUTTON_CHAR_UUID);

            // Enable Notifications
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
            motor: null,
            light: null,
            sound: null,
            battery: null,
            button: null
        };
    }

    // --- Private Handlers ---

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

        // Map -100~100 to parameter format
        // direction: 0x01(forward), 0x02(backward)
        // speed: mapped to 0-255. Let's use 0-100 directly for simplicity.
        
        const leftDir = leftSpeed >= 0 ? 0x01 : 0x02;
        const rightDir = rightSpeed >= 0 ? 0x01 : 0x02;
        const lSpd = Math.min(255, Math.abs(leftSpeed));
        const rSpd = Math.min(255, Math.abs(rightSpeed));

        if (durationMs > 0) {
            // Motor control with specified duration
            let dur = Math.floor(durationMs / 10);
            if(dur > 255) dur = 255; // Max 2.55s per command
            
            const buf = new Uint8Array([0x02, 0x01, leftDir, lSpd, 0x02, rightDir, rSpd, dur]);
            await this.characteristics.motor.writeValueWithoutResponse(buf);

            // Wait for completion if duration is set (roughly)
            return new Promise(resolve => setTimeout(resolve, durationMs + 50));
        } else {
            // Continuous motion
            const buf = new Uint8Array([0x01, 0x01, leftDir, lSpd, 0x02, rightDir, rSpd]);
            await this.characteristics.motor.writeValueWithoutResponse(buf);
            return Promise.resolve();
        }
    }

    async stop() {
        return this.move(0, 0, 0);
    }

    async spin(speed, durationMs, direction = 'cw') {
        const s = direction === 'cw' ? speed : -speed;
        return this.move(s, -s, durationMs);
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
