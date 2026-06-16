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

  let full = '';
  try {
    const resp = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model, messages: history, stream: true }),
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
      }
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
