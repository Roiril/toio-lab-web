/**
 * toio-lab-web dev server
 *
 * Responsibilities:
 *   1. Serve static files (index.html, js/*, etc.)
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
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
