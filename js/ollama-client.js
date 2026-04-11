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

    async _sendRequest(tools, options = {}) {
        this.abortController = new AbortController();
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

        try {
            const response = await fetch(`${this.baseUrl}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                signal: this.abortController.signal
            });

            if (!response.ok) {
                throw new Error(`Ollama API returned ${response.status}`);
            }

            const data = await response.json();
            const message = data.message;
            
            this.chatHistory.push(message);
            this.abortController = null;
            return message;

        } catch (error) {
            this.abortController = null;
            if (error.name === 'AbortError') {
                throw new Error("Cancelled by user");
            }
            console.error("Ollama Chat Error:", error);
            throw error;
        }
    }

    async chat(userText, tools, options = {}) {
        this.chatHistory.push({ role: "user", content: userText });
        return this._sendRequest(tools, options);
    }

    async continueWithToolResults(toolCalls, results, tools) {
        for(let i=0; i < toolCalls.length; i++) {
            this.chatHistory.push({
                role: "tool",
                content: results[i],
                name: toolCalls[i].function.name
            });
        }
        return this._sendRequest(tools);
    }
}
