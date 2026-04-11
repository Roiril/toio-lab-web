class Environment {
    constructor(toioSim, toioBle, spatialAwareness) {
        this.sim = toioSim;
        this.ble = toioBle;
        this.spatial = spatialAwareness;
    }

    getSnapshot() {
        let x, y, angle;
        let isMoving = this.ble.isMoving || this.sim.isMoving;
        
        if (this.ble.isConnected) {
            x = this.ble.x;
            y = this.ble.y;
            angle = this.ble.angle;
        } else {
            const pos = this.sim.getPosition();
            x = pos.x;
            y = pos.y;
            angle = pos.angle;
        }

        return {
            cube: { x, y, angle, isConnected: this.ble.isConnected, isMoving }, // Note: battery might require async fetch, so we skip here
            spatial: this.spatial.getDynamicContext(x, y, angle),
            timestamp: Date.now()
        };
    }

    describe() {
        const snap = this.getSnapshot();
        return `環境状態:\n` + snap.spatial;
    }
}
