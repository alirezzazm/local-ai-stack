// DAZ chat UI — talks to Ollama through the local proxy (/api/chat).
const $ = (id) => document.getElementById(id);
const chat = $('chat');
const input = $('input');
const modelEl = $('model');

const history = [];      // {role, content, images?}
let pendingImage = null; // base64 (no prefix) for vision models

// ---------- rendering ----------
function addBubble(role, text, imageDataUrl) {
  const div = document.createElement('div');
  div.className = 'msg ' + (role === 'user' ? 'user' : 'bot');
  if (imageDataUrl) {
    const img = document.createElement('img');
    img.src = imageDataUrl;
    div.appendChild(img);
  }
  const span = document.createElement('span');
  span.textContent = text;
  div.appendChild(span);
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
  return span;
}

// ---------- send + stream ----------
async function send() {
  const text = input.value.trim();
  if (!text && !pendingImage) return;
  input.value = '';
  autoGrow();

  const imgPreview = pendingImage ? 'data:image/*;base64,' + pendingImage : null;
  addBubble('user', text, imgPreview);

  const hasImage = !!pendingImage;
  const userMsg = { role: 'user', content: text || 'این عکس را توصیف کن' };
  if (hasImage) userMsg.images = [pendingImage];
  history.push(userMsg);
  clearAttachment();

  // when an image is attached, automatically use the vision model
  const model = hasImage ? ($('vmodel').value.trim() || 'llava') : (modelEl.value.trim() || 'daz');

  const botSpan = addBubble('bot', '');
  botSpan.parentElement.classList.add('typing');
  botSpan.textContent = '…';

  // build leading system messages: persona (who DAZ is) + any relevant learned knowledge
  const sys = [];
  if (window.__persona) sys.push({ role: 'system', content: window.__persona });
  if (!hasImage && text) {
    try {
      const c = await (await fetch('/api/context', { method: 'POST',
        headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: text }) })).json();
      if (c.context) sys.push({ role: 'system',
        content: 'از دانشِ زیر که قبلاً یاد گرفته‌ای برای پاسخ استفاده کن:\n' + c.context });
    } catch {}
  }
  const sendMessages = sys.length ? [...sys, ...history] : history;

  // Agent mode: let DAZ use tools (time, weather, open url/app). Non-streaming.
  if ($('actions').checked) {
    try {
      const j = await (await fetch('/api/agent', { method: 'POST',
        headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages: sendMessages }) })).json();
      botSpan.parentElement.classList.remove('typing');
      botSpan.textContent = j.content || '(بدون پاسخ)';
      if (j.actions && j.actions.length) {
        const meta = document.createElement('div'); meta.className = 'meta';
        meta.textContent = '⚙️ ' + j.actions.map(a => a.name + (a.result ? ': ' + a.result : '')).join(' | ');
        botSpan.parentElement.appendChild(meta);
      }
      history.push({ role: 'assistant', content: j.content || '' });
      if ($('tts').checked && j.content) speak(j.content);
    } catch (e) {
      botSpan.parentElement.classList.remove('typing');
      botSpan.textContent = '⚠️ خطا: ' + e.message;
    }
    return;
  }

  let full = '';
  let stats = null;
  try {
    const resp = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model, messages: sendMessages, stream: true }),
    });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        const j = JSON.parse(line);
        const piece = j.message?.content || '';
        if (piece) {
          full += piece;
          botSpan.parentElement.classList.remove('typing');
          botSpan.textContent = full;
          chat.scrollTop = chat.scrollHeight;
        }
        if (j.done && j.eval_count) stats = j;
      }
    }
    // show generation speed under the answer
    if (stats && stats.eval_duration) {
      const tps = (stats.eval_count / (stats.eval_duration / 1e9)).toFixed(1);
      const meta = document.createElement('div');
      meta.className = 'meta';
      meta.textContent = `⚡ ${tps} توکن/ثانیه · ${stats.eval_count} توکن`;
      botSpan.parentElement.appendChild(meta);
    }
  } catch (e) {
    botSpan.parentElement.classList.remove('typing');
    botSpan.textContent = '⚠️ خطا: ' + e.message + '\n(مطمئن شو Ollama و سرور UI بالا هستند.)';
    return;
  }

  history.push({ role: 'assistant', content: full });
  if ($('tts').checked && full) speak(full);
}

