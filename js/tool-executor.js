/**
 * Executes requested tool_calls against the ToioBLE instance and Environment.
 */
class ToolExecutor {
    constructor(toioInstance, environment, sessionMemory = null) {
        this.toio = toioInstance;
        this.env = environment;
        this.memory = sessionMemory;
    }

    async _retryOnce(operationFn, desc) {
        try {
            return await operationFn();
        } catch (e) {
            console.warn(`[Retry] ${desc} failed, retrying once...`, e);
            await new Promise(r => setTimeout(r, 100));
            return await operationFn();
        }
    }

    // 同時実行しても安全なツール（順序依存・副作用干渉なし）
    // NOTE: play_sound と play_melody は同じ sound characteristic を使用するため、同時実行不可
    static PARALLELIZABLE = new Set([
        "set_light", "set_light_pattern",
        "get_position", "get_battery", "learn_calibration"
    ]);

    static NEEDS_CONNECTION = new Set([
        "spin", "set_light", "play_sound", "get_battery", "stop",
        "move_to", "play_melody", "move_path", "set_light_pattern",
        "move_relative", "turn", "move_to_landmark"
    ]);

    /**
     * 到達判定の閾値（座標単位 / 度）。
     * agent-loop 側の _localEvaluate でも同じ値を参照する。
     */
    static POSITION_TOLERANCE = 15;
    static ANGLE_TOLERANCE = 25;

    /**
     * すべての移動系ツール (move_to / move_relative / turn / move_to_landmark) の
     * 共通実装。結果に movement フィールドを必ず含め、_localEvaluate で一元評価できるようにする。
     */
    async _performMoveTo(targetX, targetY, targetAngle, originalRequest, label = "move_to") {
        const safe = this.env.spatial.clampToSafeRange(targetX, targetY);
        const clamped = (safe.x !== targetX || safe.y !== targetY);
        const angle = ((targetAngle % 360) + 360) % 360;

        const beforeSnap = this.env.getSnapshot();
        const moveRes = await this._retryOnce(
            () => this.toio.moveTo(safe.x, safe.y, angle),
            label
        );
        const afterSnap = this.env.getSnapshot();

        const arrived = {
            x: afterSnap.cube.x,
            y: afterSnap.cube.y,
            angle: afterSnap.cube.angle,
        };
        const dx = safe.x - arrived.x;
        const dy = safe.y - arrived.y;
        const rawDa = Math.abs(arrived.angle - angle);
        const dAngle = Math.min(rawDa, 360 - rawDa);
        const distRemaining = Math.round(Math.sqrt(dx * dx + dy * dy));
        const reached = (
            Math.abs(dx) <= ToolExecutor.POSITION_TOLERANCE &&
            Math.abs(dy) <= ToolExecutor.POSITION_TOLERANCE &&
            dAngle    <= ToolExecutor.ANGLE_TOLERANCE
        );

        const motorResultStr = moveRes?.resultStr || "OK";
        const motorResultCode = moveRes?.result ?? 0x00;

        let desc = `${label} → target=(${safe.x}, ${safe.y}, ${angle}°), arrived=(${arrived.x}, ${arrived.y}, ${arrived.angle}°), motor=${motorResultStr}.`;
        if (clamped) {
            desc += ` ⚠️ clamped: 要求 (${targetX},${targetY}) は安全範囲外だったため (${safe.x},${safe.y}) に制限。`;
        }
        if (!reached) {
            desc += ` ⚠️ 未到達 (残り ${distRemaining}u, 角度差 ${dAngle}°)。`;
        }

        return {
            status: "success",
            desc,
            movement: {
                target:     { x: safe.x, y: safe.y, angle },
                arrived_at: arrived,
                distance_remaining: distRemaining,
                angle_delta:        dAngle,
                reached,
                motor_result: motorResultStr,
                motor_result_code: motorResultCode,
                traveled_from: { x: beforeSnap.cube.x, y: beforeSnap.cube.y, angle: beforeSnap.cube.angle }
            },
            clamped,
            original_request: originalRequest,
        };
    }

