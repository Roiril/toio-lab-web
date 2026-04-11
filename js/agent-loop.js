class AgentLoop {
    constructor(ollamaClient, toolExecutor, environment, sessionMemory, spatialAwareness, options = {}) {
        this.ollama = ollamaClient;
        this.executor = toolExecutor;
        this.env = environment;
        this.memory = sessionMemory;
        this.spatial = spatialAwareness;
        
        this.maxIterations = options.maxIterations || 10;
        this.onStep = options.onStep || (() => {});
        this.isCancelled = false;
    }

    cancel() {
        this.isCancelled = true;
        this.ollama.cancel();
    }

    async run(userMessage, tools) {
        this.isCancelled = false;
        let iteration = 0;
        let finalMessage = "";
        const steps = [];

        try {
            // --- Phase 1: Target Coordinator (目標決定) ---
            this.onStep({ type: 'thinking', iteration, message: "目的地の座標を計算中..." });
            
            const staticContext = this.spatial.getStaticGuide();
            const currentEnv = this.env.describe();
            const coordinatorSystemPrompt = [
                `あなたは toio キューブの移動目標（座標）を決定するコーディネーターです。`,
                `ユーザーの指示と現在の状況から、次に移動すべき最適なマット座標(x,y)を決定してください。`,
                ``,
                `## 出力形式`,
                `必ず以下のJSON形式のみを出力してください。余計な解説は不要です。`,
                `{`,
                `  "target_x": 数値 (250-750),`,
                `  "target_y": 数値 (250-750),`,
                `  "target_angle": 数値 (0-360, 指定がなければ0),`,
                `  "reasoning": "なぜその座標を選んだかの簡潔な理由"`,
                `}`,
                ``,
                staticContext
            ].join('\n');

            this.ollama.resetHistory();
            this.ollama.setSystemPrompt(coordinatorSystemPrompt);
            
            const coordinatorRequest = [
                `[現在の環境状態]`,
                currentEnv,
                ``,
                `[ユーザー指示]`,
                userMessage
            ].join('\n');

            const coordinatorResponse = await this.ollama.chat(coordinatorRequest, [], { jsonMode: true });
            let target;
            try {
                target = JSON.parse(coordinatorResponse.content);
            } catch (e) {
                console.error("Failed to parse coordinator response:", coordinatorResponse.content);
                throw new Error("コーディネーターの応答パースに失敗しました。");
            }

            this.onStep({ 
                type: 'thinking', 
                iteration, 
                message: `目標決定: (${target.target_x}, ${target.target_y}) - ${target.reasoning}` 
            });

            const maxRefinementLoops = 3;
            let refinementCount = 0;
            let reachedGoal = false;

            while (!reachedGoal && refinementCount < maxRefinementLoops && !this.isCancelled) {
                // --- Phase 2: Execution Planner (実行計画) ---
                this.onStep({ type: 'thinking', iteration, message: "移動コマンドを作成中..." });
                
                const plannerSystemPrompt = [
                    `あなたは toio キューブの移動を実行するプランナーです。`,
                    `提示された目標座標に到達するために \`move_to\` ツールを使用してください。`,
                    `1回のツール呼び出しで目標に到達することを目指してください。`,
                    ``,
                    `## 行動ルール`,
                    `- 目標座標 (x, y) が与えられるので、\`move_to\` を呼び出してください。`,
                    `- 余計な挨拶は控え、ツール呼び出しを優先してください。`
                ].join('\n');

                this.ollama.resetHistory();
                this.ollama.setSystemPrompt(plannerSystemPrompt);

                const plannerRequest = [
                    `現在の位置: ${this.env.describe()}`,
                    `目標座標: x=${target.target_x}, y=${target.target_y}, angle=${target.target_angle}`
                ].join('\n');

                const plannerResponse = await this.ollama.chat(plannerRequest, tools);
                steps.push(plannerResponse);

                if (plannerResponse.tool_calls && plannerResponse.tool_calls.length > 0) {
                    iteration++;
                    this.onStep({ 
                        type: 'acting', 
                        iteration, 
                        toolCalls: plannerResponse.tool_calls,
                        content: plannerResponse.content
                    });

                    // ツール実行
                    const results = await this.executor.executeAll(plannerResponse.tool_calls);
                    if (this.isCancelled) break;

                    // 実行結果を履歴に追加（評価用）
                    await this.ollama.continueWithToolResults(plannerResponse.tool_calls, results, tools);

                    // --- Phase 3: Evaluator (評価) ---
                    this.onStep({ type: 'thinking', iteration, message: "到達状況を確認中..." });
                    
                    const postActionEnv = this.env.describe();
                    const evaluatorSystemPrompt = [
                        `あなたは toio の移動結果を評価するエバリュエーターです。`,
                        `目標座標と、ツール実行後の現在位置を比較し、目標に十分近い（誤差±10以内程度）かどうかを判定してください。`,
                        ``,
                        `## 出力形式`,
                        `必ず以下のJSON形式のみを出力してください。`,
                        `{`,
                        `  "success": boolean,`,
                        `  "distance": 数値 (目標との距離),`,
                        `  "reasoning": "なぜそのように判定したか"`,
                        `}`
                    ].join('\n');

                    this.ollama.resetHistory();
                    this.ollama.setSystemPrompt(evaluatorSystemPrompt);

                    const evaluatorRequest = [
                        `目標: x=${target.target_x}, y=${target.target_y}`,
                        `実行後の状態: ${postActionEnv}`
                    ].join('\n');

                    const evaluatorResponse = await this.ollama.chat(evaluatorRequest, [], { jsonMode: true });
                    let evaluation;
                    try {
                        evaluation = JSON.parse(evaluatorResponse.content);
                    } catch (e) {
                        evaluation = { success: true }; // パース失敗時はとりあえず終了
                    }

                    if (evaluation.success) {
                        reachedGoal = true;
                        finalMessage = `目標位置 (${target.target_x}, ${target.target_y}) に到達しました。${target.reasoning}`;
                    } else {
                        refinementCount++;
                        this.onStep({ 
                            type: 'thinking', 
                            iteration, 
                            message: `目標未達 (距離: ${Math.round(evaluation.distance)})。再調整を行います (${refinementCount}/${maxRefinementLoops})` 
                        });
                    }
                } else {
                    // ツール呼び出しがなかった場合
                    reachedGoal = true;
                    finalMessage = plannerResponse.content;
                }
            }

            if (this.isCancelled) {
                finalMessage = "ユーザーによってキャンセルされました。";
            } else if (refinementCount >= maxRefinementLoops) {
                finalMessage = `目標付近まで移動を繰り返しましたが、完全に一致させることはできませんでした（最後の理由: ${target.reasoning}）。`;
            }

            // メモリ保存
            const summary = `ユーザー: "${userMessage}" / 目標: (${target.target_x}, ${target.target_y}) / 結果: ${finalMessage}`;
            this.memory.addSummary(summary);

            this.onStep({ type: 'done', iteration, content: finalMessage });

            return {
                steps,
                finalMessage,
                iterationCount: iteration,
                cancelled: this.isCancelled
            };

        } catch (error) {
            console.error("AgentLoop error:", error);
            this.onStep({ type: 'error', iteration, error: error.message });
            throw error;
        }
    }
}
