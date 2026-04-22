class AgentLoop {
    constructor(llmClient, toolExecutor, environment, sessionMemory, spatialAwareness, options = {}) {
        this.llm = llmClient;
        this.executor = toolExecutor;
        this.env = environment;
        this.memory = sessionMemory;
        this.spatial = spatialAwareness;

        this.onStep = options.onStep || (() => {});
        this.isCancelled = false;

        // 後方互換: 旧コードが this.ollama を参照していても動くようにエイリアス。
        this.ollama = llmClient;
    }

    cancel() {
        this.isCancelled = true;
        this.llm.cancel();
    }

    // Gemma系モデルのチャットテンプレートトークンを除去
    _sanitizeContent(content) {
        if (!content) return content;
        return content
            .replace(/<[a-zA-Z0-9_]+\|>/g, '')
            .replace(/<\|[a-zA-Z0-9_]+\|>/g, '')
            .replace(/<(start|end)_of_turn>/g, '')
            .trim();
    }

    /**
     * LLM を使わずローカルで達成判定。
     * 新ツール群 (move_relative / turn / move_to_landmark / move_to) は
     * tool-executor が必ず `movement` フィールドを返すので、それを一律に評価する。
     */
    _localEvaluate(toolCalls, results) {
        const movementIdx = results.findIndex(r => {
            try { return !!JSON.parse(r).movement; }
            catch { return false; }
        });

        if (movementIdx !== -1) {
            try {
                const data = JSON.parse(results[movementIdx]);
                const mv = data.movement;
                if (mv.reached) {
                    return { success: true, reasoning: `到達 (残 ${mv.distance_remaining}u / 角度差 ${mv.angle_delta}°)`, movementIdx };
                }
                return {
                    success: false,
                    reasoning: `未到達: 残り ${mv.distance_remaining}u / 角度差 ${mv.angle_delta}° / motor=${mv.motor_result}`,
                    movementIdx
                };
            } catch {
                // フォールスルー
            }
        }

        // 全ツールが success ステータスなら完了扱い
        const allSuccess = results.every(r => {
            try { return JSON.parse(r).status === 'success'; }
            catch { return false; }
        });
        return { success: allSuccess, reasoning: allSuccess ? "実行完了" : "ツール失敗あり" };
    }

    async run(userMessage, tools) {
        this.isCancelled = false;
        let iteration = 0;
        let steps = [];

        try {
            const memoryContext = this.memory.buildContextString();
            const executorSystemPrompt = [
                `あなたは toio キューブを操作するエージェント「トム」です。`,
                memoryContext ? memoryContext : "",
                ``,
                `## 基本方針`,
                `- ユーザーの指示を達成するために、必要なツールを function calling で呼び出してください。`,
                `- ツールを呼ぶ直前に一言だけ計画をテキストで述べてください（例: 「右に動きます」）。長い thinking は不要です。`,
                `- 全操作が完了したら「〜しました」と短く報告してください。`,
                `- 未到達や失敗（結果の reached=false）なら、差分を見て調整したツール呼び出しで再挑戦してください。`,
                `- 曖昧な指示は最も自然な解釈を選んで即実行してください。確認を求めないこと。`,
                ``,
                `## ツール選択の優先順位`,
                `1. 「右/左/上/下/前/後ろ に動く」系 → **move_relative(direction, distance)** を使う。座標計算は不要。`,
                `2. 「中央/左上/右下 に行く」系 → **move_to_landmark(landmark)** を使う。`,
                `3. 「90度回る / 向きを変える」系 → **turn(degrees)** を使う（正=時計回り、負=反時計回り）。`,
                `4. 精密な座標が既に分かっている場合のみ **move_to(x, y, angle)** を使う。`,
                `5. 「ちょっと」「ホーム」のような独自語彙を解釈した場合は **learn_calibration(word, meaning)** で記憶し、次回以降に活用する。`,
                ``,
                `## 並列呼び出し`,
                `- 独立した副作用（set_light / set_light_pattern）は同一ターンで並列に呼べます。`,
                `- 「光りながらスピン」は set_light_pattern(repetitions=0) → spin の順で呼ぶこと。`,
                ``,
                `## 禁止`,
                `- テキスト内に move_to(...) のような疑似コードを書かない。ツールは function calling で呼ぶ。`,
                `- 未定義のツールを捏造しない。`,
                ``,
                `## few-shot`,
                ``,
                `例1: "右に動いて"`,
                `→ テキスト: "右に動きます"`,
                `→ tool_calls: [move_relative({direction:"right", distance:"medium"})]`,
                `→ テキスト: "右に動きました"`,
                ``,
                `例2: "前にちょっと進んで"`,
                `→ テキスト: "前に少し進みます"`,
                `→ tool_calls: [move_relative({direction:"forward", distance:"small"})]`,
                `→ テキスト: "前に進みました"`,
                ``,
                `例3: "中央に行ってからくるっと一回転"`,
                `→ テキスト: "中央に移動してから回転します"`,
                `→ tool_calls: [move_to_landmark({landmark:"center"})]`,
                `→ （結果確認 reached=true）`,
                `→ tool_calls: [turn({degrees:360})]`,
                `→ テキスト: "中央で一回転しました"`,
                ``,
                `例4: "きらきら光りながらスピンして"`,
                `→ テキスト: "きらきら光りながらスピンします"`,
                `→ tool_calls: [set_light_pattern({frames:[...], repetitions:0}), spin({direction:"cw", duration_ms:2000})]`,
                `→ テキスト: "スピンしました"`,
                ``,
                `例5: "右に20mmずつ動いて"（ユーザー独自の距離感）`,
                `→ tool_calls: [learn_calibration({word:"20mm", meaning:"distance: 20mm"}), move_relative({direction:"right", distance_mm:20})]`,
                ``,
                this.spatial.getStaticGuide()
            ].filter(Boolean).join('\n');

            this.llm.resetHistory();
            this.llm.setSystemPrompt(executorSystemPrompt);

            this.onStep({ type: 'thinking', iteration, message: "指示を解析しています..." });

            const request = [
                `[現在の環境] ${this.env.describe()}`,
                `[ユーザー指示] ${userMessage}`
            ].join('\n');

            let currentResponse = await this.llm.chat(request, tools);
            steps.push(currentResponse);

            while (currentResponse.tool_calls?.length > 0 && !this.isCancelled) {
                const toolCalls = currentResponse.tool_calls;
                iteration++;

                this.onStep({
                    type: 'acting',
                    iteration,
                    toolCalls,
                    content: this._sanitizeContent(currentResponse.content)
                });

                const results = await this.executor.executeAll(toolCalls);
                if (this.isCancelled) break;

                const evaluation = this._localEvaluate(toolCalls, results);
                if (evaluation.reasoning !== null) {
                    this.onStep({
                        type: 'thinking',
                        iteration,
                        message: evaluation.success ? `完了: ${evaluation.reasoning}` : `未到達: ${evaluation.reasoning}`
                    });
                }

                // 未到達の場合、LLM に渡す結果に警告を注入してリトライを促す
                let resultsForLLM = results;
                if (!evaluation.success && typeof evaluation.movementIdx === 'number') {
                    resultsForLLM = [...results];
                    try {
                        const r = JSON.parse(resultsForLLM[evaluation.movementIdx]);
                        const mv = r.movement || {};
                        r.warning = `未到達: 目標 (${mv.target?.x},${mv.target?.y},${mv.target?.angle}°) に対し到達 (${mv.arrived_at?.x},${mv.arrived_at?.y},${mv.arrived_at?.angle}°)。残り距離 ${mv.distance_remaining}u / 角度差 ${mv.angle_delta}° / motor=${mv.motor_result}。差分を見て同じ方向にもう一度移動するか、座標指定 (move_to) で補正してください。`;
                        resultsForLLM[evaluation.movementIdx] = JSON.stringify(r);
                    } catch { /* ignore */ }
                }

                currentResponse = await this.llm.continueWithToolResults(toolCalls, resultsForLLM, tools);
                steps.push(currentResponse);
            }

            const finalMessage = this.isCancelled ? "キャンセルされました。" : "完了しました。";

            this.memory.addSummary(`[指示]: "${userMessage}" / [結果]: ${finalMessage} / [ステップ数]: ${iteration}`);

            const finalContent = (!currentResponse.tool_calls?.length && currentResponse.content)
                ? this._sanitizeContent(currentResponse.content)
                : finalMessage;

            this.onStep({ type: 'done', iteration, content: finalContent });

            return { steps, finalMessage, iterationCount: iteration, cancelled: this.isCancelled };

        } catch (error) {
            console.error("AgentLoop error:", error);
            this.onStep({ type: 'error', iteration, error: error.message });
            throw error;
        }
    }
}
