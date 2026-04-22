/**
 * Simulator class for toio™ Core Cube in Browser
 */
class ToioSim {
    constructor(spatialAwareness = null) {
        this.spatial = spatialAwareness;
        this.cubeElement = document.getElementById('sim-cube');
        this.matElement = document.getElementById('simulation-mat');
        
        // Initial state in MAT COORDINATES (X: 98-402, Y: 142-358 for Simple Mat)
        this.x = 250;
        this.y = 250;
        this.angle = 0; // Degrees
        
        this.leftSpeed = 0;
        this.rightSpeed = 0;
        this.isMoving = false;
        
        this.battery = 100;
        this.onBatteryUpdateCallback = null;
        
        // Simulation loop
        this.lastTime = performance.now();
        this._boundUpdate = this._update.bind(this);
        requestAnimationFrame(this._boundUpdate);
        
        this._lightTimeoutId = null;
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

    /**
     * Wait for motion to complete by detecting position stability.
     * Monitors position updates until coordinates stop changing for 100ms.
     */
    async _waitForMotionComplete(maxWaitMs = 3000) {
        return new Promise(resolve => {
            const startTime = performance.now();
            let lastX = this.x;
            let lastY = this.y;
            let lastAngle = this.angle;
            let stableMs = 0;
            const requiredStableMs = 100;

            const checkStability = () => {
                const elapsed = performance.now() - startTime;

                if (this.x === lastX && this.y === lastY && this.angle === lastAngle) {
                    stableMs += 50;
                } else {
                    stableMs = 0;
                }

                if (stableMs >= requiredStableMs) {
                    resolve();
                    return;
                }

                if (elapsed > maxWaitMs) {
                    resolve();
                    return;
                }

                lastX = this.x;
                lastY = this.y;
                lastAngle = this.angle;

                setTimeout(checkStability, 50);
            };

            checkStability();
        });
    }

    async moveTo(matX, matY, angle = 0) {
        const dx = matX - this.x;
        const dy = matY - this.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance > 10) {
            const bearing = Math.round(((Math.atan2(dy, dx) * 180 / Math.PI) % 360 + 360) % 360);

            // Step 1: Rotate to face target
            this.angle = bearing;
            this._render();
            await this._waitForMotionComplete();

            // Step 2: Move straight to target (realistic timing: ~50mm/sec at speed 50)
            const moveMs = Math.max(800, (distance / 25) * 1000);
            await new Promise(resolve => {
                setTimeout(() => {
                    this.x = matX;
                    this.y = matY;
                    this._render();
                    resolve();
                }, moveMs);
            });
            await this._waitForMotionComplete();
        }

        // Step 3: Rotate to final angle
        this.angle = angle;
        this._render();
        await this._waitForMotionComplete();
        return { result: 0x00, resultStr: "Success" };
    }

    // --- Coordinate Mapping ---
    matToSim(matX, matY) {
        const matMinX = this.spatial ? this.spatial.mat.coordRange.x.min : 98;
        const matMaxX = this.spatial ? this.spatial.mat.coordRange.x.max : 402;
        const matMinY = this.spatial ? this.spatial.mat.coordRange.y.min : 142;
        const matMaxY = this.spatial ? this.spatial.mat.coordRange.y.max : 358;
        const simW = this.matElement?.clientWidth || 700;
        const simH = this.matElement?.clientHeight || 500;

        const sx = ((matX - matMinX) / (matMaxX - matMinX)) * simW;
        const sy = ((matY - matMinY) / (matMaxY - matMinY)) * simH;
        return { x: sx, y: sy };
    }

    simToMat(simX, simY) {
        const matMinX = this.spatial ? this.spatial.mat.coordRange.x.min : 98;
        const matMaxX = this.spatial ? this.spatial.mat.coordRange.x.max : 402;
        const matMinY = this.spatial ? this.spatial.mat.coordRange.y.min : 142;
        const matMaxY = this.spatial ? this.spatial.mat.coordRange.y.max : 358;
        const simW = this.matElement?.clientWidth || 700;
        const simH = this.matElement?.clientHeight || 500;

        const mx = Math.round((simX / simW) * (matMaxX - matMinX) + matMinX);
        const my = Math.round((simY / simH) * (matMaxY - matMinY) + matMinY);
        return { x: mx, y: my };
    }