// ---------- text-to-speech (browser) ----------
function speak(text) {
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'fa-IR';
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  } catch {}
}

// ---------- speech-to-text (browser) ----------
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let recog = null, recording = false;
function setupMic() {
  const btn = $('mic-btn');
  if (!SR) { btn.title = 'مرورگرت ورودی صوتی را پشتیبانی نمی‌کند'; btn.disabled = true; return; }
  recog = new SR();
  recog.lang = 'fa-IR';
  recog.interimResults = true;
  recog.continuous = false;
  recog.onresult = (e) => {
    let t = '';
    for (const r of e.results) t += r[0].transcript;
    input.value = t; autoGrow();
  };
  recog.onend = () => { recording = false; btn.classList.remove('recording'); };
  btn.onclick = () => {
    if (recording) { recog.stop(); return; }
    recording = true; btn.classList.add('recording'); recog.start();
  };
}

// ---------- image attach ----------
function clearAttachment() {
  pendingImage = null;
  $('attach-bar').classList.add('hidden');
  $('img-input').value = '';
}
$('img-btn').onclick = () => $('img-input').click();
$('attach-remove').onclick = clearAttachment;
$('img-input').onchange = (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const dataUrl = reader.result;
    pendingImage = dataUrl.split(',')[1]; // strip "data:...;base64,"
    $('attach-thumb').src = dataUrl;
    $('attach-name').textContent = file.name + ' (برای عکس به مدل بینایی مثل llava نیاز است)';
    $('attach-bar').classList.remove('hidden');
  };
  reader.readAsDataURL(file);
};

// ---------- composer wiring ----------
function autoGrow() { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 140) + 'px'; }
input.addEventListener('input', autoGrow);
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
});
$('composer').addEventListener('submit', (e) => { e.preventDefault(); send(); });

setupMic();

// ---------- persona (personal Jarvis identity) ----------
async function loadPersona() {
  try {
    const j = await (await fetch('/api/persona')).json();
    window.__persona = j.prompt || '';
    if (j.persona) {
      $('p-name').value = j.persona.name || '';
      $('p-address').value = j.persona.address || '';
      $('p-style').value = j.persona.style || 'jarvis';
      $('p-notes').value = j.persona.notes || '';
    }
  } catch {}
}
loadPersona();
$('persona-btn').onclick = () => $('persona-overlay').classList.remove('hidden');
$('persona-close').onclick = () => $('persona-overlay').classList.add('hidden');
$('persona-overlay').onclick = (e) => { if (e.target.id === 'persona-overlay') $('persona-overlay').classList.add('hidden'); };
$('persona-save').onclick = async () => {
  const body = { name: $('p-name').value.trim(), address: $('p-address').value.trim(),
    style: $('p-style').value, notes: $('p-notes').value.trim() };
  $('persona-status').textContent = 'در حال ذخیره…';
  try {
    const j = await (await fetch('/api/persona', { method: 'POST',
      headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).json();
    window.__persona = j.prompt || '';
    $('persona-status').textContent = '✅ ذخیره شد. از همین حالا DAZ این‌طور رفتار می‌کند.';
  } catch (e) { $('persona-status').textContent = '⚠️ خطا: ' + e.message; }
};

// ---------- live system usage ----------
function barClass(p) { return p >= 85 ? 'bar hot' : p >= 60 ? 'bar warn' : 'bar'; }
async function refreshStats() {
  try {
    const s = await (await fetch('/api/stats')).json();
    $('stats').innerHTML =
      `🖥️ CPU <b>${s.cpu}%</b> <span class="${barClass(s.cpu)}"><span style="width:${s.cpu}%"></span></span>` +
      ` | RAM <b>${s.ramUsedGB}</b>/${s.ramTotalGB}GB <span class="${barClass(s.ramPct)}"><span style="width:${s.ramPct}%"></span></span>` +
      ` | ${s.cores} هسته`;
  } catch { $('stats').textContent = '—'; }
}
refreshStats();
setInterval(refreshStats, 3000);

// ---------- learn from the web ----------
async function refreshKB() {
  try {
    const j = await (await fetch('/api/knowledge')).json();
    const ul = $('kb-list');
    ul.innerHTML = '';
    if (!j.items.length) { ul.innerHTML = '<li style="color:var(--muted)">هنوز چیزی یاد نگرفته.</li>'; return; }
    for (const it of j.items) {
      const li = document.createElement('li');
      const span = document.createElement('span'); span.textContent = '📄 ' + it.topic; li.appendChild(span);
      const del = document.createElement('button'); del.className = 'kb-del'; del.textContent = '🗑'; del.title = 'فراموش کن';
      del.onclick = async () => {
        if (!confirm('این آموخته حذف شود؟ «' + it.topic + '»')) return;
        await fetch('/api/forget', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ file: it.file }) });
        refreshKB();
      };
      li.appendChild(del);
      ul.appendChild(li);
    }
  } catch {}
}
$('learn-btn').onclick = () => { $('learn-overlay').classList.remove('hidden'); refreshKB(); };
$('learn-close').onclick = () => $('learn-overlay').classList.add('hidden');
$('learn-overlay').onclick = (e) => { if (e.target.id === 'learn-overlay') $('learn-overlay').classList.add('hidden'); };

