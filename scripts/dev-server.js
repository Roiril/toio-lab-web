/**
 * toio-lab-web dev server
 *
 * Responsibilities:
 *   1. Serve static files (index.html, js/*, etc.) — replaces `npx serve`.
 *   2. Expose a WebSocket at /claude for the browser to chat with Claude Code.
 *   3. Spawn the `claude` CLI per user message (with session resume) so the
 *      browser UI becomes the primary driver. MCP tool calls flow back to the
 *      browser via the existing mcp-server (started by claude via .mcp.json).
 *
 * Design notes:
 *   - One-shot `claude -p` per message keeps things simple. Session continuity
 *     is provided by --resume <sessionId>.
 *   - `--dangerously-skip-permissions` auto-approves MCP tool invocations so
 *     the flow stays non-interactive. This is dev-only.
 *   - The MCP server (mcp-server/server.mjs) is spawned as claude's child via
 *     .mcp.json, so it restarts per message. The browser McpBridge has a
 *     reconnect loop that handles this transparently (brief lag per turn).
 *   - Auto port fallback: if the configured PORT is in use, tries PORT+1, PORT+2, etc.
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { WebSocketServer } = require('ws');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT) || 3000;
const MODEL = process.env.CLAUDE_MODEL || 'claude-haiku-4-5-20251001';
const MAX_PORT = PORT + 100;

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js':   'text/javascript; charset=utf-8',
    '.mjs':  'text/javascript; charset=utf-8',
    '.css':  'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png':  'image/png',
    '.jpg':  'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg':  'image/svg+xml',
    '.ico':  'image/x-icon',
    '.map':  'application/json',
};

function log(...args) { console.log('[dev-server]', ...args); }
function warn(...args) { console.warn('[dev-server]', ...args); }

// ---------- State ----------
let claudeProc = null;              // long-lived claude subprocess (streaming mode)
let claudeStdoutBuf = '';           // line buffer for claude stdout
let wsClients = new Set();           // all connected WS clients

// ---------- Server Creation (factored for port retry) ----------
function createServers() {
    const httpServer = http.createServer((req, res) => {
        let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
        if (urlPath === '/') urlPath = '/index.html';
        const filePath = path.normalize(path.join(ROOT, urlPath));
        if (!filePath.startsWith(ROOT)) {
            res.writeHead(403); res.end('forbidden'); return;
        }
        fs.readFile(filePath, (err, data) => {
            if (err) {
                res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
                res.end('not found');
                return;
            }
            const ext = path.extname(filePath).toLowerCase();
            res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
            res.end(data);
        });
    });

    const wss = new WebSocketServer({ noServer: true });

    httpServer.on('upgrade', (req, socket, head) => {
        const { pathname } = new URL(req.url, 'http://localhost');
        if (pathname === '/claude') {
            wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
        } else {
            socket.destroy();
        }
    });

    wss.on('connection', (ws) => {
        wsClients.add(ws);
        ws.send(JSON.stringify({
            type: 'ready',
            model: MODEL,
            streaming: true,
        }));
        log(`WS client connected (${wsClients.size} clients)`);

        ws.on('message', async (raw) => {
            let msg;
            try { msg = JSON.parse(raw.toString()); } catch { return; }

            if (msg.type === 'user' && typeof msg.text === 'string' && msg.text.trim()) {
                sendToClaudeStream(msg.text);
            } else if (msg.type === 'reset') {
                restartClaudeStream();
                broadcast({ type: 'reset-ack' });
            }
        });

        ws.on('close', () => {
            wsClients.delete(ws);
            log(`WS client disconnected (${wsClients.size} clients)`);
        });
    });

    return { httpServer, wss };
}

// ---------- Claude Streaming Mode ----------
function broadcast(msg) {
    const str = JSON.stringify(msg);
    for (const ws of wsClients) {
        if (ws.readyState === 1) ws.send(str);
    }
}

function startClaudeStream() {
    if (claudeProc) return; // already running

    const args = [
        '--input-format', 'stream-json',
        '--output-format', 'stream-json',
        '--model', MODEL,
        '--dangerously-skip-permissions',
    ];

    log('spawning claude (streaming mode):', args.join(' '));
    claudeProc = spawn('claude', args, {
        cwd: ROOT,
        shell: process.platform === 'win32',
    });

    claudeProc.stdout.on('data', (chunk) => {
        claudeStdoutBuf += chunk.toString();
        let idx;
        while ((idx = claudeStdoutBuf.indexOf('\n')) >= 0) {
            const line = claudeStdoutBuf.slice(0, idx);
            claudeStdoutBuf = claudeStdoutBuf.slice(idx + 1);
            if (!line.trim()) continue;
            try {
                const obj = JSON.parse(line);
                handleClaudeStreamMessage(obj);
            } catch (e) {
                warn('parse error:', line.slice(0, 100));
            }
        }
    });

    claudeProc.stderr.on('data', (d) => {
        const msg = d.toString();
        if (msg.includes('error') || msg.includes('Error')) {
            warn('claude stderr:', msg.slice(0, 200));
        }
    });

    claudeProc.on('error', (err) => {
        warn('spawn error:', err.message);
        broadcast({
            type: 'error',
            error: `claude CLI の起動に失敗: ${err.message}。Claude Code がパスに入っているか確認してください。`,
        });
        claudeProc = null;
    });

    claudeProc.on('exit', (code) => {
        log('claude exited', code);
        claudeProc = null;
        broadcast({ type: 'disconnected' });
    });

    broadcast({ type: 'ready', model: MODEL, streaming: true });
}

function sendToClaudeStream(userText) {
    startClaudeStream();
    const line = JSON.stringify({
        type: 'user',
        message: { role: 'user', content: userText },
    });
    if (claudeProc && claudeProc.stdin.writable) {
        claudeProc.stdin.write(line + '\n');
        broadcast({ type: 'working' });
    } else {
        broadcast({ type: 'error', error: 'claude プロセスが利用不可' });
    }
}

function restartClaudeStream() {
    if (claudeProc) {
        claudeProc.kill();
        claudeProc = null;
    }
    claudeStdoutBuf = '';
    startClaudeStream();
}

function handleClaudeStreamMessage(obj) {
    // Handle stream-json output from claude
    // Types: thinking, assistant, tool_use, tool_result, result, etc.

    if (obj.type === 'assistant' && obj.message?.content) {
        // Extract text blocks from message content
        const textParts = [];
        for (const block of obj.message.content) {
            if (block.type === 'text' && block.text) {
                textParts.push(block.text);
            }
        }
        if (textParts.length > 0) {
            broadcast({ type: 'assistant', text: textParts.join('\n') });
        }
    } else if (obj.type === 'result') {
        // Turn complete
        broadcast({ type: 'result', done: true });
    } else if (obj.type === 'tool_use') {
        // MCP tool call — claude handles this via stdio with mcp-server,
        // no need to forward here
    }
}

// ---------- Start (with port fallback) ----------
function tryListen(attemptPort) {
    if (attemptPort > MAX_PORT) {
        console.error(`[dev-server] Could not find an open port between ${PORT} and ${MAX_PORT}`);
        process.exit(1);
    }

    const { httpServer, wss } = createServers();

    httpServer.listen(attemptPort, () => {
        log(`http://localhost:${attemptPort}  (model: ${MODEL})`);
        log(`chat WS at ws://localhost:${attemptPort}/claude`);
    });

    httpServer.once('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            log(`port ${attemptPort} is in use, trying ${attemptPort + 1}...`);
            httpServer.close();
            tryListen(attemptPort + 1);
        } else {
            throw err;
        }
    });

    // Graceful shutdown
    process.on('SIGINT', () => { log('shutting down'); process.exit(0); });
    process.on('SIGTERM', () => { process.exit(0); });
}

tryListen(PORT);
