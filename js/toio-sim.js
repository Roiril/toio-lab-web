/**
 * Simulator class for toio™ Core Cube in Browser
 */
class ToioSim {
    constructor() {
        this.cubeElement = document.getElementById('sim-cube');
        this.matElement = document.getElementById('simulation-mat');
        
        // Initial state (Mat coordinate system roughly 0-400)
        this.x = 200;
        this.y = 200;
        this.angle = 0; // Degrees
        
        this.leftSpeed = 0;
        this.rightSpeed = 0;
        this.isMoving = false;
        
        this.battery = 100;
        this.onBatteryUpdateCallback = null;
        
        // Simulation loop
        this.lastTime = performance.now();
        requestAnimationFrame(this._update.bind(this));
        
        this._render();
    }

    get isConnected() {
        // Simulator is "always connected" when active
        return true;
    }

    /**
     * Move with specified speeds and duration
     */
    async move(leftSpeed, rightSpeed, durationMs = 0) {
        this.leftSpeed = leftSpeed;
        this.rightSpeed = rightSpeed;
        this.isMoving = (leftSpeed !== 0 || rightSpeed !== 0);

        if (durationMs > 0) {
            return new Promise(resolve => {
                setTimeout(() => {
                    this.stop();
                    resolve();
                }, durationMs);
            });
        }
        return Promise.resolve();
    }

    async stop() {
        this.leftSpeed = 0;
        this.rightSpeed = 0;
        this.isMoving = false;
        return Promise.resolve();
    }

    async spin(speed, durationMs, direction = 'cw') {
        const s = direction === 'cw' ? speed : -speed;
        return this.move(s, -s, durationMs);
    }

    // --- Coordinate Mapping ---
    // Simple mat area coordinate range: X(98-402), Y(142-358)
    // Sim pixel range: 0-400 (default)

    matToSim(matX, matY) {
        const matMinX = 98, matMaxX = 402;
        const matMinY = 142, matMaxY = 358;
        const simW = this.matElement?.clientWidth || 400;
        const simH = this.matElement?.clientHeight || 400;

        const x = ((matX - matMinX) / (matMaxX - matMinX)) * simW;
        const y = ((matY - matMinY) / (matMaxY - matMinY)) * simH;
        return { x, y };
    }

    simToMat(simX, simY) {
        const matMinX = 98, matMaxX = 402;
        const matMinY = 142, matMaxY = 358;
        const simW = this.matElement?.clientWidth || 400;
        const simH = this.matElement?.clientHeight || 400;

        const x = Math.round((simX / simW) * (matMaxX - matMinX) + matMinX);
        const y = Math.round((simY / simH) * (matMaxY - matMinY) + matMinY);
        return { x, y };
    }


    async setLight(r, g, b, durationMs = 0) {
        if (this.cubeElement) {
            const color = `rgb(${r}, ${g}, ${b})`;
            this.cubeElement.style.borderTop = `4px solid ${color}`;
            this.cubeElement.style.boxShadow = `0 0 10px ${color}`;
        }
        
        if (durationMs > 0) {
            return new Promise(resolve => {
                setTimeout(() => {
                    // Reset or leave as is? Let's leave for now.
                    resolve();
                }, durationMs);
            });
        }
    }

    async playSound(noteId = 60, durationMs = 500) {
        console.log(`[Sim] Playing sound: note ${noteId} for ${durationMs}ms`);
        // Visual feedback for sound? Maybe a little shake or pulse.
        if (this.cubeElement) {
            this.cubeElement.classList.add('pulse');
            setTimeout(() => this.cubeElement.classList.remove('pulse'), 200);
        }
        return new Promise(resolve => setTimeout(resolve, durationMs));
    }

    async getBattery() {
        return this.battery;
    }

    // --- Private Simulation Logic ---

    _update(time) {
        const dt = (time - this.lastTime) / 1000; // seconds
        this.lastTime = time;

        if (this.isMoving) {
            // Simplified differential drive model
            // Constants to map "speed 0-100" to "pixels/sec"
            const linearScale = 1.0; 
            const angularScale = 0.5;

            const vL = this.leftSpeed * linearScale;
            const vR = this.rightSpeed * linearScale;

            const v = (vL + vR) / 2;
            const omega = (vR - vL) * angularScale;

            // Update angle (degrees)
            this.angle += omega * dt * 10; // Extra gain for feeling
            
            // Convert angle to radians for movement
            const rad = (this.angle - 90) * Math.PI / 180; // -90 because 0 deg is right in math, but top in our CSS usually
            
            this.x += v * Math.cos(rad) * dt * 5;
            this.y += v * Math.sin(rad) * dt * 5;

            // Boundary check
            const matWidth = this.matElement?.clientWidth || 400;
            const matHeight = this.matElement?.clientHeight || 400;
            this.x = Math.max(20, Math.min(matWidth - 20, this.x));
            this.y = Math.max(20, Math.min(matHeight - 20, this.y));

            this._render();
        }

        requestAnimationFrame(this._update.bind(this));
    }

    _render() {
        if (!this.cubeElement) return;
        this.cubeElement.style.left = `${this.x}px`;
        this.cubeElement.style.top = `${this.y}px`;
        this.cubeElement.style.transform = `translate(-50%, -50%) rotate(${this.angle}deg)`;
    }
}
