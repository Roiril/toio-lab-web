/**
 * MCP Bridge (browser side)
 *
 * Connects to the toio MCP server's WebSocket and forwards tool calls to the
 * existing ToolExecutor. Enables Claude Code to drive toio via this browser.
 *
 * Enable by opening the app with ?mcp=1 (and optionally &mcpPort=7777).
 */

class McpBridge {
    constructor(executor, { port = 7777, onStatus } = {}) {
        this.executor = executor;
        this.port = port;
        this.url = `ws://localhost:${port}`;
        this.ws = null;
        this.reconnectTimer = null;
        this.reconnectAttempt = 0;
        this.onStatus = onStatus || (() => {});
        this.isClosed = false;
        this.hasEverConnected = false;
    }

    connect() {
        this.isClosed = false;
        this._openSocket();
    }

    close() {
        this.isClosed = true;
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.ws) {
            try { this.ws.close(); } catch {}
            this.ws = null;
        }
        this.onStatus({ state: "closed" });
    }

    _openSocket() {
        try {
            this.ws = new WebSocket(this.url);
        } catch (e) {
            console.warn("[McpBridge] failed to construct WebSocket:", e);
            this._scheduleReconnect();
            return;
        }

        this.onStatus({ state: "connecting", url: this.url });

        this.ws.addEventListener("open", () => {
            console.log(`[McpBridge] connected to ${this.url}`);
            this.hasEverConnected = true;
            this.reconnectAttempt = 0;
            this.onStatus({ state: "open" });
        });

        this.ws.addEventListener("message", async (event) => {
            let msg;
            try { msg = JSON.parse(event.data); }
            catch (e) { console.warn("[McpBridge] bad message:", event.data); return; }

            if (msg.type === "call" && msg.id && msg.name) {
                await this._handleCall(msg);
            }
        });

        this.ws.addEventListener("close", () => {
            console.log("[McpBridge] disconnected");
            this.ws = null;
            // Only surface "disconnected" once we've been connected at least once —
            // otherwise initial probe failures (before claude spawns the MCP server)
            // spam the chat with "切断" messages.
            if (this.hasEverConnected) {
                this.onStatus({ state: "disconnected" });
            }
            if (!this.isClosed) this._scheduleReconnect();
        });

        this.ws.addEventListener("error", (e) => {
            console.warn("[McpBridge] socket error:", e);
        });
    }

    _scheduleReconnect() {
        if (this.isClosed || this.reconnectTimer) return;

        this.reconnectAttempt++;
        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempt - 1), 4000);

        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this._openSocket();
        }, delay);
    }

    async _handleCall(msg) {
        const call = {
            function: {
                name: msg.name,
                arguments: msg.arguments || {},
            },
        };

        let payload;
        try {
            const resultJson = await this.executor._execute(call);
            payload = { type: "result", id: msg.id, result: resultJson };
        } catch (e) {
            payload = { type: "result", id: msg.id, error: e.message || String(e) };
        }

        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(payload));
        }
    }
}

window.McpBridge = McpBridge;
