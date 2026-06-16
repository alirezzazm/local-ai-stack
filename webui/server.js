// Minimal dependency-free web server for the DAZ chat UI.
// - serves the static files in this folder
// - proxies /api/* to the local Ollama server (avoids browser CORS issues)
// Run:  node webui/server.js   (or ./scripts/webui.ps1)
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8080;
const OLLAMA = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
const DIR = __dirname;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
};

const server = http.createServer((req, res) => {
  // --- proxy API calls to Ollama ---
  if (req.url.startsWith('/api/')) {
    const u = new URL(OLLAMA + req.url);
    const proxy = http.request(
      { hostname: u.hostname, port: u.port, path: u.pathname + u.search,
        method: req.method, headers: { 'content-type': 'application/json' } },
      (pr) => { res.writeHead(pr.statusCode, pr.headers); pr.pipe(res); }
    );
    proxy.on('error', (e) => { res.writeHead(502); res.end(JSON.stringify({ error: String(e) })); });
    req.pipe(proxy);
    return;
  }
  // --- static files ---
  const rel = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  const fp = path.join(DIR, rel);
  if (!fp.startsWith(DIR) || !fs.existsSync(fp)) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'content-type': MIME[path.extname(fp)] || 'application/octet-stream' });
  fs.createReadStream(fp).pipe(res);
});

server.listen(PORT, () => console.log(`DAZ UI running →  http://localhost:${PORT}`));