// load a text or PDF file
let pendingPdf = null;
$('learn-file-btn').onclick = () => $('learn-file').click();
$('learn-file').onchange = (e) => {
  const f = e.target.files[0];
  if (!f) return;
  pendingPdf = null;
  if (!$('learn-topic').value.trim()) $('learn-topic').value = f.name.replace(/\.[^.]+$/, '');
  const r = new FileReader();
  if (/\.pdf$/i.test(f.name)) {
    r.onload = () => { pendingPdf = r.result.split(',')[1]; $('learn-text').value = '📑 PDF آماده شد: ' + f.name; };
    r.readAsDataURL(f);
  } else {
    r.onload = () => { $('learn-text').value = r.result; };
    r.readAsText(f);
  }
};

async function learn() {
  const topic = $('learn-topic').value.trim();
  const url = $('learn-url').value.trim();
  const text = pendingPdf ? '' : $('learn-text').value.trim();
  const pdf = pendingPdf;
  if (!topic && !url && !text && !pdf) return;
  const go = $('learn-go'), status = $('learn-status'), result = $('learn-result');
  go.disabled = true; result.textContent = '';
  status.textContent = pdf ? '📑 در حال استخراج متن PDF و خلاصه‌سازی…'
    : text ? '📖 در حال خواندن متن و خلاصه‌سازی…'
    : url ? '🌐 در حال خواندن لینک و خلاصه‌سازی…'
    : '🔎 در حال جستجو در اینترنت و خواندن صفحات… (ممکن است کمی طول بکشد)';
  try {
    const j = await (await fetch('/api/learn', { method: 'POST',
      headers: { 'content-type': 'application/json' }, body: JSON.stringify({ topic, url, text, pdf }) })).json();
    if (j.error) { status.textContent = '⚠️ ' + j.error; return; }
    status.textContent = '✅ یاد گرفتم و ذخیره کردم. حالا می‌توانی درباره‌اش بپرسی.';
    let html = j.summary + '\n\n— منابع —\n';
    for (const s of (j.sources || [])) html += `• ${s.title}\n`;
    result.textContent = html;
    $('learn-topic').value = ''; $('learn-url').value = ''; $('learn-text').value = ''; pendingPdf = null;
    refreshKB();
  } catch (e) {
    status.textContent = '⚠️ خطا: ' + e.message;
  } finally { go.disabled = false; }
}
$('learn-go').onclick = learn;
$('learn-topic').addEventListener('keydown', (e) => { if (e.key === 'Enter') learn(); });

