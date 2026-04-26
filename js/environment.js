class Environment {
    constructor(toioSim, toioBle, spatialAwareness, options = {}) {
        this.sim = toioSim;
        this.ble = toioBle || { isConnected: false };
        this.spatial = spatialAwareness;
        // 2台モード時に相棒キューブの位置情報を含めるための参照。
        // { sim: ToioSim, ble?: ToioBLE, name: string } 形式。setPeer() で後付け可能。
        this.peer = options.peer || null;
        this.selfName = options.selfName || null;
    }

    setPeer(peer) { this.peer = peer; }

    _readCubePos(sim, ble) {
        return ble && ble.isConnected
            ? { x: ble.x, y: ble.y, angle: ble.angle }
            : sim.getPosition();
    }

    getSnapshot() {
        // BLE position (from mat notifications) is authoritative when connected.
        // Sim position is used only in simulator-only mode.
        const pos = this._readCubePos(this.sim, this.ble);
        const isMoving = (this.ble && this.ble.isMoving) || this.sim.isMoving;

        const snap = {
            cube: { x: pos.x, y: pos.y, angle: pos.angle, isConnected: !!(this.ble && this.ble.isConnected), isMoving },
            spatial: this.spatial.getDynamicContext(pos.x, pos.y, pos.angle),
            timestamp: Date.now()
        };

        if (this.peer) {
            const ppos = this._readCubePos(this.peer.sim, this.peer.ble);
            snap.peer = { name: this.peer.name, x: ppos.x, y: ppos.y, angle: ppos.angle };
        }

        return snap;
    }

    describe() {
        const snap = this.getSnapshot();
        let out = `環境状態:\n` + snap.spatial;
        if (snap.peer) {
            out += `\n相棒「${snap.peer.name}」の位置: (${snap.peer.x}, ${snap.peer.y}), 角度: ${snap.peer.angle}°`;
        }
        return out;
    }
}
