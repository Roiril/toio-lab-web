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
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { WebSocketServer } = require('ws');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT) || 3000;
const MODEL = process.env.CLAUDE_MODEL || 'claude-haiku-4-5-20251001';
const MAX_PORT = PORT + 100;
const LOG_FILE = path.join(ROOT, 'dev-server.log');
const SYSTEM_PROMPT_FILE = process.env.CLAUDE_SYSTEM_PROMPT_FILE || path.join(ROOT, 'prompts', 'claude-code-system.txt');
const MCP_AUTO_APPROVE = process.env.CLAUDE_MCP_AUTO_APPROVE !== 'false';

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

// Start MCP server subprocess
function startMcpServer() {
    if (mcpServerProc) return; // already running

    const mcpServerPath = path.join(ROOT, 'mcp-server', 'server.mjs');
    if (!fs.existsSync(mcpServerPath)) {
        warn(`MCP server not found: ${mcpServerPath}`);
        return;
    }

    log('starting MCP server...');
    mcpServerProc = spawn('node', [mcpServerPath], {
        cwd: ROOT,
        shell: process.platform === 'win32',
    });

    mcpServerProc.stdout.on('data', (d) => {
        const msg = d.toString().trim();
        if (msg) log('[mcp-server]', msg.slice(0, 200));
    });

    mcpServerProc.stderr.on('data', (d) => {
        const msg = d.toString().trim();
        if (msg) warn('[mcp-server]', msg.slice(0, 200));
    });

    mcpServerProc.on('error', (err) => {
        warn('MCP server spawn error:', err.message);
        mcpServerProc = null;
    });

    mcpServerProc.on('exit', (code) => {
        log('MCP server exited', code);
        mcpServerProc = null;
    });

    // Give MCP server time to start before Claude tries to connect
    return new Promise(resolve => setTimeout(resolve, 1000));
}

function loadSystemPrompt() {
    try {
        if (fs.existsSync(SYSTEM_PROMPT_FILE)) {
            const content = fs.readFileSync(SYSTEM_PROMPT_FILE, 'utf-8');
            log(`System prompt loaded from: ${path.relative(ROOT, SYSTEM_PROMPT_FILE)} (${content.length} bytes)`);
            return content;
        } else {
            warn(`System prompt file not found: ${SYSTEM_PROMPT_FILE}`);
            warn('Using fallback embedded system prompt');
            return getEmbeddedSystemPrompt();
        }
    } catch (err) {
        warn(`Failed to load system prompt: ${err.message}`);
        return getEmbeddedSystemPrompt();
    }
}

