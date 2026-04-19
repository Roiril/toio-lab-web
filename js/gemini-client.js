/**
 * Google Gemini API Client (OpenAI-compatible endpoint)
 * Drop-in replacement for OllamaClient
 */
class GeminiClient {
    constructor(apiKey, model = 'gemini-2.5-flash') {
        this.apiKey = apiKey;
        this.model = model;
        this.baseUrl = 'https://generativelanguage.googleapis.com/v1beta/openai';
        this.chatHistory = [];
        this.abortController = null;

        this.systemPrompt = "You are an intelligent controller for a small robot cube called 'toio'.";
        this.resetHistory();
    }

    setSystemPrompt(prompt) {
        this.systemPrompt = prompt;
        if (this.chatHistory.length > 0 && this.chatHistory[0].role === "system") {
            this.chatHistory[0].content = prompt;
        } else {
            this.chatHistory.unshift({ role: "system", content: prompt });
        }
    }

    resetHistory() {
        this.chatHistory = [{ role: "system", content: this.systemPrompt }];
        this.cancel();
    }

    cancel() {
        if (this.abortController) {
            this.abortController.abort();
            this.abortController = null;
        }
    }

    /**
     * Check API connectivity.
     * @returns {Promise<{ok: boolean, reason: string}>}
     */
    async checkConnection() {
        if (!this.apiKey) return { ok: false, reason: 'APIキー未設定' };
        try {
            const res = await fetch(`${this.baseUrl}/models`, {
                headers: { 'Authorization': `Bearer ${this.apiKey}` }
            });
            if (res.ok) return { ok: true, reason: '' };
            if (res.status === 401) return { ok: false, reason: 'APIキーが無効です (401 Unauthorized)' };
            if (res.status === 403) return { ok: false, reason: 'APIキーのアクセス権限がありません (403 Forbidden)' };
            if (res.status === 429) return { ok: false, reason: 'レート制限に達しています (429 Too Many Requests)' };
            return { ok: false, reason: `APIエラー (HTTP ${res.status})` };
        } catch (e) {
            return { ok: false, reason: `ネットワークエラー: ${e.message}` };
        }
    }

    async sendMessages(tools, options = {}) {
        const MAX_RETRIES = 3;
        const FETCH_TIMEOUT_MS = 30000;

        // 送信前に tool_calls.arguments をオブジェクト→JSON文字列に戻す（Gemini API 要件）
        const messagesForApi = this.chatHistory.map(msg => {
            if (!msg.tool_calls) return msg;
            return {
                ...msg,
                tool_calls: msg.tool_calls.map(tc => ({
                    ...tc,
                    function: {
                        ...tc.function,
                        arguments: typeof tc.function.arguments === 'object'
                            ? JSON.stringify(tc.function.arguments)
                            : tc.function.arguments
                    }
                }))
            };
        });

        const payload = {
            model: this.model,
            messages: messagesForApi,
        };
        if (tools && tools.length > 0) payload.tools = tools;
        if (options.jsonMode) payload.response_format = { type: "json_object" };

        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
            this.abortController = new AbortController();
            let timedOut = false;
            const timeoutId = setTimeout(() => {
                timedOut = true;
                if (this.abortController) this.abortController.abort();
            }, FETCH_TIMEOUT_MS);

            try {
                const response = await fetch(`${this.baseUrl}/chat/completions`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${this.apiKey}`
                    },
                    body: JSON.stringify(payload),
                    signal: this.abortController.signal
                });
                clearTimeout(timeoutId);

                if (!response.ok) {
                    const errText = await response.text();
                    // Retry on rate-limit or server errors with exponential backoff
                    if ((response.status === 429 || response.status >= 500) && attempt < MAX_RETRIES - 1) {
                        const delay = Math.pow(2, attempt) * 1000;
                        console.warn(`[Gemini] HTTP ${response.status} — retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
                        this.abortController = null;
                        await new Promise(r => setTimeout(r, delay));
                        continue;
                    }
                    throw new Error(`Gemini API error ${response.status}: ${errText}`);
                }

                const data = await response.json();
                const message = data.choices[0].message;

                // OpenAI形式では arguments が JSON文字列なのでオブジェクトに変換
                if (message.tool_calls) {
                    message.tool_calls = message.tool_calls.map(tc => ({
                        ...tc,
                        function: {
                            ...tc.function,
                            arguments: typeof tc.function.arguments === 'string'
                                ? JSON.parse(tc.function.arguments)
                                : tc.function.arguments
                        }
                    }));
                }

                this.chatHistory.push(message);
                this.abortController = null;
                return message;

            } catch (error) {
                clearTimeout(timeoutId);
                this.abortController = null;

                if (error.name === 'AbortError') {
                    if (timedOut) throw new Error(`リクエストがタイムアウトしました (${FETCH_TIMEOUT_MS / 1000}s)`);
                    throw new Error("Cancelled by user");
                }

                // Network-level error — retry if attempts remain
                if (attempt < MAX_RETRIES - 1) {
                    const delay = Math.pow(2, attempt) * 1000;
                    console.warn(`[Gemini] Network error — retrying in ${delay}ms:`, error.message);
                    await new Promise(r => setTimeout(r, delay));
                    continue;
                }

                console.error("Gemini API Error:", error);
                throw error;
            }
        }
    }

    async chat(userText, tools, options = {}) {
        // pendingImage はカメラキャプチャ後に app.js からセットされる
        const imageBase64 = this.pendingImage || options.imageBase64;
        this.pendingImage = null;
        const content = imageBase64
            ? [
                { type: "text", text: userText },
                { type: "image_url", image_url: { url: imageBase64 } }
              ]
            : userText;
        this.chatHistory.push({ role: "user", content });
        return this.sendMessages(tools, options);
    }

    addToolResults(toolCalls, results) {
        for (let i = 0; i < toolCalls.length; i++) {
            this.chatHistory.push({
                role: "tool",
                tool_call_id: toolCalls[i].id,
                content: results[i]
            });
        }
    }

    async continueWithToolResults(toolCalls, results, tools) {
        this.addToolResults(toolCalls, results);
        return this.sendMessages(tools);
    }
}
