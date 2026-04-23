/**
 * toio-lab-web dev server
 *
 * Responsibilities:
 *   1. Serve static files (index.html, js/*, etc.)
 *   2. Scenario CRUD API  GET/PUT/DELETE /api/scenarios/:name
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SCENARIOS_DIR = path.join(ROOT, 'scenarios');
const PORT = Number(process.env.PORT) || 3000;
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

function json(res, data, status = 200) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(data));
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        req.on('data', c => chunks.push(c));
        req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
        req.on('error', reject);
    });
}

function safeName(name) {
    // allow only alphanumeric, hyphens, underscores
    return /^[\w-]+$/.test(name) ? name : null;
}

function handleScenarioApi(req, res) {
    const url = req.url || '';
    const match = url.match(/^\/api\/scenarios(?:\/([^/?]+))?/);
    if (!match) return false;

    const rawName = match[1];

    // GET /api/scenarios — list
    if (!rawName && req.method === 'GET') {
        if (!fs.existsSync(SCENARIOS_DIR)) {
            json(res, []);
            return true;
        }
        const files = fs.readdirSync(SCENARIOS_DIR)
            .filter(f => f.endsWith('.md'))
            .map(f => {
                const fp = path.join(SCENARIOS_DIR, f);
                const name = f.replace(/\.md$/, '');
                const content = fs.readFileSync(fp, 'utf-8');
                const meta = parseMetaFromContent(content);
                const stepCount = (content.match(/^-\s*\[[ xX]\]/gm) || []).length;
                let mtime = 0;
                try { mtime = fs.statSync(fp).mtimeMs; } catch {}
                return {
                    name,
                    title: meta.title || name,
                    description: meta.description || '',
                    stepCount,
                    mtime,
                };
            })
            .sort((a, b) => b.mtime - a.mtime);
        json(res, files);
        return true;
    }

    const name = safeName(rawName);
    if (!name) { json(res, { error: 'invalid name' }, 400); return true; }
    const filePath = path.join(SCENARIOS_DIR, name + '.md');

    // GET /api/scenarios/:name — read
    if (req.method === 'GET') {
        if (!fs.existsSync(filePath)) { json(res, { error: 'not found' }, 404); return true; }
        const content = fs.readFileSync(filePath, 'utf-8');
        json(res, { name, content });
        return true;
    }

    // PUT /api/scenarios/:name — create or update
    if (req.method === 'PUT') {
        readBody(req).then(body => {
            if (!fs.existsSync(SCENARIOS_DIR)) fs.mkdirSync(SCENARIOS_DIR, { recursive: true });
            fs.writeFileSync(filePath, body, 'utf-8');
            json(res, { ok: true });
        }).catch(() => json(res, { error: 'write failed' }, 500));
        return true;
    }

    // DELETE /api/scenarios/:name — delete
    if (req.method === 'DELETE') {
        if (!fs.existsSync(filePath)) { json(res, { error: 'not found' }, 404); return true; }
        fs.unlinkSync(filePath);
        json(res, { ok: true });
        return true;
    }

    return false;
}

function parseMetaFromContent(text) {
    const meta = {};
    const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (fm) {
        fm[1].split('\n').forEach(line => {
            const m = line.match(/^(\w+):\s*"?([^"]*)"?\s*$/);
            if (m) meta[m[1].trim()] = m[2].trim();
        });
    }
    return meta;
}

function createServers() {
    const httpServer = http.createServer((req, res) => {
        // Scenario API routing
        if ((req.url || '').startsWith('/api/scenarios')) {
            if (handleScenarioApi(req, res)) return;
        }

        // Static file serving
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

    return { httpServer };
}

function tryListen(attemptPort) {
    if (attemptPort > MAX_PORT) {
        console.error(`[dev-server] Could not find an open port between ${PORT} and ${MAX_PORT}`);
        process.exit(1);
    }

    const { httpServer } = createServers();

    httpServer.listen(attemptPort, () => {
        log(`http://localhost:${attemptPort}`);
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
}

tryListen(PORT);