    async setLight(r, g, b, durationMs = 0) {
        // 公開 API は走行中パターンを上書きする意図とみなしてキャンセル
        this._cancelLightPattern && this._cancelLightPattern();
        if (this._lightTimeoutId) {
            clearTimeout(this._lightTimeoutId);
            this._lightTimeoutId = null;
        }

        if (this.cubeElement) {
            const color = `rgb(${r}, ${g}, ${b})`;
            this.cubeElement.style.borderTop = `4px solid ${color}`;
            this.cubeElement.style.boxShadow = `0 0 10px ${color}`;
        }

        if (durationMs > 0) {
            return new Promise(resolve => {
                this._lightTimeoutId = setTimeout(() => {
                    if (this.cubeElement) {
                        this.cubeElement.style.borderTop = "none";
                        this.cubeElement.style.boxShadow = "none";
                    }
                    this._lightTimeoutId = null;
                    resolve();
                }, durationMs);
            });
        }
        return Promise.resolve();
    }

    async playSound(_noteId = 60, durationMs = 500) {
        if (this.cubeElement) {
            this.cubeElement.classList.add('pulse');
            setTimeout(() => this.cubeElement.classList.remove('pulse'), 200);
        }
        return new Promise(resolve => setTimeout(resolve, durationMs));
    }

    async playMelody(notes) {
        if (!notes || notes.length === 0) return;
        const totalDuration = notes.reduce((sum, n) => sum + (n.duration_ms || 300), 0);
        if (this.cubeElement) {
            this.cubeElement.classList.add('pulse');
            setTimeout(() => this.cubeElement.classList.remove('pulse'), totalDuration);
        }
        return new Promise(resolve => setTimeout(resolve, totalDuration));
    }

    async setLightPattern(frames, repetitions = 1) {
        if (!frames || frames.length === 0) return;
        this._cancelLightPattern();

        const token = { cancelled: false };
        this._lightPatternToken = token;

        const showFrame = (f) => {
            if (!this.cubeElement) return;
            const color = `rgb(${f.red || 0}, ${f.green || 0}, ${f.blue || 0})`;
            this.cubeElement.style.borderTop = `4px solid ${color}`;
            this.cubeElement.style.boxShadow = `0 0 10px ${color}`;
        };

        const runOnce = async () => {
            for (const f of frames) {
                if (token.cancelled) return;
                showFrame(f);
                await new Promise(r => setTimeout(r, f.duration_ms || 100));
            }
        };

        if (repetitions === 0) {
            (async () => {
                while (!token.cancelled) await runOnce();
            })();
            return;
        }

        for (let i = 0; i < repetitions; i++) {
            if (token.cancelled) break;
            await runOnce();
        }
        if (this._lightPatternToken === token) this._lightPatternToken = null;
    }

    _cancelLightPattern() {
        if (this._lightPatternToken) {
            this._lightPatternToken.cancelled = true;
            this._lightPatternToken = null;
        }
    }

    async clearLight() {
        this._cancelLightPattern();
        return this.setLight(0, 0, 0, 0);
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
            const linearScale = 0.5;
            const angularScale = 0.125;

            const vL = this.leftSpeed * linearScale;
            const vR = this.rightSpeed * linearScale;

            const v = (vL + vR) / 2;
            const omega = (vR - vL) * angularScale;

            this.angle = (this.angle + omega * dt * 10) % 360;
            if (this.angle < 0) this.angle += 360;

            const rad = -this.angle * Math.PI / 180;
            
            this.x += v * Math.cos(rad) * dt;
            this.y -= v * Math.sin(rad) * dt;

            // mat boundary check (safeMargin を参照)
            const margin = this.spatial ? this.spatial.mat.safeMargin : 30;
            const matMinX = 98 + margin, matMaxX = 402 - margin;
            const matMinY = 142 + margin, matMaxY = 358 - margin;
            this.x = Math.max(matMinX, Math.min(matMaxX, this.x));
            this.y = Math.max(matMinY, Math.min(matMaxY, this.y));

            this._render();
        } else {
            // Always render to handle window resizing even when not moving
            this._render();
        }

        requestAnimationFrame(this._boundUpdate);
    }

    _render() {
        if (!this.cubeElement || !this.matElement) return;
        const simPos = this.matToSim(this.x, this.y);
        this.cubeElement.style.left = `${simPos.x}px`;
        this.cubeElement.style.top = `${simPos.y}px`;
        // toio 0deg is Right, CSS rotate 0deg is Up. Add 90deg to align.
        this.cubeElement.style.transform = `translate(-50%, -50%) rotate(${this.angle + 90}deg)`;
    }
}
