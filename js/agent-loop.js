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

    // #1: LLM を使わずローカルで達成判定
    _localEvaluate(toolCalls, results) {
        const moveCallIdx = toolCalls.findIndex(c => c.function.name === 'move_to');
        if (moveCallIdx !== -1) {
            let target = toolCalls[moveCallIdx].function.arguments;
            try {
                if (typeof target === 'string') {
                    target = JSON.parse(target);
                }
                const resData = JSON.parse(results[moveCallIdx]);
                if (resData.clamped_target) {
                    target = { ...target, ...resData.clamped_target };
                }
            } catch (e) {
                // パース失敗時はそのまま target (文字列 or オブジェクト) を使用
                console.warn("[AgentLoop] Error parsing move_to target/result during evaluation:", e);
            }
            
            const actual = this.env.getSnapshot().cube;

            const dx = Math.abs(actual.x - target.x);
            const dy = Math.abs(actual.y - target.y);

            // 0/360 またぎを考慮した角度差
            const rawDa = Math.abs(actual.angle - (target.angle || 0));
            const da = Math.min(rawDa, 360 - rawDa);

            const posOk   = dx <= 15 && dy <= 15;
            const angleOk = da <= 25;

            return {
                success: posOk && angleOk,
                reasoning: `pos delta(${dx},${dy}) angle delta(${da}deg)`
            };
        }

        // move_to 以外（LED・音・spin等）: 全ツールが success なら完了
        const allSuccess = results.every(r => {
            try { return JSON.parse(r).status === 'success'; }
            catch { return false; }
        });
        return { success: allSuccess, reasoning: allSuccess ? "全ツール成功" : "ツール失敗あり" };
    }

    async run(userMessage, tools) {
        this.isCancelled = false;
        let iteration = 0;
        let steps = [];

        try {
            // #5: Planner + Generator を統合した単一 Executor プロンプト
            const memoryContext = this.memory.buildContextString();
            const executorSystemPrompt = [
                `あなたは toio キューブを直接操作するエージェントです。`,
                memoryContext ? memoryContext : "",
                `ユーザーの指示を達成するために、必要なツールを順番に呼び出してください。`,
                ``,
                `## 行動ルール`,
                `- まず頭の中で手順を考え、そのまま move_to / set_light / play_sound を呼ぶ。`,
                `- move_to(x, y, angle): 移動と向き変更を同時に行える。必ず1回の呼び出しで完了させること。`,
                `- 向きだけ変えたい場合は、現在位置の座標をそのまま使い angle だけ変更する。`,
                `- ツール呼び出しの合計は最大5回まで。`,
                `- 余計な確認や質問はしない。すぐに行動する。`,
                ``,
                `## フィジカル環境`,
                this.spatial.getStaticGuide()
            ].join('\n');

            this.ollama.resetHistory();
            this.ollama.setSystemPrompt(executorSystemPrompt);

            this.onStep({
                type: 'thinking',
                iteration,
                maxIterations: this.maxIterations,
                message: "指示を解析して行動しています..."
            });

            const request = [
                `[現在の環境] ${this.env.describe()}`,
                `[ユーザー指示] ${userMessage}`
            ].join('\n');

            let currentResponse = await this.ollama.chat(request, tools);
            steps.push(currentResponse);

            // ツール呼び出しループ
            while (currentResponse.tool_calls?.length > 0 && !this.isCancelled && iteration < this.maxIterations) {
                const toolCalls = currentResponse.tool_calls;
                iteration++;

                this.onStep({
                    type: 'acting',
                    iteration,
                    maxIterations: this.maxIterations,
                    toolCalls,
                    content: currentResponse.content
                });

                const results = await this.executor.executeAll(toolCalls);
                if (this.isCancelled) break;

                // #1: ローカル評価（LLM 不要）
                const evaluation = this._localEvaluate(toolCalls, results);
                this.onStep({
                    type: 'thinking',
                    iteration,
                    maxIterations: this.maxIterations,
                    message: evaluation.success
                        ? `完了: ${evaluation.reasoning}`
                        : `継続中: ${evaluation.reasoning}`
                });

                currentResponse = await this.ollama.continueWithToolResults(toolCalls, results, tools);
                steps.push(currentResponse);
            }

            const finalMessage = this.isCancelled ? "キャンセルされました。" : "完了しました。";

            // セッション記憶に保存
            this.memory.addSummary(`[指示]: "${userMessage}" / [結果]: ${finalMessage} / [ステップ数]: ${iteration}`);

            // LLM が最後にテキスト応答を返した場合はそれを表示
            const finalContent = (!currentResponse.tool_calls?.length && currentResponse.content)
                ? currentResponse.content
                : finalMessage;

            this.onStep({
                type: 'done',
                iteration,
                maxIterations: this.maxIterations,
                content: finalContent
            });

            return { steps, finalMessage, iterationCount: iteration, cancelled: this.isCancelled };

        } catch (error) {
            console.error("AgentLoop error:", error);
            this.onStep({
                type: 'error',
                iteration,
                maxIterations: this.maxIterations,
                error: error.message
            });
            throw error;
        }
    }
}
