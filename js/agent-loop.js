class AgentLoop {
    constructor(ollamaClient, toolExecutor, environment, sessionMemory, spatialAwareness, options = {}) {
        this.ollama = ollamaClient;
        this.executor = toolExecutor;
        this.env = environment;
        this.memory = sessionMemory;
        this.spatial = spatialAwareness;

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
                `- ❗ 必ず最初に think() を呼び、計画を述べてからツールを実行すること。`,
                `- think() の中で「ユーザーが本当に求めていること」「どのツールをどの順番で呼ぶか」を明示する。`,
                `- 指示が曖昧な場合は確認せず、最も自然な解釈を think() の中で宣言してから実行する。`,
                `- ツールを呼ぶ直前に、テキストで「〜します」と一言宣言すること。`,
                `- 全ての操作が完了したら「〜しました！」とテキストで報告すること。`,
                `- ツール失敗や未到達の場合は「〜がうまくいかなかったので、もう一度試みます」と説明してからリトライすること。`,
                ``,
                `## move_to の挙動`,
                `- move_to(x, y, angle) は内部で3ステップで動作する:`,
                `  1. その場で目標座標の方向へ回転`,
                `  2. 目標座標へまっすぐ移動`,
                `  3. その場で最終角度 angle へ回転`,
                `- angle は 0=右(+X方向), 90=下(+Y方向), 180=左, 270=上。`,
                `- 向きだけ変えたい場合は、現在位置の座標をそのまま使い angle だけ変更する。`,
                `- 結果に warning が含まれていたら目標地点に未到達なので、move_to を再度呼び出すこと。`,
                ``,
                `## set_light_pattern の挙動`,
                `- repetitions=0 は無限ループ（別のライト命令が来るまで点灯し続ける）。`,
                `- spin や move_to と同時に使いたい場合は、set_light_pattern を先に呼び出し、その後 spin/move_to を呼ぶ。`,
                ``,
                `## 応答例（この形式を参考にすること）`,
                ``,
                `例1: "右に動いて"`,
                `→ think({thought: "現在位置を確認。右は+X方向なのでxを増やす。move_to(x=現在x+70, y=現在y, angle=0)を呼ぶ。"})`,
                `→ テキスト: "右に移動します！"`,
                `→ move_to(x=320, y=250, angle=0)`,
                `→ テキスト: "右に移動しました！"`,
                ``,
                `例2: "きらきら光りながらスピンして"`,
                `→ think({thought: "光りながらスピンするには set_light_pattern を先に呼び、その後 spin を呼ぶ順序が正しい。repetitions=0で無限ループにしてスピン中も光り続けるようにする。"})`,
                `→ テキスト: "きらきら光りながらスピンします！"`,
                `→ set_light_pattern(frames=[{duration_ms:150,red:255,green:200,blue:0},{duration_ms:150,red:0,green:180,blue:255}], repetitions=0)`,
                `→ spin(direction="cw", duration_ms=2000)`,
                `→ テキスト: "きらきらスピンしました！"`,
                ``,
                `例3: "前に進んで" (向き不明の場合)`,
                `→ think({thought: "現在のangleを確認し、その向きを「前」と解釈する。angle=0なら+X方向が前。"})`,
                `→ get_position()`,
                `→ think({thought: "現在angle=270（上向き）。前=上方向なのでyを減らす。move_to(x=現在x, y=現在y-70, angle=270)。"})`,
                `→ テキスト: "現在上向きなので、上方向に進みます！"`,
                `→ move_to(x=250, y=180, angle=270)`,
                `→ テキスト: "前に進みました！"`,
                ``,
                `## フィジカル環境`,
                this.spatial.getStaticGuide()
            ].join('\n');

            this.ollama.resetHistory();
            this.ollama.setSystemPrompt(executorSystemPrompt);

            this.onStep({
                type: 'thinking',
                iteration,

                message: "指示を解析して行動しています..."
            });

            const request = [
                `[現在の環境] ${this.env.describe()}`,
                `[ユーザー指示] ${userMessage}`
            ].join('\n');

            let currentResponse = await this.ollama.chat(request, tools);
            steps.push(currentResponse);

            // ツール呼び出しループ
            while (currentResponse.tool_calls?.length > 0 && !this.isCancelled) {
                const toolCalls = currentResponse.tool_calls;
                iteration++;

                this.onStep({
                    type: 'acting',
                    iteration,
    
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

                    message: evaluation.success
                        ? `完了: ${evaluation.reasoning}`
                        : `未到達: ${evaluation.reasoning}`
                });

                // 未到達の場合、LLM に渡す結果に警告を注入してリトライを促す
                let resultsForLLM = results;
                if (!evaluation.success) {
                    const moveCallIdx = toolCalls.findIndex(c => c.function.name === 'move_to');
                    if (moveCallIdx !== -1) {
                        resultsForLLM = [...results];
                        try {
                            const r = JSON.parse(resultsForLLM[moveCallIdx]);
                            r.warning = `目標地点に未到達 (${evaluation.reasoning})。move_to を再度呼び出して正確な位置へ移動してください。`;
                            resultsForLLM[moveCallIdx] = JSON.stringify(r);
                        } catch { /* パース失敗時はそのまま */ }
                    }
                }

                currentResponse = await this.ollama.continueWithToolResults(toolCalls, resultsForLLM, tools);
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

                content: finalContent
            });

            return { steps, finalMessage, iterationCount: iteration, cancelled: this.isCancelled };

        } catch (error) {
            console.error("AgentLoop error:", error);
            this.onStep({
                type: 'error',
                iteration,

                error: error.message
            });
            throw error;
        }
    }
}
