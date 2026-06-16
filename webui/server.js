// Dependency-free server for the DAZ chat UI.
//  - serves static files
//  - /api/learn      : search the web for a topic, summarize with DAZ, save to knowledge/
//  - /api/knowledge  : list learned topics
//  - /api/context    : return knowledge relevant to a query (simple RAG retrieval)
//  - other /api/*     : proxied to Ollama
// Node 18+ (uses global fetch).  Run:  node webui/server.js
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = process.env.PORT || 8080;
const OLLAMA = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
const MODEL = process.env.DAZ_MODEL || 'daz';
const DIR = __dirname;
const KNOWLEDGE = path.join(DIR, '..', 'knowledge');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };

fs.mkdirSync(KNOWLEDGE, { recursive: true });

const readBody = (req) => new Promise((res) => { let b = ''; req.on('data', c => b += c); req.on('end', () => res(b)); });
const sendJSON = (res, code, obj) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)); };
const stripHtml = (html) => html
  .replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/\s+/g, ' ').trim();
const slug = (s) => s.trim().replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '-').slice(0, 60) || 'topic';

// --- web search via DuckDuckGo HTML (no API key) ---
async function searchWeb(query, n = 3) {
  const r = await fetch('https://html.duckduckgo.com/html/?q=' + encodeURIComponent(query),
    { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const html = await r.text();
  const out = [];
  const re = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  let m;
  while ((m = re.exec(html)) && out.length < n) {
    let href = m[1];
    const uddg = href.match(/uddg=([^&]+)/);
    if (uddg) href = decodeURIComponent(uddg[1]);
    if (href.startsWith('//')) href = 'https:' + href;
    out.push({ url: href, title: stripHtml(m[2]) });
  }
  return out;
}

async function fetchText(url) {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(15000) });
    return stripHtml(await r.text()).slice(0, 3500);
  } catch { return ''; }
}

async function askDaz(prompt) {
  const r = await fetch(OLLAMA + '/api/chat', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, stream: false,
      messages: [{ role: 'user', content: prompt }] }),
  });
  const j = await r.json();
  return j.message?.content || '';
}

// --- /api/learn ---
async function handleLearn(req, res) {
  const { topic } = JSON.parse(await readBody(req) || '{}');
  if (!topic) return sendJSON(res, 400, { error: 'topic required' });
  const results = await searchWeb(topic, 3);
  if (!results.length) return sendJSON(res, 200, { error: 'هیچ نتیجه‌ای پیدا نشد.' });
  let corpus = '';
  for (const r of results) corpus += `\n[منبع: ${r.title}]\n${await fetchText(r.url)}\n`;
  const summary = await askDaz(
    `بر اساس متن‌های زیر درباره‌ی موضوع «${topic}»، یک خلاصه‌ی دقیق و آموزنده به زبان فارسی بنویس ` +
    `(چند بند کوتاه، فقط حقایق مهم):\n${corpus.slice(0, 6000)}`);
  const sources = results.map(r => `- ${r.title}: ${r.url}`).join('\n');
  const md = `---\ntopic: ${topic}\ndate: ${new Date().toISOString()}\n---\n\n${summary}\n\n## منابع\n${sources}\n`;
  fs.writeFileSync(path.join(KNOWLEDGE, slug(topic) + '.md'), md, 'utf-8');
  sendJSON(res, 200, { topic, summary, sources: results });
}

// --- /api/stats (live system usage of the host running the model) ---
let prevCpu = null;
function cpuSnapshot() {
  let idle = 0, total = 0;
  for (const c of os.cpus()) { for (const t in c.times) total += c.times[t]; idle += c.times.idle; }
  return { idle, total };
}
function handleStats(res) {
  const now = cpuSnapshot();
  let cpuPct = 0;
  if (prevCpu) {
    const dIdle = now.idle - prevCpu.idle, dTotal = now.total - prevCpu.total;
    cpuPct = dTotal > 0 ? Math.max(0, Math.min(100, Math.round(100 * (1 - dIdle / dTotal)))) : 0;
  }
  prevCpu = now;
  const totalRam = os.totalmem(), freeRam = os.freemem(), usedRam = totalRam - freeRam;
  sendJSON(res, 200, {
    cpu: cpuPct,
    cores: os.cpus().length,
    ramUsedGB: +(usedRam / 1073741824).toFixed(1),
    ramTotalGB: +(totalRam / 1073741824).toFixed(1),
    ramPct: Math.round(100 * usedRam / totalRam),
    platform: os.platform(),
    uptimeMin: Math.round(os.uptime() / 60),
  });
}

// --- /api/knowledge (list) ---
function handleKnowledge(res) {
  const files = fs.existsSync(KNOWLEDGE) ? fs.readdirSync(KNOWLEDGE).filter(f => f.endsWith('.md')) : [];
  const items = files.map(f => {
    const txt = fs.readFileSync(path.join(KNOWLEDGE, f), 'utf-8');
    const topic = (txt.match(/topic:\s*(.+)/) || [, f.replace('.md', '')])[1].trim();
    return { file: f, topic };
  });
  sendJSON(res, 200, { items });
}

// --- /api/context (simple keyword RAG retrieval) ---
async function handleContext(req, res) {
  const { query } = JSON.parse(await readBody(req) || '{}');
  const files = fs.existsSync(KNOWLEDGE) ? fs.readdirSync(KNOWLEDGE).filter(f => f.endsWith('.md')) : [];
  if (!query || !files.length) return sendJSON(res, 200, { context: '' });
  const terms = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  const scored = files.map(f => {
    const txt = fs.readFileSync(path.join(KNOWLEDGE, f), 'utf-8');
    const low = txt.toLowerCase();
    const score = terms.reduce((s, t) => s + (low.includes(t) ? 1 : 0), 0);
    return { txt, score };
  }).filter(x => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 2);
  sendJSON(res, 200, { context: scored.map(x => x.txt).join('\n\n').slice(0, 3000) });
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.url.startsWith('/api/learn')) return await handleLearn(req, res);
    if (req.url.startsWith('/api/stats')) return handleStats(res);
    if (req.url.startsWith('/api/knowledge')) return handleKnowledge(res);
    if (req.url.startsWith('/api/context')) return await handleContext(req, res);
    if (req.url.startsWith('/api/')) {            // proxy everything else to Ollama
      const u = new URL(OLLAMA + req.url);
      const proxy = http.request({ hostname: u.hostname, port: u.port, path: u.pathname + u.search,
        method: req.method, headers: { 'content-type': 'application/json' } },
        (pr) => { res.writeHead(pr.statusCode, pr.headers); pr.pipe(res); });
      proxy.on('error', (e) => { res.writeHead(502); res.end(JSON.stringify({ error: String(e) })); });
      req.pipe(proxy);
      return;
    }
    const rel = req.url === '/' ? '/index.html' : req.url.split('?')[0];
    const fp = path.join(DIR, rel);
    if (!fp.startsWith(DIR) || !fs.existsSync(fp)) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(fp)] || 'application/octet-stream' });
    fs.createReadStream(fp).pipe(res);
  } catch (e) { sendJSON(res, 500, { error: String(e) }); }
});

server.listen(PORT, () => console.log(`DAZ UI running →  http://localhost:${PORT}`));
