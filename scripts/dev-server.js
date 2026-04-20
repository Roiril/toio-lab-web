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
let claudeSessionId = null;   // persisted across turns via --resume
let activeRun = null;          // promise of the currently-running claude invocation

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
        ws.send(JSON.stringify({
            type: 'ready',
            model: MODEL,
            sessionId: claudeSessionId,
            busy: !!activeRun,
        }));

        ws.on('message', async (raw) => {
            let msg;
            try { msg = JSON.parse(raw.toString()); } catch { return; }

            if (msg.type === 'user' && typeof msg.text === 'string' && msg.text.trim()) {
                if (activeRun) {
                    ws.send(JSON.stringify({ type: 'error', error: 'Claudeが別のメッセージを処理中です。完了を待ってください。' }));
                    return;
                }
                activeRun = runClaude(msg.text, ws);
                try { await activeRun; } finally { activeRun = null; }
            } else if (msg.type === 'reset') {
                claudeSessionId = null;
                ws.send(JSON.stringify({ type: 'reset-ack' }));
            }
        });
    });

    return { httpServer, wss };
}

function runClaude(userText, ws) {
    return new Promise((resolve) => {
        const args = [
            '-p', userText,
            '--model', MODEL,
            '--output-format', 'json',
            '--dangerously-skip-permissions',
        ];
        if (claudeSessionId) {
            args.push('--resume', claudeSessionId);
        }

        log('claude', args.filter(a => a !== userText).join(' '), '"<user-text>"');
        ws.send(JSON.stringify({ type: 'working' }));

        const proc = spawn('claude', args, {
            cwd: ROOT,
            shell: process.platform === 'win32',
        });
        let stdout = '';
        let stderr = '';

        proc.stdout.on('data', (d) => { stdout += d.toString(); });
        proc.stderr.on('data', (d) => { stderr += d.toString(); });

        proc.on('error', (err) => {
            warn('spawn error:', err.message);
            ws.send(JSON.stringify({
                type: 'error',
                error: `claude CLI の起動に失敗: ${err.message}。Claude Codeがパスに入っているか確認してください。`,
            }));
            resolve();
        });

        proc.on('close', (code) => {
            if (code !== 0) {
                warn(`claude exited ${code}:`, stderr.slice(0, 800));
                ws.send(JSON.stringify({
                    type: 'error',
                    error: `claude exited ${code}. stderr: ${stderr.slice(0, 400) || '(empty)'}`,
                }));
                resolve();
                return;
            }
            try {
                const parsed = JSON.parse(stdout);
                if (parsed.session_id) claudeSessionId = parsed.session_id;
                const text = parsed.result ?? parsed.response ?? '';
                ws.send(JSON.stringify({
                    type: 'assistant',
                    text: String(text),
                    duration_ms: parsed.duration_ms,
                    cost_usd: parsed.total_cost_usd,
                    session_id: parsed.session_id,
                }));
            } catch (e) {
                warn('JSON parse failed, sending raw stdout. err:', e.message);
                ws.send(JSON.stringify({ type: 'assistant', text: stdout }));
            }
            resolve();
        });
    });
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
