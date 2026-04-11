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
                `## ルール`,
                `- タスクは具体的かつ実行可能な単位で分割してください。`,
                `- 各タスクには 'description' を含めてください。`,
                `- 出力は必ず以下のJSON形式のみで行ってください。`,
                `{`,
                `  "tasks": [`,
                `    { "description": "xxxへ移動する" },`,
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
                if (this.isCancelled) break;

                let taskReached = false;
                let taskIteration = 0;
                const maxTaskRetries = 3;
                let lastExecutionFeedback = "";

                while (!taskReached && taskIteration < maxTaskRetries && !this.isCancelled) {
                    // --- Phase 2: Generator (行動生成) ---
                    const generatorSystemPrompt = [
                        `あなたは toio キューブを操作するジェネレーターです。`,
                        `提示された「現在のタスク」を達成するために、適切なツールを呼び出してください。`,
                        ``,
                        `## コンテキスト`,
                        `- 全体の計画: ${JSON.stringify(plan.tasks)}`,
                        `- 現在のタスク: ${currentTask.description}`,
                        ``,
                        `## 行動ルール`,
                        `- 1つのタスクを完了させるために、必要なだけ何度でもツールを呼び出してください。`,
                        `- 移動とアクション（LED点灯など）が必要な場合、通常は \`move_to\` を呼び出した後に、次のステップで \`set_light\` などを呼び出します。`,
                        `- 座標への移動には \`move_to\` を優先的に使用してください。これには目的地の向き (angle) も指定可能です。`,
                        `- 以前の試行で解決できなかった問題（マットの端に到達したなど）がある場合は、それを踏まえて行動を変更してください。`
                    ].join('\n');

                    this.ollama.setSystemPrompt(generatorSystemPrompt);

                    const generatorRequest = [
                        `[状況] 現在の位置/状態: ${this.env.describe()}`,
                        `[現在取り組むべきタスク]: ${currentTask.description}`,
                        taskIteration > 0 ? `⚠️ 注意: これは再試行(${taskIteration + 1}回目) です。前回の実行結果: ${lastExecutionFeedback}` : ""
                    ].join('\n');

                    let currentResponse = await this.ollama.chat(generatorRequest, tools);
                    steps.push(currentResponse);

                    let allToolCallsForStep = [];
                    let allResultsForStep = [];

                    // ツール実行ループ (AIがツールを出し続ける限り実行する)
                    while (currentResponse.tool_calls && currentResponse.tool_calls.length > 0 && !this.isCancelled) {
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

                        // 継続のために履歴を更新
                        currentResponse = await this.ollama.continueWithToolResults(toolCalls, results, tools);
                        steps.push(currentResponse);
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
                        `## 判定のポイント`,
                        `- 移動を伴うタスクの場合、現在位置が目標に十分近いか（誤差10単位程度は許容）。`,
                        `- 複数のアクション（LED点灯など）が含まれる場合、それらのツール呼び出しが成功しているか。`,
                        ``,
                        `## 出力形式`,
                        `必ず以下のJSON形式のみを出力してください。`,
                        `{`,
                        `  "success": boolean,`,
                        `  "reasoning": "判定理由。未達の場合、具体的になぜか、どうすべきか"`,
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