    async _execute(call) {
        // BLE通信の安定性のため、コマンド間にわずかな待機時間を設ける
        await new Promise(r => setTimeout(r, 50));

        const funcName = call.function.name;
        let args = call.function.arguments || {};

        if (typeof args === 'string') {
            try { args = JSON.parse(args); }
            catch (e) { console.warn(`[ToolExecutor] Failed to parse arguments for ${funcName}:`, e); args = {}; }
        }

        console.log(`Executing Tool [${funcName}]:`, args);
        let resultData = {};

        try {
            if (ToolExecutor.NEEDS_CONNECTION.has(funcName) && !this.toio.isConnected) {
                throw new Error("Cube is not connected or simulator is unavailable.");
            }

            switch (funcName) {
                case "get_position": {
                    if (!this.env) throw new Error("Environment not provided to ToolExecutor");
                    const snap = this.env.getSnapshot();
                    if (this.env.spatial?.getLandmarkInfo) {
                        snap.landmark = this.env.spatial.getLandmarkInfo(snap.cube.x, snap.cube.y);
                    }
                    resultData = { status: "success", state: snap };
                    break;
                }

                case "wait": {
                    await new Promise(r => setTimeout(r, args.duration_ms || 1000));
                    resultData = { status: "success", desc: `Waited for ${args.duration_ms}ms` };
                    break;
                }

                case "stop": {
                    await this._retryOnce(() => this.toio.stop(), "stop");
                    const afterSnap = this.env ? this.env.getSnapshot() : {};
                    resultData = { status: "success", desc: "Stopped all movement", after_state: afterSnap.cube };
                    break;
                }

                case "spin": {
                    const spd = args.speed || 80;
                    await this._retryOnce(() => this.toio.spin(spd, args.duration_ms, args.direction || "cw"), "spin");
                    const afterSnap = this.env ? this.env.getSnapshot() : {};
                    resultData = { status: "success", desc: `Spun ${args.direction || "cw"} for ${args.duration_ms}ms`, after_state: afterSnap.cube };
                    break;
                }

                case "set_light": {
                    await this._retryOnce(() => this.toio.setLight(args.red, args.green, args.blue, args.duration_ms || 0), "set_light");
                    resultData = { status: "success", color: `rgb(${args.red},${args.green},${args.blue})` };
                    break;
                }

                case "play_sound": {
                    await this._retryOnce(() => this.toio.playSound(args.note_id || 60, args.duration_ms), "play_sound");
                    resultData = { status: "success", played_note: args.note_id || 60 };
                    break;
                }

                case "play_melody": {
                    if (this.toio.playMelody) {
                        const totalDuration = args.notes ? args.notes.reduce((sum, n) => sum + (n.duration_ms || 300), 0) : 0;
                        await this._retryOnce(() => this.toio.playMelody(args.notes), "play_melody");
                        resultData = { status: "success", desc: `Played melody with ${args.notes.length} notes (${totalDuration}ms total)` };
                    } else {
                        resultData = { status: "error", error: "play_melody not supported by current interface" };
                    }
                    break;
                }

                case "set_light_pattern": {
                    if (this.toio.setLightPattern) {
                        await this._retryOnce(() => this.toio.setLightPattern(args.frames, args.repetitions ?? 1), "set_light_pattern");
                        resultData = { status: "success", desc: `Played light pattern with ${args.frames.length} frames (${args.repetitions} reps)` };
                    } else {
                        resultData = { status: "error", error: "set_light_pattern not supported by current interface" };
                    }
                    break;
                }

                case "get_battery": {
                    const batt = await this._retryOnce(() => this.toio.getBattery(), "get_battery");
                    resultData = { status: "success", battery_percentage: batt };
                    break;
                }

                case "move_to": {
                    resultData = await this._performMoveTo(
                        args.x, args.y, args.angle || 0,
                        { x: args.x, y: args.y, angle: args.angle || 0 },
                        "move_to"
                    );
                    break;
                }

                case "move_relative": {
                    const snap = this.env.getSnapshot();
                    const distUnits = this.env.spatial.resolveDistance(
                        args.distance_mm ?? args.distance ?? "medium"
                    );
                    const target = this.env.spatial.resolveRelativeMove(
                        args.direction, distUnits,
                        snap.cube.x, snap.cube.y, snap.cube.angle
                    );
                    if (!target) {
                        resultData = { status: "error", error: `Unknown direction: ${args.direction}` };
                        break;
                    }
                    resultData = await this._performMoveTo(
                        target.target_x, target.target_y, target.target_angle,
                        { direction: args.direction, distance: args.distance_mm ?? args.distance ?? "medium" },
                        "move_relative"
                    );
                    break;
                }

                case "turn": {
                    const snap = this.env.getSnapshot();
                    const deg = args.degrees || 0;
                    const target = ((snap.cube.angle + deg) % 360 + 360) % 360;
                    resultData = await this._performMoveTo(
                        snap.cube.x, snap.cube.y, target,
                        { degrees: deg, from_angle: snap.cube.angle },
                        "turn"
                    );
                    break;
                }

                case "move_to_landmark": {
                    const coords = this.env.spatial.getLandmarkCoords(args.landmark);
                    if (!coords) {
                        resultData = { status: "error", error: `Unknown landmark: ${args.landmark}` };
                        break;
                    }
                    const snap = this.env.getSnapshot();
                    const angle = (typeof args.face === 'number') ? args.face : snap.cube.angle;
                    resultData = await this._performMoveTo(
                        coords.x, coords.y, angle,
                        { landmark: args.landmark, face: args.face },
                        "move_to_landmark"
                    );
                    break;
                }

                case "move_path": {
                    if (!args.waypoints || args.waypoints.length === 0) {
                        resultData = { status: "error", error: "No waypoints provided" };
                        break;
                    }
                    let lastRes = null;
                    for (let i = 0; i < args.waypoints.length; i++) {
                        const wp = args.waypoints[i];
                        const safePos = this.env.spatial.clampToSafeRange(wp.x, wp.y);
                        lastRes = await this._retryOnce(() => this.toio.moveTo(safePos.x, safePos.y, wp.angle || 0), `move_path step ${i}`);
                        if (lastRes && lastRes.result !== 0x00 && lastRes.result !== 0) {
                            break;
                        }
                    }
                    const afterSnap = this.env.getSnapshot();
                    resultData = {
                        status: "success",
                        desc: `Executed move_path with ${args.waypoints.length} waypoints. Last result: ${lastRes?.resultStr || "OK"}`,
                        after_state: afterSnap.cube
                    };
                    break;
                }

                case "learn_calibration": {
                    if (!args.word || !args.meaning) {
                        resultData = { status: "error", error: "word and meaning are required" };
                        break;
                    }
                    if (this.memory?.saveCalibration) {
                        this.memory.saveCalibration(args.word, args.meaning);
                        resultData = { status: "success", desc: `Learned "${args.word}" = ${args.meaning}` };
                    } else {
                        resultData = { status: "error", error: "Session memory unavailable" };
                    }
                    break;
                }

                default:
                    resultData = { status: "error", error: `Unknown function ${funcName}` };
                    console.warn(resultData.error);
            }
        } catch (err) {
            console.error(`Error in Tool [${funcName}]:`, err);
            resultData = { status: "error", error: err.message };
        }

        return JSON.stringify(resultData);
    }

    async executeAll(toolCalls) {
        // 全ツールが並列可能なら Promise.all で同時実行、そうでなければ逐次
        const allParallelizable = toolCalls.every(c => ToolExecutor.PARALLELIZABLE.has(c.function.name));
        if (allParallelizable && toolCalls.length > 1) {
            console.log(`[ToolExecutor] Parallel execution: ${toolCalls.map(c => c.function.name).join(', ')}`);
            return Promise.all(toolCalls.map(c => this._execute(c)));
        }

        const results = [];
        for (const call of toolCalls) {
            results.push(await this._execute(call));
        }
        return results;
    }
}
