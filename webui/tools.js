// DAZ tools — grouped for reliable selection on small local models.
// 8 high-level tools expose 20+ capabilities via a `kind`/`action` parameter.
// Safe tools work out of the box; power/run_command need DAZ_ALLOW_SYSTEM=1;
// email/telegram/smart-home need extra config.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');

module.exports = function createTools(REPO) {
  const STORE = path.join(REPO, 'data', 'daz.json');
  const DANGER_OK = process.env.DAZ_ALLOW_SYSTEM === '1';

  const load = () => { try { return JSON.parse(fs.readFileSync(STORE, 'utf-8')); } catch { return { notes: [], events: [], reminders: [] }; } };
  const save = (d) => { fs.mkdirSync(path.dirname(STORE), { recursive: true }); fs.writeFileSync(STORE, JSON.stringify(d, null, 2), 'utf-8'); };
  const sh = (cmd) => new Promise((res) => exec(cmd, { windowsHide: true, timeout: 20000 }, (e, so, se) => res(e ? ('خطا: ' + String(se || e.message).split('\n')[0]) : (so.trim() || 'انجام شد'))));
  const ps = (script) => sh(`powershell -NoProfile -Command "${script.replace(/"/g, '\\"')}"`);
  const getJSON = async (url) => (await fetch(url, { signal: AbortSignal.timeout(12000), headers: { 'User-Agent': 'Mozilla/5.0' } })).json();
  const getText = async (url) => (await (await fetch(url, { signal: AbortSignal.timeout(12000), headers: { 'User-Agent': 'Mozilla/5.0' } })).text());

  const UNITS = {
    length: { m: 1, km: 1000, cm: 0.01, mm: 0.001, mile: 1609.34, foot: 0.3048, ft: 0.3048, inch: 0.0254, yard: 0.9144 },
    mass: { g: 1, kg: 1000, mg: 0.001, lb: 453.592, oz: 28.3495, ton: 1e6 },
  };
  function convertUnits(value, from, to) {
    from = String(from).toLowerCase(); to = String(to).toLowerCase(); value = parseFloat(value);
    if (['c', 'f', 'k'].includes(from) && ['c', 'f', 'k'].includes(to)) {
      const c = from === 'c' ? value : from === 'f' ? (value - 32) * 5 / 9 : value - 273.15;
      const out = to === 'c' ? c : to === 'f' ? c * 9 / 5 + 32 : c + 273.15;
      return `${value}°${from.toUpperCase()} = ${out.toFixed(2)}°${to.toUpperCase()}`;
    }
    for (const cat of Object.values(UNITS)) if (cat[from] && cat[to]) return `${value} ${from} = ${(value * cat[from] / cat[to]).toFixed(4)} ${to}`;
    return 'واحد پشتیبانی نمی‌شود';
  }

  function getDueReminders() {
    const d = load(); const now = Date.now();
    const due = (d.reminders || []).filter(r => r.due <= now);
    if (due.length) { d.reminders = (d.reminders || []).filter(r => r.due > now); save(d); }
    return due;
  }

  // ---- leaf implementations (internal) ----
  async function leaf(name, a) {
    switch (name) {
      case 'datetime': return new Date().toLocaleString('fa-IR');
      case 'weather': { const c = (await getJSON('https://wttr.in/' + encodeURIComponent(a.q) + '?format=j1')).current_condition[0]; return `${a.q}: ${c.temp_C}°C، ${c.weatherDesc[0].value}، رطوبت ${c.humidity}٪`; }
      case 'news': { const xml = await getText('https://news.google.com/rss' + (a.q ? '/search?q=' + encodeURIComponent(a.q) + '&' : '?') + 'hl=fa&gl=IR&ceid=IR:fa'); return [...xml.matchAll(/<title>([\s\S]*?)<\/title>/g)].slice(1, 6).map(m => '• ' + m[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim()).join('\n') || 'خبری نبود'; }
      case 'wikipedia': { const j = await getJSON('https://fa.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(a.q)); return j.extract || 'مطلبی پیدا نشد'; }
      case 'web_search': { const html = await getText('https://html.duckduckgo.com/html/?q=' + encodeURIComponent(a.q)); const re = /class="result__a"[^>]*>([\s\S]*?)<\/a>/g; const out = []; let m; while ((m = re.exec(html)) && out.length < 5) out.push('• ' + m[1].replace(/<[^>]+>/g, '').trim()); return out.join('\n') || 'نتیجه‌ای نبود'; }
      case 'price': {
        const q = String(a.q || '').toLowerCase().replace(/[‌\s]/g, '');
        let id = null;
        if (/bitcoin|btc|بیتکوین/.test(q)) id = 'bitcoin';
        else if (/ethereum|eth|اتریوم/.test(q)) id = 'ethereum';
        else if (/usdt|tether|تتر/.test(q)) id = 'tether';
        if (id) { const j = await getJSON(`https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`); return `${a.q}: $${j[id].usd}`; }
        const j = await getJSON('https://open.er-api.com/v6/latest/USD'); return j.rates?.IRR ? `۱ دلار ≈ ${Math.round(j.rates.IRR).toLocaleString()} ریال (نرخ مرجع)` : 'منبع قیمت ندارم';
      }
      case 'set_volume': { const key = a.action === 'mute' ? 173 : a.action === 'down' ? 174 : 175; const n = Math.max(1, Math.min(50, parseInt(a.value) || 5)); return ps(`$o=New-Object -ComObject WScript.Shell; 1..${a.action === 'mute' ? 1 : n} | %{ $o.SendKeys([char]${key}) }`).then(() => 'صدا: ' + a.action); }
      case 'brightness': return ps(`(Get-WmiObject -Namespace root/WMI -Class WmiMonitorBrightnessMethods).WmiSetBrightness(1,${Math.max(0, Math.min(100, parseInt(a.value) || 50))})`).then(() => 'روشنایی: ' + a.value + '٪');
      case 'media': { const k = { play: 179, pause: 179, next: 176, prev: 177 }[a.action] || 179; return ps(`(New-Object -ComObject WScript.Shell).SendKeys([char]${k})`).then(() => 'پخش: ' + a.action); }
      case 'sysinfo': { const used = (os.totalmem() - os.freemem()) / 1073741824; return `${os.platform()} | CPU ${os.cpus().length} هسته | RAM ${used.toFixed(1)}/${(os.totalmem() / 1073741824).toFixed(1)}GB | روشن از ${Math.round(os.uptime() / 3600)} ساعت پیش`; }
      case 'power':
        if (!DANGER_OK) return 'برای امنیت غیرفعال است (DAZ_ALLOW_SYSTEM=1 را تنظیم کن).';
        if (a.action === 'lock') return sh('rundll32.exe user32.dll,LockWorkStation').then(() => 'قفل شد');
        if (a.action === 'shutdown') return sh('shutdown /s /t 30').then(() => 'خاموش‌شدن تا ۳۰ ثانیه دیگر (لغو: shutdown /a)');
        if (a.action === 'restart') return sh('shutdown /r /t 30').then(() => 'ری‌استارت تا ۳۰ ثانیه دیگر');
        return 'اقدام نامعتبر';
      default: return 'نامشخص';
    }
  }

  // ---- grouped dispatcher ----
  async function execTool(name, a = {}) {
    try {
      switch (name) {
        case 'get_info': {
          const map = { datetime: 'datetime', weather: 'weather', news: 'news', wikipedia: 'wikipedia', search: 'web_search', price: 'price' };
          return leaf(map[a.kind] || 'datetime', { q: a.query });
        }
        case 'calculate': { const e = String(a.expression || ''); if (!/^[-+*/(). 0-9%]+$/.test(e)) return 'فقط عبارت ریاضی مجاز است'; try { return e + ' = ' + Function('return (' + e + ')')(); } catch { return 'خطا در محاسبه'; } }
        case 'convert_units': return convertUnits(a.value, a.from_unit, a.to_unit);
        case 'manage_data': {
          const d = load();
          if (a.kind === 'note') { d.notes = d.notes || []; if (a.action === 'add') { d.notes.push(a.text); save(d); return 'یادداشت اضافه شد'; } if (a.action === 'clear') { d.notes = []; save(d); return 'پاک شد'; } return d.notes.length ? d.notes.map((n, i) => `${i + 1}. ${n}`).join('\n') : 'یادداشتی نیست'; }
          if (a.kind === 'reminder') { d.reminders = d.reminders || []; if (a.action === 'add') { d.reminders.push({ due: Date.now() + (parseFloat(a.when) || 1) * 60000, text: a.text || 'یادآوری' }); save(d); return `یادآوری برای ${a.when} دقیقه دیگر تنظیم شد`; } return d.reminders.length ? d.reminders.map(x => `• ${new Date(x.due).toLocaleTimeString('fa-IR')}: ${x.text}`).join('\n') : 'یادآوری فعالی نیست'; }
          if (a.kind === 'event') { d.events = d.events || []; if (a.action === 'add') { d.events.push({ when: a.when || '', text: a.text }); save(d); return 'رویداد اضافه شد'; } return d.events.length ? d.events.map((e, i) => `${i + 1}. ${e.when} — ${e.text}`).join('\n') : 'رویدادی نیست'; }
          return 'نوع نامعتبر (note/reminder/event)';
        }
        case 'control_system': {
          const x = a.action;
          if (['up', 'down', 'mute'].includes(x)) return leaf('set_volume', { action: x, value: a.value });
          if (x === 'brightness') return leaf('brightness', { value: a.value });
          if (['play', 'pause', 'next', 'prev'].includes(x)) return leaf('media', { action: x });
          if (x === 'sysinfo') return leaf('sysinfo', {});
          if (['lock', 'shutdown', 'restart'].includes(x)) return leaf('power', { action: x });
          return 'اقدام نامعتبر';
        }
        case 'open_thing': {
          if (a.target === 'url') { let u = String(a.value); if (!/^https?:\/\//.test(u)) u = 'https://' + u; sh(`start "" "${u.replace(/"/g, '')}"`); return 'باز شد: ' + u; }
          if (a.target === 'app') { sh(`start "" "${String(a.value).replace(/[&|<>"^]/g, '')}"`); return 'باز شد: ' + a.value; }
          if (a.target === 'youtube') { const u = 'https://www.youtube.com/results?search_query=' + encodeURIComponent(a.value); sh(`start "" "${u}"`); return 'یوتیوب: ' + a.value; }
          return 'هدف نامعتبر (url/app/youtube)';
        }
        case 'file_op': {
          if (a.action === 'find') return sh(`cmd /c dir /s /b "${(a.path || os.homedir())}\\*${String(a.target || a.name).replace(/[&|<>"^]/g, '')}*" 2>nul`).then(o => o.split('\n').slice(0, 8).join('\n') || 'فایلی پیدا نشد');
          if (a.action === 'read') { try { return fs.readFileSync(a.path, 'utf-8').slice(0, 4000); } catch (e) { return 'خطا: ' + e.message; } }
          if (a.action === 'write') { try { fs.writeFileSync(a.path, String(a.content ?? ''), 'utf-8'); return 'نوشته شد: ' + a.path; } catch (e) { return 'خطا: ' + e.message; } }
          return 'اقدام نامعتبر (find/read/write)';
        }
        case 'run_command': return DANGER_OK ? ps(String(a.command)) : 'اجرای دستور غیرفعال است (DAZ_ALLOW_SYSTEM=1).';
        default: return 'ابزار ناشناخته: ' + name;
      }
    } catch (e) { return 'خطا در اجرای ابزار: ' + e.message; }
  }

  const T = (name, description, props = {}, required = []) =>
    ({ type: 'function', function: { name, description, parameters: { type: 'object', properties: props, required } } });
  const E = (description, vals) => ({ type: 'string', enum: vals, description });
  const S = (description) => ({ type: 'string', description });

  const TOOLS = [
    T('get_info', 'گرفتن اطلاعات: ساعت/تاریخ، آب‌وهوا، اخبار، ویکی‌پدیا، جستجوی وب، یا قیمت ارز/رمزارز',
      { kind: E('نوع اطلاعات', ['datetime', 'weather', 'news', 'wikipedia', 'search', 'price']), query: S('ورودی: شهر، موضوع، یا نام دارایی (برای datetime لازم نیست)') }, ['kind']),
    T('calculate', 'محاسبه‌ی یک عبارت ریاضی', { expression: S('مثلاً 125*8') }, ['expression']),
    T('convert_units', 'تبدیل واحد طول/جرم/دما', { value: S('مقدار'), from_unit: S('از'), to_unit: S('به') }, ['value', 'from_unit', 'to_unit']),
    T('manage_data', 'مدیریت یادداشت‌ها، یادآورها، یا رویدادهای تقویم',
      { kind: E('نوع', ['note', 'reminder', 'event']), action: E('کار', ['add', 'list', 'clear']), text: S('متن'), when: S('برای یادآوری: چند دقیقه؛ برای رویداد: زمان') }, ['kind', 'action']),
    T('control_system', 'کنترل سیستم: صدا، روشنایی، پخش رسانه، اطلاعات سیستم، یا قفل/خاموش/ری‌استارت',
      { action: E('اقدام', ['up', 'down', 'mute', 'brightness', 'play', 'pause', 'next', 'prev', 'sysinfo', 'lock', 'shutdown', 'restart']), value: S('مقدار برای صدا/روشنایی') }, ['action']),
    T('open_thing', 'باز کردن یک سایت، برنامه، یا جستجو در یوتیوب',
      { target: E('هدف', ['url', 'app', 'youtube']), value: S('آدرس، نام برنامه، یا عبارت جستجو') }, ['target', 'value']),
    T('file_op', 'کار با فایل: جستجو، خواندن، یا نوشتن',
      { action: E('اقدام', ['find', 'read', 'write']), path: S('مسیر فایل یا پوشه'), target: S('نام برای جستجو'), content: S('محتوا برای نوشتن') }, ['action']),
    T('run_command', 'اجرای دستور PowerShell (محافظت‌شده)', { command: S('دستور') }, ['command']),
  ];

  return { TOOLS, execTool, getDueReminders };
};
