/**
 * Utility class to multicast commands to both virtual Sim and physical BLE cube.
 */
class ToioCombined {
    constructor(toioSim, toioBle) {
        this.sim = toioSim;
        this.ble = toioBle;
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

    async stop() {
        await Promise.all([
            this.sim.stop(),
            this.ble.isConnected ? this.ble.stop() : Promise.resolve()
        ]);
    }

    async spin(speed, durationMs, direction) {
        await Promise.all([
            this.sim.spin(speed, durationMs, direction),
            this.ble.isConnected ? this.ble.spin(speed, durationMs, direction) : Promise.resolve()
        ]);
    }

    async setLight(r, g, b, durationMs) {
        await Promise.all([
            this.sim.setLight(r, g, b, durationMs),
            this.ble.isConnected ? this.ble.setLight(r, g, b, durationMs) : Promise.resolve()
        ]);
    }

    async playSound(noteId, durationMs) {
        await Promise.all([
            this.sim.playSound(noteId, durationMs),
            this.ble.isConnected ? this.ble.playSound(noteId, durationMs) : Promise.resolve()
        ]);
    }

    async moveTo(x, y, angle) {
        await Promise.all([
            this.sim.moveTo(x, y, angle),
            this.ble.isConnected ? this.ble.moveTo(x, y, angle) : Promise.resolve()
        ]);
    }

    async getBattery() {
        if (this.ble.isConnected) {
            return await this.ble.getBattery();
        }
        return await this.sim.getBattery();
    }
}
