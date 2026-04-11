/**
 * Simulator class for toio™ Core Cube in Browser
 */
class ToioSim {
    constructor() {
        this.cubeElement = document.getElementById('sim-cube');
        this.matElement = document.getElementById('simulation-mat');
        
        // Initial state in MAT COORDINATES (X: 45-465, Y: 45-345)
        this.x = 255;
        this.y = 195;
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
        return true;
    }

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

    async moveTo(matX, matY, angle = 0) {
        const dx = matX - this.x;
        const dy = matY - this.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // Time based on distance
        const delayMs = Math.max(500, (distance / 100) * 1000); 
        
        return new Promise(resolve => {
            setTimeout(() => {
                this.x = matX;
                this.y = matY;
                this.angle = angle;
                this._render();
                resolve(0x00);
            }, delayMs);
        });
    }

    // --- Coordinate Mapping ---
    matToSim(matX, matY) {
        const matMinX = 45, matMaxX = 465;
        const matMinY = 45, matMaxY = 345;
        const simW = this.matElement?.clientWidth || 700;
        const simH = this.matElement?.clientHeight || 500;

        const sx = ((matX - matMinX) / (matMaxX - matMinX)) * simW;
        const sy = ((matY - matMinY) / (matMaxY - matMinY)) * simH;
        return { x: sx, y: sy };
    }

    simToMat(simX, simY) {
        const matMinX = 45, matMaxX = 465;
        const matMinY = 45, matMaxY = 345;
        const simW = this.matElement?.clientWidth || 700;
        const simH = this.matElement?.clientHeight || 500;

        const mx = Math.round((simX / simW) * (matMaxX - matMinX) + matMinX);
        const my = Math.round((simY / simH) * (matMaxY - matMinY) + matMinY);
        return { x: mx, y: my };
    }


    async setLight(r, g, b, durationMs = 0) {
        if (this.cubeElement) {
            const color = `rgb(${r}, ${g}, ${b})`;
            this.cubeElement.style.borderTop = `4px solid ${color}`;
            this.cubeElement.style.boxShadow = `0 0 10px ${color}`;
        }
        return Promise.resolve();
    }

    async playSound(noteId = 60, durationMs = 500) {
        if (this.cubeElement) {
            this.cubeElement.classList.add('pulse');
            setTimeout(() => this.cubeElement.classList.remove('pulse'), 200);
        }
        return new Promise(resolve => setTimeout(resolve, durationMs));
    }

    async getBattery() {
        return this.battery;
    }

    getPosition() {
        return { x: Math.round(this.x), y: Math.round(this.y), angle: Math.round(this.angle) };
    }

    // --- Private Simulation Logic ---
    _update(time) {
        const dt = (time - this.lastTime) / 1000;
        this.lastTime = time;

        if (this.isMoving) {
            const linearScale = 2.0; 
            const angularScale = 0.5;

            const vL = this.leftSpeed * linearScale;
            const vR = this.rightSpeed * linearScale;

            const v = (vL + vR) / 2;
            const omega = (vR - vL) * angularScale;

            this.angle += omega * dt * 10;
            const rad = (this.angle - 90) * Math.PI / 180;
            
            this.x += v * Math.cos(rad) * dt;
            this.y += v * Math.sin(rad) * dt;

            // mat boundary check
            const matMinX = 98, matMaxX = 402;
            const matMinY = 142, matMaxY = 358;
            this.x = Math.max(matMinX, Math.min(matMaxX, this.x));
            this.y = Math.max(matMinY, Math.min(matMaxY, this.y));

            this._render();
        } else {
            // Always render to handle window resizing even when not moving
            this._render();
        }

        requestAnimationFrame(this._update.bind(this));
    }

    _render() {
        if (!this.cubeElement || !this.matElement) return;
        const simPos = this.matToSim(this.x, this.y);
        this.cubeElement.style.left = `${simPos.x}px`;
        this.cubeElement.style.top = `${simPos.y}px`;
        this.cubeElement.style.transform = `translate(-50%, -50%) rotate(${this.angle}deg)`;
    }
}
