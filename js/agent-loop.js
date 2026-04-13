class AgentLoop {
    constructor(ollamaClient, toolExecutor, environment, sessionMemory, spatialAwareness, options = {}) {
        this.ollama = ollamaClient;
        this.executor = toolExecutor;
        this.env = environment;
        this.memory = sessionMemory;
        this.spatial = spatialAwareness;
        
        this.maxIterations = options.maxIterations || 30;
        this.onStep = options.onStep || (() => {});
        this.isCancelled = false;
    }

    cancel() {
        this.isCancelled = true;
        this.ollama.cancel();
    }

    async run(userMessage, tools) {
        this.isCancelled = false;
        let totalIteration = 0;
        let steps = [];
        let finalMessage = "";

        try {
            // --- Phase 1: Planner (タスク設計) ---
            this.onStep({ type: 'thinking', iteration: totalIteration, message: "要求を分析して計画を立てています..." });
            
            const currentEnv = this.env.describe();
            const staticContext = this.spatial.getStaticGuide();
            
            const plannerSystemPrompt = [
                `あなたは toio キューブの動作計画を立てるプランナーです。`,
                `ユーザーの要望を達成するために、必要な手順（タスク）を列挙してください。`,
                ``,
                `## 利用可能なアクション`,
                `- move_to(x, y, angle): 指定座標・角度へ移動。移動と向き変更を同時に行える。`,
                `- set_light(red, green, blue): LEDの色を変更。`,
                `- play_sound(note_id, duration_ms): 音を鳴らす。`,
                `- spin(direction, duration_ms): その場で回転。`,
                ``,
                `## ルール`,
                `- タスクは具体的かつ実行可能な単位で分割してください。`,
                `- タスクは最大5つまでに制限してください。少なければ少ないほど良いです。`,
                `- 各タスクには 'description' を含めてください。`,
                `- 移動と向き変更は常に1タスクにまとめてください（例: 「(250, 200)に向き180度で移動」）。`,
                `- LED点灯や音などのアクションが必要な場合は、それもタスクに含めてください（例: 「LEDを赤く点灯してから(200, 300)に移動」）。`,
                `- description には必ず具体的な座標と角度を含めてください。`,
                `- 出力は必ず以下のJSON形式のみで行ってください。`,
                `{`,
                `  "tasks": [`,
                `    { "description": "LEDを赤く点灯し、(250, 200)に向き0度で移動" },`,
                `    ...`,
                `  ],`,
                `  "reasoning": "計画全体の考え方"`,
                `}`,
                ``,
                `## フィジカル環境`,
                staticContext
            ].join('\n');

            this.ollama.resetHistory();
            this.ollama.setSystemPrompt(plannerSystemPrompt);
            
            const plannerRequest = [
                `[現在の環境]`,
                currentEnv,
                ``,
                `[ユーザー指示]`,
                userMessage
            ].join('\n');

            const plannerResult = await this.ollama.chat(plannerRequest, [], { jsonMode: true });
            let plan;
            try {
                plan = JSON.parse(plannerResult.content);
            } catch (e) {
                console.error("Failed to parse planner response:", plannerResult.content);
                throw new Error("プランナーの結果を解析できませんでした。");
            }

            if (!plan.tasks || plan.tasks.length === 0) {
                this.onStep({ type: 'done', iteration: totalIteration, maxIterations: this.maxIterations, content: "実行すべきタスクが見つかりませんでした。" });
                return { steps, finalMessage: "タスクなし", iterationCount: totalIteration };
            }

            this.onStep({ 
                type: 'planned', 
                iteration: totalIteration, 
                maxIterations: this.maxIterations,
                plan: plan 
            });

            // タスク実行ループ
            for (const currentTask of plan.tasks) {
                if (this.isCancelled || totalIteration >= this.maxIterations) break;

                let taskReached = false;
                let taskIteration = 0;
                const maxTaskRetries = 5;
                let lastExecutionFeedback = "";

                while (!taskReached && taskIteration < maxTaskRetries && !this.isCancelled && totalIteration < this.maxIterations) {
                    // --- Phase 2: Generator (行動生成) ---
                    const generatorSystemPrompt = [
                        `あなたは toio キューブを操作するジェネレーターです。`,
                        `提示された「現在のタスク」を達成するためだけに、適切なツールを呼び出してください。`,
                        ``,
                        `## ルール`,
                        `- 1タスク = 1回の \`move_to\` 呼び出しで完了させてください。`,
                        `- \`move_to(x, y, angle)\` は移動と向き変更を同時に行えます。`,
                        `- 向きだけ変えたい場合は、現在位置の座標をそのまま使い、angle だけ変更してください。`,
                        `- LED点灯等の追加アクションがある場合のみ、2回目の呼び出しを行ってください。`,
                        ``,
                        `## 現在のタスク`,
                        currentTask.description,
                        ``,
                        `## フィジカル環境`,
                        this.spatial.getStaticGuide()
                    ].join('\n');

                    // ✅ ステートレス化: 毎回履歴をリセットして1タスクに集中させる
                    this.ollama.resetHistory();
                    this.ollama.setSystemPrompt(generatorSystemPrompt);

                    const generatorRequest = [
                        `[現在の環境] ${this.env.describe()}`,
                        taskIteration > 0 ? `⚠️ 注意: 前回は未達成でした。フィードバック: ${lastExecutionFeedback}` : ""
                    ].join('\n');

                    // Agent用に制限されたツールのみを渡す
                    const agentTools = tools.filter(t => 
                        ["move_to", "get_position", "stop", "set_light", "play_sound", "wait", "get_battery", "spin"].includes(t.function.name)
                    );

                    let currentResponse = await this.ollama.chat(generatorRequest, agentTools);
                    steps.push(currentResponse);

                    let allToolCallsForStep = [];
                    let allResultsForStep = [];
                    const maxToolCallsPerTask = 5; // 1タスクあたりのツール呼び出し上限

                    // ツール実行ループ (上限付き)
                    while (currentResponse.tool_calls && currentResponse.tool_calls.length > 0 
                           && !this.isCancelled 
                           && totalIteration < this.maxIterations
                           && allToolCallsForStep.length < maxToolCallsPerTask) {
                        const toolCalls = currentResponse.tool_calls;
                        allToolCallsForStep.push(...toolCalls);
                        
                        totalIteration++;
                        this.onStep({ 
                            type: 'acting', 
                            iteration: totalIteration, 
                            maxIterations: this.maxIterations,
                            toolCalls: toolCalls,
                            content: currentResponse.content
                        });

                        // ツール実行
                        const results = await this.executor.executeAll(toolCalls);
                        allResultsForStep.push(...results);
                        if (this.isCancelled) break;

                        // 上限に達していなければ継続
                        if (allToolCallsForStep.length < maxToolCallsPerTask) {
                            currentResponse = await this.ollama.continueWithToolResults(toolCalls, results, agentTools);
                            steps.push(currentResponse);
                        }
                    }

                    taskIteration++;
                    lastExecutionFeedback = allResultsForStep.join(" / ");

                    // --- Phase 3: Evaluator (評価) ---
                    if (allToolCallsForStep.length === 0 && !currentResponse.content) {
                         // 何もツールを呼ばなかった場合
                         taskReached = true;
                         continue;
                    }

                    this.onStep({ 
                        type: 'thinking', 
                        iteration: totalIteration, 
                        maxIterations: this.maxIterations,
                        message: "タスクの達成状況を評価中..." 
                    });
                    
                    const evaluatorSystemPrompt = [
                        `あなたは toio の行動結果を判定するエバリュエーターです。`,
                        `指定されたタスクの内容に対し、実行後の現在の状態と実行ログを見て、適切に完了したか判定してください。`,
                        ``,
                        `## 判定基準`,
                        `- 座標: 目標との誤差が±10単位以内なら「到達」と判定する。`,
                        `- 角度: 目標との誤差が±20度以内なら「達成」と判定する。`,
                        `- マットの端では安全範囲へのクランプが行われるため、端付近の座標は数単位のズレが正常です。`,
                        `- LED点灯や音のタスクは、ツール呼び出しが成功していれば「完了」とする。`,
                        `- 総合的に「十分に近い」「おおむね達成」であれば完了と判定してください。完璧を求めないでください。`,
                        ``,
                        `## 出力形式`,
                        `必ず以下のJSON形式のみを出力してください。`,
                        `{`,
                        `  "success": boolean,`,
                        `  "reasoning": "判定理由"`,
                        `}`
                    ].join('\n');

                    this.ollama.resetHistory(); // Evaluatorは独立して判定
                    this.ollama.setSystemPrompt(evaluatorSystemPrompt);

                    const evaluatorRequest = [
                        `[判定対象のタスク]: ${currentTask.description}`,
                        `[実行ログ]: ${JSON.stringify(allToolCallsForStep.map((c, idx) => ({ tool: c.function.name, result: allResultsForStep[idx] })))}`,
                        `[現在の状態]: ${this.env.describe()}`
                    ].join('\n');

                    const evaluatorResponse = await this.ollama.chat(evaluatorRequest, [], { jsonMode: true });
                    let evaluation;
                    try {
                        evaluation = JSON.parse(evaluatorResponse.content);
                    } catch (e) {
                        evaluation = { success: false, reasoning: "評価結果のパースに失敗しました。再試行が必要です。" };
                    }

                    if (evaluation.success) {
                        taskReached = true;
                        this.onStep({ 
                            type: 'thinking', 
                            iteration: totalIteration, 
                            maxIterations: this.maxIterations,
                            message: `タスク完了: ${evaluation.reasoning || currentTask.description}` 
                        });
                    } else {
                        this.onStep({ 
                            type: 'thinking', 
                            iteration: totalIteration, 
                            maxIterations: this.maxIterations,
                            message: `タスク未完了: ${evaluation.reasoning}。再試行します (${taskIteration}/${maxTaskRetries})` 
                        });
                    }
                }

                if (taskIteration >= maxTaskRetries && !taskReached) {
                    this.onStep({ 
                        type: 'thinking', 
                        iteration: totalIteration, 
                        maxIterations: this.maxIterations,
                        message: `警告: タスク "${currentTask.description}" は最大試行回数に達しましたが、未達成の可能性があります。` 
                    });
                }
            }

            finalMessage = this.isCancelled ? "キャンセルされました。" : "すべてのタスクが完了しました。";

            // 履歴保存
            const summary = `[ユーザー指示]: "${userMessage}" / [思考プロセス]: ${plan.reasoning} / [結果]: ${finalMessage}`;
            this.memory.addSummary(summary);

            this.onStep({ 
                type: 'done', 
                iteration: totalIteration, 
                maxIterations: this.maxIterations,
                content: finalMessage 
            });

            return {
                steps,
                finalMessage,
                iterationCount: totalIteration,
                cancelled: this.isCancelled
            };

        } catch (error) {
            console.error("AgentLoop error:", error);
            this.onStep({ 
                type: 'error', 
                iteration: totalIteration, 
                maxIterations: this.maxIterations,
                error: error.message 
            });
            throw error;
        }
    }
}