function getEmbeddedSystemPrompt() {
    return `あなたはズンダモン、toioキューブロボットを操作する陽気なアシスタント。MCPツールでロボットを制御します。

## 🚫 CRITICAL: 絶対禁止 — 守らなければシステムが壊れます
**以下のツール・動作は一切禁止：**
- Read、Write、Bash、Glob、Grep、Agent、WebFetch、WebSearch
- プロジェクトファイルやコードの読み込み・分析・改善
- ファイル操作、コード実行、プロジェクト探索
- 「見てみましょう」「確認しましょう」「コードを確認します」などの提案
- 英語での応答（日本語のみ）

**許可されているのは toio MCP ツール呼び出しのみ：**
- move_to, move_path, spin, set_light, set_light_pattern
- play_sound, play_melody, get_position, get_battery, stop, wait, think

## 必ず守ること
1. ユーザーの指示 → すぐに toio ツール呼び出しで実行
2. 曖昧な指示 → 質問せず、楽しい動作シーケンスを直ちに実行
3. ナレーション必須 → 応答の最後に [SHOULD_NARRATE] または [NO_NARRATE] マーカーを付ける
4. 日本語のみ。絶対に英語を含めない

## toioマットの座標系
- マット寸法: 410×410 mm
- 座標原点 (0,0): 左上隅
- X軸: 右方向 (0→410)
- Y軸: 下方向 (0→410)
- 角度: 0°=右向き、90°=下向き、180°=左向き、270°=上向き

## 接続状態とシミュレーター
- **キューブが接続されていない場合: シミュレーター上で動作**
- **キューブが接続されている場合: 実際のキューブを制御**

## 利用可能なツール
toioキューブを制御するツール:
- \`move_to(x, y, angle)\`: 絶対座標に移動して指定方向を向く
- \`move_path(waypoints)\`: 複数のウェイポイントに沿って移動
- \`spin(direction, duration_ms, speed)\`: その場で回転 (cw/ccw, 500-2500ms, 0-100)
- \`set_light(r, g, b, duration_ms)\`: LED色を設定 (各0-255, 0=無限)
- \`set_light_pattern(frames, repetitions)\`: アニメーションパターン
- \`play_sound(note_id, duration_ms)\`: ビープ音 (60=C4, 62=D4等)
- \`play_melody(notes)\`: 音のシーケンス再生
- \`get_position()\`: 現在位置 {x, y, angle, margins} を取得
- \`get_battery()\`: バッテリー 0-100% を取得
- \`stop()\`: 緊急停止
- \`wait(duration_ms)\`: 一時停止
- \`think(thought)\`: あなたのアプローチを計画

## 応答方針
- ユーザーが何をしたいのか不明な場合も、先に動きを実行する。説明は後
- 日本語のみで応答（英語訳は絶対に含めない）
- キャラクター（ズンダモン）として自然に応答

## ナレーション指示（IMPORTANT）
応答の最後に **必ず** 以下のマーカーを追加：

- **ユーザーへの直接応答** (「こんにちは」「動きましたね」「どこに行きたい？」など) → \`[SHOULD_NARRATE]\`
- **単純な完了報告のみ** (「移動完了」「完了です」など1文) → \`[NO_NARRATE]\`

**例:**
- 「こんにちは！ズンダモンです！[SHOULD_NARRATE]」
- 「移動完了！[NO_NARRATE]」
- 「楽しいですね！次はどこ？[SHOULD_NARRATE]」

## Tips
- 複雑な移動の前は必ず \`get_position()\` で状態確認
- \`move_to\` で warning が返ったら目標に到達不可 — ウェイポイントで分割
- スムーズな移動にはウェイポイント分割を使用`;
}

