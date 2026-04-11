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
        let isDone = false;
        let finalMessage = "";
        const steps = [];

        try {
            // Setup memory and static context for this session
            const staticContext = this.spatial.getStaticGuide();
            const memoryContext = this.memory.buildContextString();
            
            // Build system prompt
            let systemPrompt = [
                `あなたは toio キューブを操作するアシスタントです。`,
                `小型ロボットキューブ「toio」をマット上で動かして、ユーザーとインタラクションします。`,
                ``,
                `## 応答スタイル`,
                `- 落ち着いた、簡潔な日本語で応答すること。丁寧だが過剰に丁寧にならないこと`,
                `- 「！」の多用、過度な絵文字、大げさな表現（「素晴らしい！」「了解しました！！」等）は避けること`,
                `- 事実を淡々と伝え、必要なことだけを話すこと。冗長な前置きは不要`,
                `- 結果報告は1〜2文で簡潔にまとめること`,
                ``,
                `## 行動ルール`,
                `1. 複雑な指示は \`think\` ツールで計画を立ててから段階的に実行すること`,
                `2. アクション実行後は結果を確認し、必要に応じて追加アクションを行うこと`,
                `3. 環境情報（キューブの位置・状態）と空間情報を活用して的確に行動すること`,
                `4. 目標が達成されたらツールを呼ばず、テキストで結果を報告すること`,
                `5. マットの端に近い場合は慎重に動くこと（落下防止）`,
                ``,
                staticContext,
                ``,
                memoryContext
            ].join('\n');

            this.ollama.setSystemPrompt(systemPrompt);

            // Fetch dynamic context for the first run
            const initialEnv = this.env.describe();
            const fullUserMessage = [
                `[SYSTEM INJECTION: 現在の環境状態]`,
                initialEnv,
                ``,
                `[USER MESSAGE]`,
                userMessage
            ].join('\n');

            // --- Initial Chat ---
            this.onStep({ type: 'thinking', iteration, message: "AI推論中..." });
            let response = await this.ollama.chat(fullUserMessage, tools);

            while (!isDone && iteration < this.maxIterations && !this.isCancelled) {
                steps.push(response);
                
                // --- Decide ---
                if (response.tool_calls && response.tool_calls.length > 0) {
                    iteration++;
                    this.onStep({ 
                        type: 'acting', 
                        iteration, 
                        toolCalls: response.tool_calls,
                        content: response.content
                    });

                    // --- Act ---
                    const results = await this.executor.executeAll(response.tool_calls);
                    
                    if (this.isCancelled) break;

                    // --- Observe (inject fresh state into tool results if needed, but normally environment is pulled by get_position tool)
                    // Currently we just pass the tool execution results
                    
                    this.onStep({ type: 'thinking', iteration, message: "結果を分析中..." });
                    response = await this.ollama.continueWithToolResults(response.tool_calls, results, tools);

                } else {
                    // No tool calls, consider done
                    isDone = true;
                    finalMessage = response.content;
                }
            }

            if (this.isCancelled) {
                finalMessage = "ユーザーによってキャンセルされました。";
            } else if (iteration >= this.maxIterations) {
                finalMessage = `イテレーション上限（${this.maxIterations}回）に達したため終了しました。`;
            }

            // --- Post-session summary ---
            if (userMessage.length > 10 || steps.length > 1) {
                // Generate a brief summary of what happened to store in memory (optional, but good for context)
                // For simplicity, we just store the user command and final resolution roughly
                const summary = `ユーザー: "${userMessage}" / 最終状態: ${finalMessage ? finalMessage.substring(0, 50) + '...' : 'ツール実行完了'}`;
                this.memory.addSummary(summary);
            }

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
