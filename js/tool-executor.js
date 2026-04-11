/**
 * Executes requested tool_calls against the ToioBLE instance and Environment.
 */
class ToolExecutor {
    constructor(toioInstance, environment) {
        this.toio = toioInstance;
        this.env = environment; // for get_position
    }

    async executeAll(toolCalls) {
        const results = [];
        
        for (const call of toolCalls) {
            const funcName = call.function.name;
            const args = call.function.arguments || {};
            
            console.log(`Executing Tool [${funcName}]:`, args);
            let resultData = {};

            try {
                // Connection checks
                const needsConnection = ["move_forward", "move_backward", "turn", "spin", "set_light", "play_sound", "get_battery", "stop", "move_to"];
                if (needsConnection.includes(funcName) && !this.toio.isConnected) {
                    throw new Error("Cube is not connected or simulator is unavailable.");
                }

                switch (funcName) {
                    case "think":
                        // Purely internal operation, we just echo back that thought was recorded
                        resultData = { status: "success", thought_recorded: true };
                        break;
                        
                    case "get_position":
                        if (!this.env) throw new Error("Environment not provided to ToolExecutor");
                        // Return the environment snapshot, which includes position and spatial info
                        const snap = this.env.getSnapshot();
                        resultData = { status: "success", state: snap };
                        break;
                        
                    case "wait":
                        await new Promise(r => setTimeout(r, args.duration_ms || 1000));
                        resultData = { status: "success", desc: `Waited for ${args.duration_ms}ms` };
                        break;
                        
                    case "stop":
                        await this.toio.stop();
                        resultData = { status: "success", desc: "Stopped all movement" };
                        break;

                    case "move_forward":
                        await this.toio.move(args.speed || 50, args.speed || 50, args.duration_ms);
                        resultData = { status: "success", desc: `Moved forward for ${args.duration_ms}ms` };
                        break;
                        
                    case "move_backward":
                        await this.toio.move(-(args.speed || 50), -(args.speed || 50), args.duration_ms);
                        resultData = { status: "success", desc: `Moved backward for ${args.duration_ms}ms` };
                        break;
                        
                    case "turn":
                        const s = args.speed || 50;
                        if (args.direction === "left") {
                            await this.toio.move(-s, s, args.duration_ms);
                        } else {
                            await this.toio.move(s, -s, args.duration_ms);
                        }
                        resultData = { status: "success", desc: `Turned ${args.direction} for ${args.duration_ms}ms` };
                        break;
                        
                    case "spin":
                        const spd = args.speed || 80;
                        await this.toio.spin(spd, args.duration_ms, args.direction || "cw");
                        resultData = { status: "success", desc: `Spun ${args.direction || "cw"} for ${args.duration_ms}ms` };
                        break;

                    case "set_light":
                        await this.toio.setLight(args.red, args.green, args.blue, args.duration_ms || 0);
                        resultData = { status: "success", color: `rgb(${args.red},${args.green},${args.blue})` };
                        break;

                    case "play_sound":
                        await this.toio.playSound(args.note_id || 60, args.duration_ms);
                        resultData = { status: "success", played_note: args.note_id || 60 };
                        break;

                    case "get_battery":
                        const batt = await this.toio.getBattery();
                        resultData = { status: "success", battery_percentage: batt };
                        break;
                        
                    case "move_to":
                        // 安全範囲に制限（クランプ）
                        const safePos = this.env.spatial.clampToSafeRange(args.x, args.y);
                        const isClamped = (safePos.x !== args.x || safePos.y !== args.y);
                        if (isClamped) {
                            console.log(`Clamping move_to from (${args.x}, ${args.y}) to safe position (${safePos.x}, ${safePos.y})`);
                        }
                        await this.toio.moveTo(safePos.x, safePos.y, args.angle || 0);
                        
                        // ✅ Get actual position after movement
                        const afterSnap = this.env.getSnapshot();
                        const arrivedAt = { 
                            x: afterSnap.cube.x, 
                            y: afterSnap.cube.y, 
                            angle: afterSnap.cube.angle 
                        };

                        let desc = `Moving to (${safePos.x}, ${safePos.y}) with angle ${args.angle || 0}. Arrived at (${arrivedAt.x}, ${arrivedAt.y}) angle ${arrivedAt.angle}.`;
                        if (isClamped) {
                            desc += `. ⚠️注意: 指定された座標 (${args.x}, ${args.y}) はマットの安全範囲外だったため、最も近い安全な位置 (${safePos.x}, ${safePos.y}) に制限されました。`;
                        }

                        resultData = { 
                            status: "success", 
                            desc: desc,
                            arrived_at: arrivedAt,
                            original_request: { x: args.x, y: args.y },
                            clamped: isClamped
                        };
                        break;

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
