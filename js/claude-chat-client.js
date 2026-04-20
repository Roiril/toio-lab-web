/**
 * ClaudeChatClient
 *
 * Connects to the dev-server's /claude WebSocket endpoint and relays user
 * chat messages to the Claude Code CLI running on the backend. Messages
 * arriving back are dispatched via onMessage.
 */

class ClaudeChatClient {
    constructor({ onMessage, onStatus } = {}) {
        const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        this.url = `${proto}//${window.location.host}/claude`;
        this.ws = null;
        this.onMessage = onMessage || (() => {});
        this.onStatus = onStatus || (() => {});
        this.reconnectTimer = null;
        this.isClosed = false;
        this.lastSendTime = null;  // for latency measurement
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
    }

    _openSocket() {
        try {
            this.ws = new WebSocket(this.url);
        } catch (e) {
            console.warn('[ClaudeChat] ws construct failed', e);
            this._scheduleReconnect();
            return;
        }

        this.onStatus({ state: 'connecting', url: this.url });

        this.ws.addEventListener('open', () => {
            this.onStatus({ state: 'open' });
        });

        this.ws.addEventListener('message', (event) => {
            let msg;
            try { msg = JSON.parse(event.data); }
            catch (e) { console.warn('[ClaudeChat] bad message:', event.data); return; }

            // Attach latency info to assistant messages
            if (msg.type === 'assistant' && this.lastSendTime) {
                const elapsed = Date.now() - this.lastSendTime;
                msg.latency_ms = elapsed;
            }
            // Clear lastSendTime on result
            if (msg.type === 'result') {
                this.lastSendTime = null;
            }

            this.onMessage(msg);
        });

        this.ws.addEventListener('close', () => {
            this.ws = null;
            this.onStatus({ state: 'closed' });
            if (!this.isClosed) this._scheduleReconnect();
        });

        this.ws.addEventListener('error', (e) => {
            console.warn('[ClaudeChat] socket error', e);
        });
    }

    _scheduleReconnect() {
        if (this.isClosed || this.reconnectTimer) return;
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this._openSocket();
        }, 2000);
    }

    isReady() {
        return this.ws && this.ws.readyState === WebSocket.OPEN;
    }

    send(text) {
        if (!this.isReady()) return false;
        this.lastSendTime = Date.now();
        this.ws.send(JSON.stringify({ type: 'user', text }));
        return true;
    }

    reset() {
        if (!this.isReady()) return false;
        this.ws.send(JSON.stringify({ type: 'reset' }));
        return true;
    }
}

window.ClaudeChatClient = ClaudeChatClient;
