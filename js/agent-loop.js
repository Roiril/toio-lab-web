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
        let finalMessage = "";
        const steps = [];

        try {
            // --- Phase 1: Planner (計画作成) ---
            this.onStep({ type: 'thinking', iteration: totalIteration, message: "行動計画を立案中..." });
            
            const staticContext = this.spatial.getStaticGuide();
            const currentEnv = this.env.describe();
            const plannerSystemPrompt = [
                `あなたは toio キューブの行動計画を立案するプランナーです。`,
                `ユーザーの指示を達成するために必要なステップを分解し、タスクリストを作成してください。`,
                ``,
                `## タスクリストのルール`,
                `- 各タスクは具体的で、評価可能な内容にしてください。`,
                `- 移動が必要な場合は、移動先の座標 (x, y) と、**到着した直後に行うアクション（LED点灯、音、回転等）を1つのタスクにまとめて**記述してください。`,
                `- 可能な限り \`move_to\` ツールを使用し、目的地と最終的な向き (angle) を1回の手順で達成する計画を立ててください。`,
                `- 「移動」と「移動後に行う指示」を別々のタスクに分けないでください。`,
                `- JSON形式で出力してください。`,
                ``,
                `## 出力形式`,
                `必ず以下のJSON形式のみを出力してください。`,
                `{`,
                `  "tasks": [`,
                `    { "task_id": 1, "description": "座標(x, y)へ移動し(向きangle)、LEDを赤色にする" },`,
                `    ...`,
                `  ],`,
                `  "reasoning": "計画全体の考え方"`,
                `}`,
                ``,
                `## フィジカル環境情報`,
                staticContext
            ].join('\n');

            this.ollama.resetHistory();
            this.ollama.setSystemPrompt(plannerSystemPrompt);
            
            const plannerRequest = [
                `[現在の環境状態]`,
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
                throw new Error("プランナーの応答パースに失敗しました。");
            }

            if (!plan.tasks || plan.tasks.length === 0) {
                this.onStep({ type: 'done', iteration: totalIteration, content: "実行すべきタスクが見つかりませんでした。" });
                return { steps, finalMessage: "タスクなし", iterationCount: totalIteration };
            }

            this.onStep({ 
                type: 'thinking', 
                iteration: totalIteration, 
                message: `計画完了: ${plan.tasks.length}個のタスクを生成しました。` 
            });

            this.onStep({
                type: 'planned',
                plan: plan
            });

            // タスクごとに実行
            for (let i = 0; i < plan.tasks.length; i++) {
                if (this.isCancelled) break;
                
                const currentTask = plan.tasks[i];
                let taskIteration = 0;
                let taskReached = false;
                const maxTaskRetries = 3; // 1タスクあたりの最大試行回数

                this.onStep({ 
                    type: 'thinking', 
                    iteration: totalIteration, 
                    message: `タスク開始 (${i + 1}/${plan.tasks.length}): ${currentTask.description}` 
                });

                // タスク開始時に履歴をリセット（再試行ループ内では保持する）
                this.ollama.resetHistory();

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
                        `- 1回の手順ですべてのツール（移動 ＋ アクション）を呼び出し、タスクを完了させてください。`,
                        `- 座標への移動には \`move_to\` を優先的に使用してください。これは目的地の向き (angle) も指定可能です。`,
                        `- \`move_to\` ツールは目的地に到着するまで完了を待機（同期実行）します。到着後に次のツールが実行されるため、安全に連続実行できます。`,
                        `- 余計な説明は省き、ツール呼び出しを優先してください。`,
                        `- 以前の試行で失敗している場合は、履歴にあるフィードバックを元に微調整してください。`
                    ].join('\n');

                    this.ollama.setSystemPrompt(generatorSystemPrompt);

                    const generatorRequest = [
                        `[状況] 現在の位置/状態: ${this.env.describe()}`,
                        `[現在取り組むべきタスク]: ${currentTask.description}`,
                        taskIteration > 0 ? `⚠️ 注意: これは再試行 (${taskIteration + 1}回目) です。前回の失敗を踏まえて修正してください。` : ""
                    ].join('\n');

                    const generatorResponse = await this.ollama.chat(generatorRequest, tools);
                    steps.push(generatorResponse);

                    if (generatorResponse.tool_calls && generatorResponse.tool_calls.length > 0) {
                        totalIteration++;
                        taskIteration++;
                        
                        this.onStep({ 
                            type: 'acting', 
                            iteration: totalIteration, 
                            toolCalls: generatorResponse.tool_calls,
                            content: generatorResponse.content
                        });

                        // ツール実行
                        const results = await this.executor.executeAll(generatorResponse.tool_calls);
                        if (this.isCancelled) break;

                        // 実行結果を履歴に追加（評価用）
                        await this.ollama.continueWithToolResults(generatorResponse.tool_calls, results, tools);

                        // --- Phase 3: Evaluator (評価) ---
                        this.onStep({ type: 'thinking', iteration: totalIteration, message: "タスクの達成状況を評価中..." });
                        
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
                            `  "reasoning": "判定理由（未達成の場合は具体的になぜか、どうすべきか）"`,
                            `}`
                        ].join('\n');

                        this.ollama.resetHistory(); // Evaluatorは独立して判定
                        this.ollama.setSystemPrompt(evaluatorSystemPrompt);

                        const evaluatorRequest = [
                            `[判定対象のタスク]: ${currentTask.description}`,
                            `[実行ログ]: ${JSON.stringify(generatorResponse.tool_calls.map((c, idx) => ({ tool: c.function.name, result: results[idx] })))}`,
                            `[現在の状態]: ${this.env.describe()}`
                        ].join('\n');

                        const evaluatorResponse = await this.ollama.chat(evaluatorRequest, [], { jsonMode: true });
                        let evaluation;
                        try {
                            evaluation = JSON.parse(evaluatorResponse.content);
                        } catch (e) {
                            evaluation = { success: true, reasoning: "パース失敗のため成功とみなします" };
                        }

                        if (evaluation.success) {
                            taskReached = true;
                            this.onStep({ 
                                type: 'thinking', 
                                iteration: totalIteration, 
                                message: `タスク完了: ${currentTask.description}` 
                            });
                        } else {
                            this.onStep({ 
                                type: 'thinking', 
                                iteration: totalIteration, 
                                message: `タスク未達: ${evaluation.reasoning}。再試行します (${taskIteration}/${maxTaskRetries})` 
                            });
                        }
                    } else {
                        // ツール呼び出しがない場合
                        taskReached = true;
                        this.onStep({ type: 'thinking', iteration: totalIteration, message: "ツール呼び出しなしのため、タスク完了とみなします。" });
                    }
                }

                if (taskIteration >= maxTaskRetries && !taskReached) {
                    this.onStep({ 
                        type: 'thinking', 
                        iteration: totalIteration, 
                        message: `警告: タスク "${currentTask.description}" は最大試行回数に達しましたが、未完了の可能性があります。` 
                    });
                }
            }

            finalMessage = this.isCancelled ? "キャンセルされました。" : "全てのタスクを終了しました。";

            // メモリ保存
            const summary = `ユーザー: "${userMessage}" / 実行した計画: ${plan.reasoning} / 結果: ${finalMessage}`;
            this.memory.addSummary(summary);

            this.onStep({ type: 'done', iteration: totalIteration, content: finalMessage });

            return {
                steps,
                finalMessage,
                iterationCount: totalIteration,
                cancelled: this.isCancelled
            };

        } catch (error) {
            console.error("AgentLoop error:", error);
            this.onStep({ type: 'error', iteration: totalIteration, error: error.message });
            throw error;
        }
    }
}
