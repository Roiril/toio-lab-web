/**
 * Ollama REST API Client
 */
class OllamaClient {
    constructor(baseUrl = 'http://localhost:11434', model = 'gemma4:e4b') {
        this.baseUrl = baseUrl.replace(/\/$/, ""); // remove trailing slash
        this.model = model;
        this.chatHistory = [];
        
        // System prompt to set behavior
        this.chatHistory.push({
            role: "system",
            content: "You are an intelligent controller for a small robot cube called 'toio'. Your job is to translate user natural language commands into robot actions using the provided tools. Be concise, friendly, and output Japanese text describing what you are going to do before or after calling tools. Make sure to use tool calls!"
        });
    }

    /**
     * Check if Ollama is accessible
     */
    async checkConnection() {
        try {
            const res = await fetch(`${this.baseUrl}/api/tags`);
            return res.ok;
        } catch (e) {
            return false;
        }
    }

    /**
     * Send a single message and tools array to Ollama
     */
    async chat(userText, tools) {
        // Add user message to history
        this.chatHistory.push({
            role: "user",
            content: userText
        });

        const payload = {
            model: this.model,
            messages: this.chatHistory,
            tools: tools,
            stream: false // Non-streaming for simpler tool call extraction
        };

        try {
            const response = await fetch(`${this.baseUrl}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error(`Ollama API returned ${response.status}`);
            }

            const data = await response.json();
            const message = data.message;
            
            // Appending Assistant Response
            this.chatHistory.push(message);

            return message;

        } catch (error) {
            console.error("Ollama Chat Error:", error);
            throw error;
        }
    }

    /**
     * Send tool response back to the model
     */
    async submitToolResults(toolCalls, results) {
        // results should be array of strings corresponding to toolCalls
        for(let i=0; i < toolCalls.length; i++) {
            this.chatHistory.push({
                role: "tool",
                content: results[i],
                name: toolCalls[i].function.name
            });
        }

        // Send follow-up request to get final natural text answer if needed
        const payload = {
            model: this.model,
            messages: this.chatHistory,
            stream: false
        };

        try {
            const response = await fetch(`${this.baseUrl}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error(`Ollama API returned ${response.status}`);
            }

            const data = await response.json();
            const message = data.message;
            
            this.chatHistory.push(message);

            return message;

        } catch (error) {
            console.error("Ollama Chat Tool-followup Error:", error);
            throw error;
        }
    }
}
