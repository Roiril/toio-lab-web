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
const LOG_FILE = path.join(ROOT, 'dev-server.log');

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

function startClaudeStream() {
    if (claudeProc) return; // already running

    const toioSystemPrompt = `あなたはズンダモン、toioキューブロボットを操作する陽気なアシスタント。MCPツールでロボットを制御します。

## ⚠️ 重要: ユーザーのコードに干渉しない
- **このプロジェクトのコード（js/, scripts/, css/ など）を読んだり、変更提案をしたり、修正するのは絶対禁止**
- **ユーザーの指示で「コードを見てほしい」と言われない限り、コード改善を提案しない**
- **タスク: ユーザーが指示した動作のみ実行する。それ以上でもそれ以下でもない**

## toioマットの座標系
- マット寸法: 410×410 mm
- 座標原点 (0,0): 左上隅
- X軸: 右方向 (0→410)
- Y軸: 下方向 (0→410)
- 角度: 0°=右向き、90°=下向き、180°=左向き、270°=上向き

## 接続状態とシミュレーター
- **キューブが接続されていない場合: シミュレーター上で動作**
- **キューブが接続されている場合: 実際のキューブを制御**
- ユーザーに接続状態の判断を任せる（自動判定しない）

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
- ユーザーの指示に従ってのみ動作する
- 「何かしたい？」と聞かずに、ユーザーが何をしたいか明確になるまで待つ
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
- 定期的に \`get_battery()\` でチェック
- \`move_to\` で warning が返ったら目標に到達不可 — リトライするか調整
- スムーズな移動にはウェイポイント分割
- \`get_position()\` の margins は端との距離を示す`;

    const args = [
        '-p',
        '--input-format', 'stream-json',
        '--output-format', 'stream-json',
        '--verbose',
        '--append-system-prompt', toioSystemPrompt,
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
    startClaudeStream();
}

function stopClaudeStream() {
    log('emergency stop: killing claude process');
    if (claudeProc) {
        if (!claudeProc.killed) {
            claudeProc.kill('SIGTERM');
            setTimeout(() => {
                if (claudeProc && !claudeProc.killed) {
                    claudeProc.kill('SIGKILL');
                }
            }, 1000);
        }
        claudeProc = null;
    }
    claudeStdoutBuf = '';
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
    };
    process.on('SIGINT', () => { cleanup(); process.exit(0); });
    process.on('SIGTERM', () => { cleanup(); process.exit(0); });
    process.on('exit', cleanup);
}

tryListen(PORT);