// ---------- review & verify ----------
let quizItems = [];   // {q, a, ok}
async function openReview() {
  $('review-overlay').classList.remove('hidden');
  $('review-list').innerHTML = ''; $('review-save').classList.add('hidden'); $('review-status').textContent = '';
  const sel = $('review-topic'); sel.innerHTML = '';
  try {
    const j = await (await fetch('/api/knowledge')).json();
    const topics = [...new Set(j.items.map(i => i.topic.replace(/ \(تأییدشده\)$/, '')))];
    if (!topics.length) { sel.innerHTML = '<option>هنوز چیزی یاد نگرفته</option>'; return; }
    for (const t of topics) { const o = document.createElement('option'); o.value = o.textContent = t; sel.appendChild(o); }
  } catch {}
}
$('review-btn').onclick = openReview;
$('review-close').onclick = () => $('review-overlay').classList.add('hidden');
$('review-overlay').onclick = (e) => { if (e.target.id === 'review-overlay') $('review-overlay').classList.add('hidden'); };

function renderQuiz() {
  const list = $('review-list'); list.innerHTML = '';
  quizItems.forEach((it, i) => {
    const div = document.createElement('div'); div.className = 'qa-item';
    const q = document.createElement('div'); q.className = 'q'; q.textContent = '❓ ' + it.q; div.appendChild(q);
    const ta = document.createElement('textarea'); ta.rows = 2; ta.value = it.a;
    ta.oninput = () => { it.a = ta.value; }; div.appendChild(ta);
    const acts = document.createElement('div'); acts.className = 'qa-actions';
    const ok = document.createElement('button'); ok.textContent = '✅ درست';
    const no = document.createElement('button'); no.textContent = '❌ غلط';
    const sync = () => { ok.className = it.ok === true ? 'ok-on' : ''; no.className = it.ok === false ? 'no-on' : ''; };
    ok.onclick = () => { it.ok = true; sync(); }; no.onclick = () => { it.ok = false; sync(); };
    acts.appendChild(ok); acts.appendChild(no); div.appendChild(acts);
    list.appendChild(div); sync();
  });
  $('review-save').classList.toggle('hidden', !quizItems.length);
}

async function genQuiz() {
  const topic = $('review-topic').value;
  if (!topic) return;
  $('review-status').textContent = '🧠 DAZ در حال ساختن پرسش‌ها… (روی CPU کمی طول می‌کشد)';
  $('review-list').innerHTML = ''; $('review-save').classList.add('hidden');
  try {
    const j = await (await fetch('/api/quiz', { method: 'POST',
      headers: { 'content-type': 'application/json' }, body: JSON.stringify({ topic }) })).json();
    if (j.error) { $('review-status').textContent = '⚠️ ' + j.error; return; }
    quizItems = j.items.map(it => ({ ...it, ok: null }));
    $('review-status').textContent = `پرسش‌ها آماده‌اند. هر پاسخ را بررسی، اصلاح و درست/غلط کن.`;
    renderQuiz();
  } catch (e) { $('review-status').textContent = '⚠️ خطا: ' + e.message; }
}
$('review-gen').onclick = genQuiz;

async function saveVerified() {
  const topic = $('review-topic').value;
  const good = quizItems.filter(it => it.ok === true);
  if (!good.length) { $('review-status').textContent = 'هیچ پاسخی به‌عنوان «درست» علامت نخورده.'; return; }
  try {
    const j = await (await fetch('/api/verify', { method: 'POST',
      headers: { 'content-type': 'application/json' }, body: JSON.stringify({ topic, items: good }) })).json();
    $('review-status').textContent = `✅ ${j.saved} پاسخ تأییدشده ذخیره شد (هم در دانش، هم در دیتاست آموزشی).`;
  } catch (e) { $('review-status').textContent = '⚠️ خطا: ' + e.message; }
}
$('review-save').onclick = saveVerified;
