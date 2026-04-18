class Environment {
    constructor(toioSim, toioBle, spatialAwareness) {
        this.sim = toioSim;
        this.ble = toioBle;
        this.spatial = spatialAwareness;
    }

    getSnapshot() {
        // BLE position (from mat notifications) is authoritative when connected.
        // Sim position is used only in simulator-only mode.
        const pos = this.ble.isConnected
            ? { x: this.ble.x, y: this.ble.y, angle: this.ble.angle }
            : this.sim.getPosition();
        const isMoving = this.ble.isMoving || this.sim.isMoving;

        return {
            cube: { x: pos.x, y: pos.y, angle: pos.angle, isConnected: this.ble.isConnected, isMoving },
            spatial: this.spatial.getDynamicContext(pos.x, pos.y, pos.angle),
            timestamp: Date.now()
        };
    }

    describe() {
        const snap = this.getSnapshot();
        return `環境状態:\n` + snap.spatial;
    }
}
