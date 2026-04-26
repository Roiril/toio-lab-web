/**
 * Utility class to multicast commands to both virtual Sim and physical BLE cube.
 */
class ToioCombined {
    constructor(toioSim, toioBle) {
        this.sim = toioSim;
        // ble が未指定の場合は「常に未接続」のスタブ。Sim 専用キューブ（イオ）で利用。
        this.ble = toioBle || { isConnected: false };
    }

    get isConnected() {
        // Simulator is always considered available.
        return true;
    }

    async move(left, right, durationMs) {
        await Promise.all([
            this.sim.move(left, right, durationMs),
            this.ble.isConnected ? this.ble.move(left, right, durationMs) : Promise.resolve()
        ]);
    }

    _bleSafe(promise, label) {
        return promise.catch(e => console.warn(`[BLE] ${label} failed (non-fatal):`, e.message));
    }

    async stop() {
        await Promise.all([
            this.sim.stop(),
            this.ble.isConnected ? this._bleSafe(this.ble.stop(), 'stop') : Promise.resolve()
        ]);
    }

    async spin(speed, durationMs, direction) {
        await Promise.all([
            this.sim.spin(speed, durationMs, direction),
            this.ble.isConnected ? this._bleSafe(this.ble.spin(speed, durationMs, direction), 'spin') : Promise.resolve()
        ]);
    }

    async setLight(r, g, b, durationMs) {
        await Promise.all([
            this.sim.setLight(r, g, b, durationMs),
            this.ble.isConnected ? this._bleSafe(this.ble.setLight(r, g, b, durationMs), 'setLight') : Promise.resolve()
        ]);
    }

    async playSound(noteId, durationMs) {
        await Promise.all([
            this.sim.playSound(noteId, durationMs),
            this.ble.isConnected ? this._bleSafe(this.ble.playSound(noteId, durationMs), 'playSound') : Promise.resolve()
        ]);
    }

    async playMelody(notes) {
        const blePromise = this.ble.isConnected && this.ble.playMelody
            ? this.ble.playMelody(notes)
            : Promise.resolve();

        await Promise.all([
            this.sim.playMelody(notes),
            blePromise
        ]);
    }

    async clearLight() {
        await Promise.all([
            this.sim.clearLight ? this.sim.clearLight() : this.sim.setLight(0, 0, 0, 0),
            this.ble.isConnected && this.ble.clearLight
                ? this._bleSafe(this.ble.clearLight(), 'clearLight')
                : Promise.resolve()
        ]);
    }

    async setLightPattern(frames, repetitions) {
        await Promise.all([
            this.sim.setLightPattern(frames, repetitions),
            this.ble.isConnected && this.ble.setLightPattern
                ? this._bleSafe(this.ble.setLightPattern(frames, repetitions), 'setLightPattern')
                : Promise.resolve()
        ]);
    }

    async moveTo(x, y, angle) {
        const blePromise = this.ble.isConnected
            ? this._bleSafe(this.ble.moveTo(x, y, angle), 'moveTo')
            : Promise.resolve(null);
        const [, bleResult] = await Promise.all([
            this.sim.moveTo(x, y, angle),
            blePromise
        ]);
        // Return BLE result when connected and succeeded; otherwise synthesize from sim
        return this.ble.isConnected && bleResult != null
            ? bleResult
            : { result: 0x00, resultStr: "Success" };
    }

    async getBattery() {
        if (this.ble.isConnected) {
            return await this.ble.getBattery();
        }
        return await this.sim.getBattery();
    }
}
