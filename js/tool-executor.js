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

    // 同時実行しても安全なツール（順序依存・副作用干渉なし）
    // NOTE: play_sound と play_melody は同じ sound characteristic を使用するため、同時実行不可
    static PARALLELIZABLE = new Set(["set_light", "set_light_pattern", "think", "get_position", "get_battery"]);

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
        console.log(`[ToolExecutor] Device connected: ${this.toio.isConnected}, Device type: ${this.toio.constructor.name}`);
        let resultData = {};

        try {
            const needsConnection = ["spin", "set_light", "play_sound", "get_battery", "stop", "move_to", "play_melody", "move_path", "set_light_pattern"];
            if (needsConnection.includes(funcName) && !this.toio.isConnected) {
                throw new Error("Cube is not connected or simulator is unavailable.");
            }

            switch (funcName) {
                case "think":
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

                    // Auto voice feedback for stop
                    try {
                        await this.toio.speakText("停止しました", "ja");
                    } catch (err) {
                        console.warn("[ToolExecutor] Failed to speak stop feedback:", err.message);
                    }
                    break;
                }

                case "spin": {
                    const spd = args.speed || 80;
                    await this._retryOnce(() => this.toio.spin(spd, args.duration_ms, args.direction || "cw"), "spin");
                    const afterSnap = this.env ? this.env.getSnapshot() : {};
                    resultData = { status: "success", desc: `Spun ${args.direction || "cw"} for ${args.duration_ms}ms`, after_state: afterSnap.cube };

                    // Auto voice feedback for spin completion
                    try {
                        const direction = args.direction === "ccw" ? "左回転" : "右回転";
                        await this.toio.speakText(`${direction}完了しました`, "ja");
                    } catch (err) {
                        console.warn("[ToolExecutor] Failed to speak spin completion:", err.message);
                    }
                    break;
                }

                case "set_light": {
                    await this._retryOnce(() => this.toio.setLight(args.red, args.green, args.blue, args.duration_ms || 0), "set_light");
                    resultData = { status: "success", color: `rgb(${args.red},${args.green},${args.blue})` };

                    // Auto voice feedback for light color change
                    try {
                        const r = args.red || 0, g = args.green || 0, b = args.blue || 0;
                        let colorName = "色";
                        if (r > 200 && g < 100 && b < 100) colorName = "赤色";
                        else if (r < 100 && g > 200 && b < 100) colorName = "緑色";
                        else if (r < 100 && g < 100 && b > 200) colorName = "青色";
                        else if (r > 200 && g > 200 && b < 100) colorName = "黄色";
                        else if (r > 200 && g > 100 && b > 100) colorName = "ピンク色";
                        else if (r < 50 && g < 50 && b < 50) colorName = "消灯";
                        else if (r > 200 && g > 200 && b > 200) colorName = "白色";

                        await this.toio.speakText(`${colorName}に設定完了しました`, "ja");
                    } catch (err) {
                        console.warn("[ToolExecutor] Failed to speak light completion:", err.message);
                    }
                    break;
                }

                case "play_sound": {
                    await this._retryOnce(() => this.toio.playSound(args.note_id || 60, args.duration_ms), "play_sound");
                    resultData = { status: "success", played_note: args.note_id || 60 };

                    // Auto voice feedback for sound playback completion
                    try {
                        await this.toio.speakText("音の再生完了しました", "ja");
                    } catch (err) {
                        console.warn("[ToolExecutor] Failed to speak sound completion:", err.message);
                    }
                    break;
                }

                case "play_melody": {
                    if (this.toio.playMelody) {
                        const totalDuration = args.notes ? args.notes.reduce((sum, n) => sum + (n.duration_ms || 300), 0) : 0;
                        console.log(`[ToolExecutor] play_melody: ${args.notes?.length || 0} notes, total duration ${totalDuration}ms`);
                        await this._retryOnce(() => this.toio.playMelody(args.notes), "play_melody");
                        resultData = { status: "success", desc: `Played melody with ${args.notes.length} notes (${totalDuration}ms total)` };

                        // Auto voice feedback for melody playback completion
                        try {
                            await this.toio.speakText("メロディの再生完了しました", "ja");
                        } catch (err) {
                            console.warn("[ToolExecutor] Failed to speak melody completion:", err.message);
                        }
                    } else {
                        resultData = { status: "error", error: "play_melody not supported by current interface" };
                    }
                    break;
                }

                case "set_light_pattern": {
                    if (this.toio.setLightPattern) {
                        await this._retryOnce(() => this.toio.setLightPattern(args.frames, args.repetitions ?? 1), "set_light_pattern");
                        resultData = { status: "success", desc: `Played light pattern with ${args.frames.length} frames (${args.repetitions} reps)` };

                        // Auto voice feedback for light pattern completion
                        try {
                            await this.toio.speakText("ライトパターンの再生完了しました", "ja");
                        } catch (err) {
                            console.warn("[ToolExecutor] Failed to speak light pattern completion:", err.message);
                        }
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
                    const safePos = this.env.spatial.clampToSafeRange(args.x, args.y);
                    const isClamped = (safePos.x !== args.x || safePos.y !== args.y);
                    if (isClamped) {
                        console.log(`Clamping move_to from (${args.x}, ${args.y}) to safe position (${safePos.x}, ${safePos.y})`);
                    }
                    const moveRes = await this._retryOnce(() => this.toio.moveTo(safePos.x, safePos.y, args.angle || 0), "move_to");

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
                        clamped_target: safePos,
                        clamped: isClamped,
                        after_state: arrivedAt
                    };

                    // Auto voice feedback for movement completion
                    if (moveRes && (moveRes.result === 0x00 || moveRes.result === 0)) {
                        try {
                            await this.toio.speakText("移動完了しました", "ja");
                        } catch (err) {
                            console.warn("[ToolExecutor] Failed to speak movement completion:", err.message);
                        }
                    }
                    break;
                }

                case "move_path": {
                    if (!args.waypoints || args.waypoints.length === 0) {
                        resultData = { status: "error", error: "No waypoints provided" };
                        break;
                    }
                    let lastRes = null;
                    let completedWaypoints = 0;
                    for (let i = 0; i < args.waypoints.length; i++) {
                        const wp = args.waypoints[i];
                        const safePos = this.env.spatial.clampToSafeRange(wp.x, wp.y);
                        lastRes = await this._retryOnce(() => this.toio.moveTo(safePos.x, safePos.y, wp.angle || 0), `move_path step ${i}`);
                        if (lastRes && lastRes.result !== 0x00 && lastRes.result !== 0) {
                            break;
                        }
                        completedWaypoints++;

                        // Auto voice feedback for each waypoint arrival (except the last one)
                        if (i < args.waypoints.length - 1) {
                            try {
                                await this.toio.speakText(`ポイント${i + 1}に到着しました`, "ja");
                            } catch (err) {
                                console.warn("[ToolExecutor] Failed to speak waypoint arrival:", err.message);
                            }
                        }
                    }
                    const afterSnap = this.env.getSnapshot();
                    resultData = {
                        status: "success",
                        desc: `Executed move_path with ${args.waypoints.length} waypoints. Last result: ${lastRes?.resultStr || "OK"}`,
                        after_state: afterSnap.cube
                    };

                    // Auto voice feedback for move_path completion
                    if (completedWaypoints === args.waypoints.length) {
                        try {
                            await this.toio.speakText("すべてのウェイポイントに到達しました", "ja");
                        } catch (err) {
                            console.warn("[ToolExecutor] Failed to speak final waypoint completion:", err.message);
                        }
                    }
                    break;
                }

                case "speak_text": {
                    const text = args.text || "";
                    const language = args.language || "ja";

                    if (!text.trim()) {
                        resultData = { status: "error", error: "Text cannot be empty" };
                        break;
                    }

                    if (text.length > 500) {
                        resultData = {
                            status: "error",
                            error: `Text too long (${text.length}/500 chars). Please split into shorter chunks.`
                        };
                        break;
                    }

                    try {
                        resultData = await this.toio.speakText(text, language);
                    } catch (error) {
                        resultData = { status: "error", error: error.message };
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
