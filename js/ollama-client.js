/**
 * Ollama REST API Client
 */
class OllamaClient {
    constructor(baseUrl = 'http://localhost:11434', model = 'gemma4:e4b') {
        this.baseUrl = baseUrl.replace(/\/$/, "");
        this.model = model;
        this.chatHistory = [];
        this.abortController = null;
        
        // Default System prompt
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

    async checkConnection() {
        try {
            const res = await fetch(`${this.baseUrl}/api/tags`);
            return res.ok;
        } catch (e) {
            return false;
        }
    }

    async sendMessages(tools, options = {}) {
        const MAX_RETRIES = 3;
        const FETCH_TIMEOUT_MS = 30000;
        
        const payload = {
            model: this.model,
            messages: this.chatHistory,
            tools: tools,
            stream: false,
            options: {
                num_ctx: 32768,
                ...(options.modelOptions || {})
            }
        };
        
        if (options.jsonMode) {
            payload.format = "json";
        }

        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
            this.abortController = new AbortController();
            let timedOut = false;
            const timeoutId = setTimeout(() => {
                timedOut = true;
                if (this.abortController) this.abortController.abort();
            }, FETCH_TIMEOUT_MS);

            try {
                const response = await fetch(`${this.baseUrl}/api/chat`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                    signal: this.abortController.signal
                });
                clearTimeout(timeoutId);

                if (!response.ok) {
                    const errText = await response.text();
                    if ((response.status >= 500) && attempt < MAX_RETRIES - 1) {
                        const delay = Math.pow(2, attempt) * 1000;
                        console.warn(`[Ollama] HTTP ${response.status} — retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
                        this.abortController = null;
                        await new Promise(r => setTimeout(r, delay));
                        continue;
                    }
                    throw new Error(`Ollama API returned ${response.status}: ${errText}`);
                }

                const data = await response.json();
                const message = data.message;
                
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
                
                // Network error retry
                if (attempt < MAX_RETRIES - 1) {
                    const delay = Math.pow(2, attempt) * 1000;
                    console.warn(`[Ollama] Network error — retrying in ${delay}ms:`, error.message);
                    await new Promise(r => setTimeout(r, delay));
                    continue;
                }
                
                console.error("Ollama Chat Error:", error);
                throw error;
            }
        }
    }

    async chat(userText, tools, options = {}) {
        this.chatHistory.push({ role: "user", content: userText });
        return this.sendMessages(tools, options);
    }

    addToolResults(toolCalls, results) {
        for(let i=0; i < toolCalls.length; i++) {
            this.chatHistory.push({
                role: "tool",
                content: results[i],
                name: toolCalls[i].function.name
            });
        }
    }

    async continueWithToolResults(toolCalls, results, tools) {
        this.addToolResults(toolCalls, results);
        return this.sendMessages(tools);
    }
}
