class Environment {
    constructor(toioSim, toioBle, spatialAwareness) {
        this.sim = toioSim;
        this.ble = toioBle;
        this.spatial = spatialAwareness;
    }

    getSnapshot() {
        // Sim position is always authoritative — it reflects completed moves synchronously.
        // BLE Notification updates arrive asynchronously and may lag behind the physical cube,
        // causing stale coordinates when snapshots are taken immediately after a moveTo.
        const pos = this.sim.getPosition();
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