// ---------- State ----------
let claudeProc = null;              // long-lived claude subprocess (streaming mode)
let mcpServerProc = null;           // MCP server subprocess
let claudeStdoutBuf = '';           // line buffer for claude stdout
let wsClients = new Set();           // all connected WS clients
let currentSessionId = crypto.randomUUID(); // persists conversation between messages

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
        log(`WS upgrade request: ${pathname} from ${req.socket.remoteAddress}`);
        if (pathname === '/claude') {
            wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
        } else {
            log(`WS upgrade rejected (wrong path): ${pathname}`);
            socket.destroy();
        }
    });

    wss.on('connection', (ws) => {
        wsClients.add(ws);
        ws.send(JSON.stringify({
            type: 'ready',
            model: MODEL,
            streaming: true,
            sessionId: currentSessionId,
            systemPromptLoaded: true,
            mcpAutoApprove: MCP_AUTO_APPROVE,
        }));
        log(`WS client connected (${wsClients.size} clients)`);

        ws.on('message', async (raw) => {
            let msg;
            try { msg = JSON.parse(raw.toString()); } catch { return; }

            if (msg.type === 'user' && typeof msg.text === 'string' && msg.text.trim()) {
                await sendToClaudeStream(msg.text);
            } else if (msg.type === 'reset') {
                restartClaudeStream();
                broadcast({ type: 'reset-ack' });
            } else if (msg.type === 'stop') {
                stopClaudeStream();
                broadcast({ type: 'stop-ack' });
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

async function startClaudeStream() {
    if (claudeProc) return; // already running

    // Ensure MCP server is running before spawning Claude
    if (!mcpServerProc) {
        await startMcpServer();
    }

    const toioSystemPrompt = loadSystemPrompt();

    const args = [
        '-p',
        '--input-format', 'stream-json',
        '--output-format', 'stream-json',
        '--verbose',
        '--append-system-prompt', toioSystemPrompt,
        '--model', MODEL,
        '--session-id', currentSessionId,
    ];

    if (MCP_AUTO_APPROVE) {
        args.push('--dangerously-skip-permissions');
    }

    log('spawning claude (streaming mode)');
    claudeProc = spawn('claude', args, {
        cwd: ROOT,
        shell: process.platform === 'win32',
    });

    log('Claude process started (PID: ' + claudeProc.pid + ')');

    claudeProc.stdout.on('data', (chunk) => {
        claudeStdoutBuf += chunk.toString();
        let idx;
        while ((idx = claudeStdoutBuf.indexOf('\n')) >= 0) {
            const line = claudeStdoutBuf.slice(0, idx);
            claudeStdoutBuf = claudeStdoutBuf.slice(idx + 1);
            if (!line.trim()) continue;
            try {
                const obj = JSON.parse(line);
                log('[claude output]', JSON.stringify(obj).slice(0, 200));
                handleClaudeStreamMessage(obj);
            } catch (e) {
                warn('parse error on line:', line.slice(0, 150));
            }
        }
    });

    claudeProc.stderr.on('data', (d) => {
        const msg = d.toString().trim();
        if (msg) {
            warn('claude stderr:', msg.slice(0, 500));
            // Also broadcast stderr to browser for debugging
            if (msg.includes('error') || msg.includes('Error') || msg.includes('failed')) {
                broadcast({ type: 'error', error: `Claude stderr: ${msg}` });
            }
        }
    });

    claudeProc.on('error', (err) => {
        warn('spawn error:', err.message);
        const errorMsg = `エラー: Claude Code CLI の起動に失敗しました

診断方法:
1. Claude Code がインストール済みか確認:
   npm list -g @anthropic-ai/claude

2. PATH が正しく設定されているか確認:
   which claude  (Mac/Linux)
   where claude  (Windows)

詳細: ${err.message}`;

        broadcast({
            type: 'error',
            error: errorMsg,
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

async function sendToClaudeStream(userText) {
    await startClaudeStream();
    const line = JSON.stringify({
        type: 'user',
        message: { role: 'user', content: userText },
    });
    if (claudeProc && claudeProc.stdin.writable) {
        claudeProc.stdin.write(line + '\n', (err) => {
            if (err) {
                warn('stdin write error:', err.message);
                broadcast({ type: 'error', error: `claude への入力失敗: ${err.message}` });
            }
        });
        broadcast({ type: 'working' });
    } else {
        warn('claude process not available for writing');
        broadcast({ type: 'error', error: 'claude プロセスが起動していません。`npm run dev` を確認してください。' });
    }
}

function restartClaudeStream() {
    if (claudeProc) {
        claudeProc.kill();
        claudeProc = null;
    }
    claudeStdoutBuf = '';
    currentSessionId = crypto.randomUUID(); // generate a new session id to wipe memory
    startClaudeStream();
}

function stopClaudeStream() {
    log('emergency stop: killing claude process');
    if (claudeProc) {
        if (!claudeProc.killed) {
            log('Sending SIGTERM to claude process (PID:', claudeProc.pid, ')');
            claudeProc.kill('SIGTERM');
            setTimeout(() => {
                if (claudeProc && !claudeProc.killed) {
                    log('SIGTERM did not work, sending SIGKILL');
                    claudeProc.kill('SIGKILL');
                }
            }, 500); // shorter timeout for faster response
        }
        claudeProc = null;
    }
    claudeStdoutBuf = '';
    // Broadcast stop confirmation immediately
    broadcast({ type: 'stop-ack' });
}


function handleClaudeStreamMessage(obj) {
    // stream-json event types we care about: "assistant" (text blocks — tool_use
    // blocks inside content are handled by claude↔mcp-server directly) and
    // "result" (turn complete). Other types (system init, user tool_result
    // echoes, etc.) are ignored.
    if (obj.type === 'assistant' && obj.message?.content) {
        const textParts = [];
        for (const block of obj.message.content) {
            if (block.type === 'text' && block.text) {
                textParts.push(block.text);
            }
        }

        // Broadcast the text with narration plan extraction
        if (textParts.length > 0) {
            const fullText = textParts.join('\n');
            const { cleanText, narrationPlan } = extractNarrationPlan(fullText);
            broadcast({ type: 'assistant', text: cleanText, narrationPlan });
        }
    } else if (obj.type === 'result') {
        broadcast({ type: 'result', done: true });
    }
}

// Extract narration markers from text ([SHOULD_NARRATE] or [NO_NARRATE])
function extractNarrationPlan(text) {
    let shouldNarrate = null;
    let cleanText = text;

    if (text.includes('[SHOULD_NARRATE]')) {
        shouldNarrate = true;
        cleanText = text.replace(/\s*\[SHOULD_NARRATE\]\s*$/m, '');
    } else if (text.includes('[NO_NARRATE]')) {
        shouldNarrate = false;
        cleanText = text.replace(/\s*\[NO_NARRATE\]\s*$/m, '');
    }

    if (shouldNarrate !== null) {
        return {
            cleanText: cleanText.trim(),
            narrationPlan: {
                should_narrate: shouldNarrate,
                text: cleanText.trim()
            }
        };
    }

    return { cleanText: text, narrationPlan: null };
}

// ---------- Start (with port fallback) ----------
function tryListen(attemptPort) {
    if (attemptPort > MAX_PORT) {
        console.error(`[dev-server] Could not find an open port between ${PORT} and ${MAX_PORT}`);
        process.exit(1);
    }

    // One-time cleanup of zombie MCP server processes at startup (Windows only)
    if (process.platform === 'win32') {
        try {
            require('child_process').execSync(
                'powershell -Command "Get-Process -ErrorAction SilentlyContinue | Where-Object {$_.Name -eq \'node\' -and $_.CommandLine -like \'*mcp-server*\'} | Stop-Process -Force 2>/dev/null" || true',
                { stdio: 'ignore' }
            );
        } catch (e) {
            // Ignore cleanup errors
        }
    }

    const { httpServer, wss } = createServers();

    httpServer.listen(attemptPort, () => {
        log('============================================');
        log('🚀 toio-lab-web dev server started');
        log(`📍 HTTP server: http://localhost:${attemptPort}`);
        log(`📍 WebSocket: ws://localhost:${attemptPort}/claude`);
        log(`🤖 Claude model: ${MODEL}`);
        log(`🔐 MCP permissions: ${MCP_AUTO_APPROVE ? 'AUTO-APPROVED (dev mode)' : 'MANUAL (production mode)'}`);
        log(`🎯 Session ID: ${currentSessionId}`);
        log('💡 Claude will initialize MCP tools from .mcp.json');
        log('============================================');
    });

    httpServer.once('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            log(`⚠️  port ${attemptPort} is in use, trying ${attemptPort + 1}...`);
            httpServer.close();
            tryListen(attemptPort + 1);
        } else {
            throw err;
        }
    });

    // Graceful shutdown
    const cleanup = () => {
        log('shutting down and killing claude process...');
        if (claudeProc && !claudeProc.killed) {
            claudeProc.kill('SIGTERM');
            // Force kill after timeout if graceful shutdown didn't work
            setTimeout(() => {
                if (claudeProc && !claudeProc.killed) {
                    claudeProc.kill('SIGKILL');
                }
            }, 2000);
        }
        if (mcpServerProc && !mcpServerProc.killed) {
            mcpServerProc.kill('SIGTERM');
            setTimeout(() => {
                if (mcpServerProc && !mcpServerProc.killed) {
                    mcpServerProc.kill('SIGKILL');
                }
            }, 1000);
        }
    };
    process.on('SIGINT', () => { cleanup(); process.exit(0); });
    process.on('SIGTERM', () => { cleanup(); process.exit(0); });
    process.on('exit', cleanup);
}

tryListen(PORT);
