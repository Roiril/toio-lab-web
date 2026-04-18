/**
 * Executes requested tool_calls against the ToioBLE instance and Environment.
 */
class ToolExecutor {
    constructor(toioInstance, environment) {
        this.toio = toioInstance;
        this.env = environment; // for get_position
    }

    async _retryOnce(operationFn, desc) {
        try {
            return await operationFn();
        } catch (e) {
            console.warn(`[Retry] ${desc} failed, retrying once...`, e);
            await new Promise(r => setTimeout(r, 100)); // wait brief moment before retry
            return await operationFn();
        }
    }

    async executeAll(toolCalls) {
        const results = [];
        
        for (const call of toolCalls) {
            // BLE通信の安定性のため、コマンド間にわずかな待機時間を設ける
            await new Promise(r => setTimeout(r, 50));
            
            const funcName = call.function.name;
            let args = call.function.arguments || {};

            // LLM (特に Ollama) によっては arguments が文字列で渡される場合があるため補正
            if (typeof args === 'string') {
                try {
                    args = JSON.parse(args);
                } catch (e) {
                    console.warn(`[ToolExecutor] Failed to parse arguments for ${funcName}:`, e);
                    // そのまま進めるが、パース失敗時は空オブジェクトにフォールバック
                    args = {};
                }
            }
            
            console.log(`Executing Tool [${funcName}]:`, args);
            let resultData = {};

            try {
                // Connection checks
                const needsConnection = ["spin", "set_light", "play_sound", "get_battery", "stop", "move_to", "play_melody", "move_path", "set_light_pattern"];
                if (needsConnection.includes(funcName) && !this.toio.isConnected) {
                    throw new Error("Cube is not connected or simulator is unavailable.");
                }

                switch (funcName) {
                    case "think":
                        // Purely internal operation, we just echo back that thought was recorded
                        resultData = { status: "success", thought_recorded: true };
                        break;
                        
                    case "get_position": {
                        if (!this.env) throw new Error("Environment not provided to ToolExecutor");
                        const snap = this.env.getSnapshot();
                        let landmarkInfo = "";
                        if (this.env.spatial && this.env.spatial.getLandmarkInfo) {
                            landmarkInfo = this.env.spatial.getLandmarkInfo(snap.cube.x, snap.cube.y);
                            snap.landmark = landmarkInfo;
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
                            await this._retryOnce(() => this.toio.playMelody(args.notes), "play_melody");
                            resultData = { status: "success", desc: `Played melody with ${args.notes.length} notes` };
                        } else {
                            resultData = { status: "error", error: "play_melody not supported by current interface" };
                        }
                        break;
                    }

                    case "set_light_pattern": {
                        if (this.toio.setLightPattern) {
                            await this._retryOnce(() => this.toio.setLightPattern(args.frames, args.repetitions || 1), "set_light_pattern");
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
                        // 安全範囲に制限（クランプ）
                        const safePos = this.env.spatial.clampToSafeRange(args.x, args.y);
                        const isClamped = (safePos.x !== args.x || safePos.y !== args.y);
                        if (isClamped) {
                            console.log(`Clamping move_to from (${args.x}, ${args.y}) to safe position (${safePos.x}, ${safePos.y})`);
                        }
                        const moveRes = await this._retryOnce(() => this.toio.moveTo(safePos.x, safePos.y, args.angle || 0), "move_to");
                        
                        // ✅ Get actual position after movement
                        const afterSnap = this.env.getSnapshot();
                        const arrivedAt = { 
                            x: afterSnap.cube.x, 
                            y: afterSnap.cube.y, 
                            angle: afterSnap.cube.angle 
                        };

                        let desc = `Moving to (${safePos.x}, ${safePos.y}) with angle ${args.angle || 0}. Result: ${moveRes.resultStr || "OK"}. Arrived at (${arrivedAt.x}, ${arrivedAt.y}) angle ${arrivedAt.angle}.`;
                        if (isClamped) {
                            desc += `. ⚠️注意: 指定された座標 (${args.x}, ${args.y}) はマットの安全範囲外だったため、最も近い安全な位置 (${safePos.x}, ${safePos.y}) に制限されました。`;
                        }

                        resultData = { 
                            status: "success", 
                            desc: desc,
                            arrived_at: arrivedAt,
                            original_request: { x: args.x, y: args.y },
                            clamped_target: safePos, // エヴァリュエーター用
                            clamped: isClamped,
                            after_state: arrivedAt
                        };
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
                                break; // エラーやタイムアウトで中断
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

                    default:
                        resultData = { status: "error", error: `Unknown function ${funcName}` };
                        console.warn(resultData.error);
                }
            } catch (err) {
                console.error(`Error in Tool [${funcName}]:`, err);
                resultData = { status: "error", error: err.message };
            }

            // Results must be stringified for Ollama
            results.push(JSON.stringify(resultData));
        }

        return results;
    }
}
