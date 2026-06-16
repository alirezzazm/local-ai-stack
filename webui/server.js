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
const { exec } = require('child_process');

const PORT = process.env.PORT || 8080;
const OLLAMA = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
const MODEL = process.env.DAZ_MODEL || 'daz';
const DIR = __dirname;
const KNOWLEDGE = path.join(DIR, '..', 'knowledge');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };

fs.mkdirSync(KNOWLEDGE, { recursive: true });

const REPO = path.join(DIR, '..');
// Auto-commit & push learned knowledge / dataset. Uses the machine's existing
// git credentials. No-ops silently if not a git repo or push isn't authorized.
let syncing = false;
function gitSync(msg) {
  if (process.env.DAZ_GIT_SYNC === '0') return;
  if (syncing || !fs.existsSync(path.join(REPO, '.git'))) return;
  syncing = true;
  const safe = String(msg).replace(/["`$\\]/g, '').slice(0, 100);
  const cmd = `git add knowledge data/dataset.jsonl && ` +
    `git -c user.name="DAZ" -c user.email="daz@local" commit -m "learn: ${safe}" && git push`;
  exec(cmd, { cwd: REPO, windowsHide: true }, (err, so, se) => {
    syncing = false;
    if (err) console.error('[git-sync] skipped:', String(se || err.message).split('\n')[0]);
    else console.log('[git-sync] pushed →', safe);
  });
}

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
// Body: { topic, url?, text? }
//   text → learn from pasted text / uploaded file
//   url  → learn from one specific page
//   else → web search the topic (default)
async function handleLearn(req, res) {
  const { topic, url, text } = JSON.parse(await readBody(req) || '{}');
  let title = (topic || '').trim();
  let corpus = '';
  let sources = [];

  if (text && text.trim()) {                       // from pasted text / file
    corpus = text.slice(0, 12000);
    sources = [{ title: 'متن واردشده توسط کاربر', url: '' }];
    if (!title) title = text.trim().slice(0, 40);
  } else if (url && url.trim()) {                  // from a single URL
    const body = await fetchText(url.trim());
    if (!body) return sendJSON(res, 200, { error: 'نتوانستم صفحه را بخوانم.' });
    corpus = body;
    sources = [{ title: url.trim(), url: url.trim() }];
    if (!title) title = url.trim().slice(0, 50);
  } else if (title) {                              // from a web search
    const results = await searchWeb(title, 5);     // more pages than before (3 → 5)
    if (!results.length) return sendJSON(res, 200, { error: 'هیچ نتیجه‌ای پیدا نشد.' });
    for (const r of results) corpus += `\n[منبع: ${r.title}]\n${await fetchText(r.url)}\n`;
    sources = results;
  } else {
    return sendJSON(res, 400, { error: 'موضوع، لینک یا متن لازم است.' });
  }

  const summary = await askDaz(
    `بر اساس متن‌های زیر درباره‌ی «${title}»، یک خلاصه‌ی دقیق و آموزنده به زبان فارسی بنویس ` +
    `(چند بند کوتاه، فقط حقایق مهم و درست):\n${corpus.slice(0, 8000)}`);
  const srcMd = sources.map(s => `- ${s.title}${s.url ? ': ' + s.url : ''}`).join('\n');
  const md = `---\ntopic: ${title}\ndate: ${new Date().toISOString()}\n---\n\n${summary}\n\n## منابع\n${srcMd}\n`;
  fs.writeFileSync(path.join(KNOWLEDGE, slug(title) + '.md'), md, 'utf-8');
  gitSync(title);
  sendJSON(res, 200, { topic: title, summary, sources });
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

// find a learned topic's text by its title (frontmatter) or slug
function findKnowledge(topic) {
  const files = fs.existsSync(KNOWLEDGE) ? fs.readdirSync(KNOWLEDGE).filter(f => f.endsWith('.md')) : [];
  for (const f of files) {
    const txt = fs.readFileSync(path.join(KNOWLEDGE, f), 'utf-8');
    const m = txt.match(/topic:\s*(.+)/);
    if (m && m[1].trim() === topic) return txt;
  }
  const p = path.join(KNOWLEDGE, slug(topic) + '.md');
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : '';
}

function parseQA(text) {
  const items = [];
  let q = null;
  for (const raw of text.split('\n')) {
    const t = raw.trim();
    const mq = t.match(/^س\s*[:：]\s*(.+)/);
    const ma = t.match(/^ج\s*[:：]\s*(.+)/);
    if (mq) q = mq[1].trim();
    else if (ma && q) { items.push({ q, a: ma[1].trim() }); q = null; }
  }
  return items;
}

// --- /api/quiz : DAZ generates question+answer pairs about a learned topic ---
async function handleQuiz(req, res) {
  const { topic } = JSON.parse(await readBody(req) || '{}');
  const know = findKnowledge(topic);
  if (!know) return sendJSON(res, 200, { error: 'برای این موضوع دانشی پیدا نشد.' });
  const out = await askDaz(
    `بر اساس دانشِ زیر درباره‌ی «${topic}»، دقیقاً ۵ پرسش و پاسخ کوتاه فارسی بساز. ` +
    `هر مورد دقیقاً در این قالب (بدون چیز اضافه):\nس: متن پرسش\nج: متن پاسخ\n\nدانش:\n${know.slice(0, 4000)}`);
  const items = parseQA(out);
  if (!items.length) return sendJSON(res, 200, { error: 'تولید پرسش ناموفق بود؛ دوباره تلاش کن.', raw: out });
  sendJSON(res, 200, { topic, items });
}

// --- /api/verify : save the user-confirmed Q&A as verified knowledge + training data ---
const DATASET = path.join(DIR, '..', 'data', 'dataset.jsonl');
const SYS = 'تو «DAZ» هستی، یک دستیار هوش مصنوعی فارسی‌زبان، دقیق و مودب. همیشه فارسی پاسخ بده.';
async function handleVerify(req, res) {
  const { topic, items } = JSON.parse(await readBody(req) || '{}');
  const good = (items || []).filter(it => it.ok && it.q && it.a);
  if (!good.length) return sendJSON(res, 200, { saved: 0 });
  // 1) append to the fine-tune dataset
  fs.mkdirSync(path.dirname(DATASET), { recursive: true });
  const lines = good.map(it => JSON.stringify({ messages: [
    { role: 'system', content: SYS },
    { role: 'user', content: it.q },
    { role: 'assistant', content: it.a },
  ] })).join('\n') + '\n';
  fs.appendFileSync(DATASET, lines, 'utf-8');
  // 2) store as verified knowledge so RAG uses the human-approved answers
  const md = `---\ntopic: ${topic} (تأییدشده)\ndate: ${new Date().toISOString()}\n---\n\n` +
    good.map(it => `**س:** ${it.q}\n**ج:** ${it.a}`).join('\n\n') + '\n';
  fs.writeFileSync(path.join(KNOWLEDGE, 'verified-' + slug(topic) + '.md'), md, 'utf-8');
  gitSync('verified ' + topic);
  sendJSON(res, 200, { saved: good.length });
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
    if (req.url.startsWith('/api/quiz')) return await handleQuiz(req, res);
    if (req.url.startsWith('/api/verify')) return await handleVerify(req, res);
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
