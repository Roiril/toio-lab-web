/**
 * Executes requested tool_calls against the ToioBLE instance.
 */
class ToolExecutor {
    constructor(toioInstance) {
        this.toio = toioInstance;
    }

    async executeAll(toolCalls) {
        const results = [];
        
        for (const call of toolCalls) {
            const funcName = call.function.name;
            const args = call.function.arguments || {};
            
            console.log(`Executing Tool [${funcName}]:`, args);
            let resultData = {};

            try {
                if (!this.toio.isConnected) {
                    throw new Error("Cube is not connected.");
                }

                switch (funcName) {
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
