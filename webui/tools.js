// DAZ tools — the "do things" layer (Jarvis-style).
// Exported as a factory so server.js can pass the repo root.
// Safe tools work out of the box; dangerous ones (power/run_command) require
// DAZ_ALLOW_SYSTEM=1; integrations (email/telegram/smart-home) need config.
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
  const getJSON = async (url, opt) => (await fetch(url, { signal: AbortSignal.timeout(12000), headers: { 'User-Agent': 'Mozilla/5.0' }, ...opt })).json();
  const getText = async (url) => (await (await fetch(url, { signal: AbortSignal.timeout(12000), headers: { 'User-Agent': 'Mozilla/5.0' } })).text());

  // ---- unit conversion table (to a base unit) ----
  const UNITS = {
    length: { m: 1, km: 1000, cm: 0.01, mm: 0.001, mile: 1609.34, foot: 0.3048, ft: 0.3048, inch: 0.0254, yard: 0.9144 },
    mass: { g: 1, kg: 1000, mg: 0.001, lb: 453.592, oz: 28.3495, ton: 1e6 },
  };
  function convertUnits(value, from, to) {
    from = String(from).toLowerCase(); to = String(to).toLowerCase(); value = parseFloat(value);
    if (['c', 'f', 'k'].includes(from) && ['c', 'f', 'k'].includes(to)) {
      let c = from === 'c' ? value : from === 'f' ? (value - 32) * 5 / 9 : value - 273.15;
      const out = to === 'c' ? c : to === 'f' ? c * 9 / 5 + 32 : c + 273.15;
      return `${value}°${from.toUpperCase()} = ${out.toFixed(2)}°${to.toUpperCase()}`;
    }
    for (const cat of Object.values(UNITS)) if (cat[from] && cat[to]) return `${value} ${from} = ${(value * cat[from] / cat[to]).toFixed(4)} ${to}`;
    return 'واحد پشتیبانی نمی‌شود';
  }

  const reminders = () => load().reminders || [];
  function getDueReminders() {
    const d = load(); const now = Date.now();
    const due = (d.reminders || []).filter(r => r.due <= now);
    if (due.length) { d.reminders = (d.reminders || []).filter(r => r.due > now); save(d); }
    return due;
  }

  async function execTool(name, a = {}) {
    try {
      switch (name) {
        case 'get_datetime': return new Date().toLocaleString('fa-IR');
        case 'get_weather': {
          const c = (await getJSON('https://wttr.in/' + encodeURIComponent(a.city) + '?format=j1')).current_condition[0];
          return `${a.city}: ${c.temp_C}°C، ${c.weatherDesc[0].value}، رطوبت ${c.humidity}٪`;
        }
        case 'open_url': { let u = String(a.url); if (!/^https?:\/\//.test(u)) u = 'https://' + u; sh(`start "" "${u.replace(/"/g, '')}"`); return 'باز شد: ' + u; }
        case 'open_app': return sh(`start "" "${String(a.name).replace(/[&|<>"^]/g, '')}"`).then(() => 'باز شد: ' + a.name);
        case 'calculate': {
          const e = String(a.expression || '');
          if (!/^[-+*/(). 0-9%]+$/.test(e)) return 'فقط عبارت ریاضی مجاز است';
          try { return e + ' = ' + Function('return (' + e + ')')(); } catch { return 'خطا در محاسبه'; }
        }
        case 'convert_units': return convertUnits(a.value, a.from_unit, a.to_unit);
        case 'web_search': {
          const html = await getText('https://html.duckduckgo.com/html/?q=' + encodeURIComponent(a.query));
          const re = /class="result__a"[^>]*>([\s\S]*?)<\/a>/g; const out = []; let m;
          while ((m = re.exec(html)) && out.length < 5) out.push('• ' + m[1].replace(/<[^>]+>/g, '').trim());
          return out.join('\n') || 'نتیجه‌ای نبود';
        }
        case 'get_news': {
          const q = a.topic ? '/search?q=' + encodeURIComponent(a.topic) : '';
          const xml = await getText('https://news.google.com/rss' + q + (q ? '&' : '?') + 'hl=fa&gl=IR&ceid=IR:fa');
          const titles = [...xml.matchAll(/<title>([\s\S]*?)<\/title>/g)].slice(1, 6).map(m => '• ' + m[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim());
          return titles.join('\n') || 'خبری نبود';
        }
        case 'wikipedia': {
          const j = await getJSON('https://fa.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(a.query));
          return j.extract || 'مطلبی پیدا نشد';
        }
        case 'get_price': {
          const q = String(a.asset || '').toLowerCase();
          const cryptoMap = { bitcoin: 'bitcoin', btc: 'bitcoin', بیت‌کوین: 'bitcoin', eth: 'ethereum', ethereum: 'ethereum', اتریوم: 'ethereum', usdt: 'tether', tether: 'tether' };
          if (cryptoMap[q]) { const j = await getJSON(`https://api.coingecko.com/api/v3/simple/price?ids=${cryptoMap[q]}&vs_currencies=usd`); return `${a.asset}: $${j[cryptoMap[q]].usd}`; }
          const j = await getJSON('https://open.er-api.com/v6/latest/USD');
          if (j.rates && j.rates.IRR) return `۱ دلار ≈ ${Math.round(j.rates.IRR).toLocaleString()} ریال (نرخ مرجع، نه بازار آزاد)`;
          return 'برای این مورد منبع قیمت ندارم';
        }
        case 'set_reminder': {
          const d = load(); d.reminders = d.reminders || [];
          d.reminders.push({ due: Date.now() + (parseFloat(a.minutes) || 1) * 60000, text: a.text || 'یادآوری' });
          save(d); return `یادآوری برای ${a.minutes} دقیقه دیگر تنظیم شد: ${a.text || ''}`;
        }
        case 'list_reminders': { const r = reminders(); return r.length ? r.map(x => `• ${new Date(x.due).toLocaleTimeString('fa-IR')}: ${x.text}`).join('\n') : 'یادآوری فعالی نیست'; }
        case 'manage_notes': {
          const d = load(); d.notes = d.notes || [];
          if (a.action === 'add') { d.notes.push(a.text); save(d); return 'یادداشت اضافه شد'; }
          if (a.action === 'clear') { d.notes = []; save(d); return 'یادداشت‌ها پاک شد'; }
          return d.notes.length ? d.notes.map((n, i) => `${i + 1}. ${n}`).join('\n') : 'یادداشتی نیست';
        }
        case 'manage_calendar': {
          const d = load(); d.events = d.events || [];
          if (a.action === 'add') { d.events.push({ when: a.when || '', text: a.text }); save(d); return 'رویداد اضافه شد'; }
          return d.events.length ? d.events.map((e, i) => `${i + 1}. ${e.when} — ${e.text}`).join('\n') : 'رویدادی نیست';
        }
        case 'find_file': {
          const dir = a.dir || os.homedir();
          return sh(`cmd /c dir /s /b "${dir}\\*${String(a.name).replace(/[&|<>"^]/g, '')}*" 2>nul`).then(o => o.split('\n').slice(0, 8).join('\n') || 'فایلی پیدا نشد');
        }
        case 'read_file': { try { return fs.readFileSync(a.path, 'utf-8').slice(0, 4000); } catch (e) { return 'خطا در خواندن: ' + e.message; } }
        case 'write_file': { try { fs.writeFileSync(a.path, String(a.content ?? ''), 'utf-8'); return 'نوشته شد: ' + a.path; } catch (e) { return 'خطا در نوشتن: ' + e.message; } }
        case 'system_info': {
          const used = (os.totalmem() - os.freemem()) / 1073741824;
          return `سیستم: ${os.platform()} | CPU: ${os.cpus().length} هسته | RAM: ${used.toFixed(1)}/${(os.totalmem() / 1073741824).toFixed(1)}GB | روشن از ${Math.round(os.uptime() / 3600)} ساعت پیش`;
        }
        case 'set_volume': {
          const key = a.action === 'mute' ? 173 : a.action === 'down' ? 174 : 175;
          const n = Math.max(1, Math.min(50, parseInt(a.amount) || 5));
          return ps(`$o=New-Object -ComObject WScript.Shell; 1..${a.action === 'mute' ? 1 : n} | %{ $o.SendKeys([char]${key}) }`).then(() => `صدا: ${a.action}`);
        }
        case 'set_brightness': return ps(`(Get-WmiObject -Namespace root/WMI -Class WmiMonitorBrightnessMethods).WmiSetBrightness(1,${Math.max(0, Math.min(100, parseInt(a.level) || 50))})`).then(() => `روشنایی: ${a.level}٪`);
        case 'media_control': { const k = { play: 179, pause: 179, next: 176, prev: 177 }[a.action] || 179; return ps(`(New-Object -ComObject WScript.Shell).SendKeys([char]${k})`).then(() => `پخش: ${a.action}`); }
        case 'youtube': { const u = 'https://www.youtube.com/results?search_query=' + encodeURIComponent(a.query); sh(`start "" "${u}"`); return 'یوتیوب باز شد: ' + a.query; }
        // ---- guarded / setup-required ----
        case 'power_control':
          if (!DANGER_OK) return 'برای امنیت غیرفعال است. برای فعال‌سازی DAZ_ALLOW_SYSTEM=1 را تنظیم کن.';
          if (a.action === 'lock') return sh('rundll32.exe user32.dll,LockWorkStation').then(() => 'قفل شد');
          if (a.action === 'shutdown') return sh('shutdown /s /t 30').then(() => 'خاموش‌شدن تا ۳۰ ثانیه دیگر (لغو: shutdown /a)');
          if (a.action === 'restart') return sh('shutdown /r /t 30').then(() => 'ری‌استارت تا ۳۰ ثانیه دیگر');
          return 'اقدام نامعتبر';
        case 'run_command':
          if (!DANGER_OK) return 'اجرای دستور برای امنیت غیرفعال است. DAZ_ALLOW_SYSTEM=1 را تنظیم کن.';
          return ps(String(a.command));
        case 'smart_home': return 'کنترل خانه‌ی هوشمند نیاز به تنظیم دارد (Home Assistant / آدرس دستگاه). فعلاً پیکربندی نشده.';
        case 'send_email':
          if (!process.env.DAZ_SMTP) return 'ارسال ایمیل نیاز به تنظیم SMTP دارد (متغیر DAZ_SMTP). فعلاً پیکربندی نشده.';
          return 'ارسال ایمیل (نسخه‌ی نمایشی).';
        case 'telegram': return 'برای استفاده از تلگرام، یک Bot Token در متغیر DAZ_TG_TOKEN تنظیم کن و راهنمای README را ببین. فعلاً پیکربندی نشده.';
        default: return 'ابزار ناشناخته: ' + name;
      }
    } catch (e) { return 'خطا در اجرای ابزار: ' + e.message; }
  }

  const T = (name, description, props = {}, required = []) =>
    ({ type: 'function', function: { name, description, parameters: { type: 'object', properties: props, required } } });
  const S = (description) => ({ type: 'string', description });

  const TOOLS = [
    T('get_datetime', 'تاریخ و ساعت فعلی'),
    T('get_weather', 'آب‌وهوای یک شهر', { city: S('نام شهر') }, ['city']),
    T('open_url', 'باز کردن یک آدرس وب در مرورگر', { url: S('آدرس') }, ['url']),
    T('open_app', 'باز کردن یک برنامه (notepad/calc/chrome…)', { name: S('نام برنامه') }, ['name']),
    T('calculate', 'محاسبه‌ی یک عبارت ریاضی', { expression: S('مثلاً 2*(3+4)') }, ['expression']),
    T('convert_units', 'تبدیل واحد (طول/جرم/دما)', { value: S('مقدار'), from_unit: S('از واحد'), to_unit: S('به واحد') }, ['value', 'from_unit', 'to_unit']),
    T('web_search', 'جستجوی وب و برگرداندن چند نتیجه', { query: S('عبارت جستجو') }, ['query']),
    T('get_news', 'تیتر اخبار روز (اختیاری: موضوع)', { topic: S('موضوع اختیاری') }),
    T('wikipedia', 'خلاصه‌ی ویکی‌پدیا درباره‌ی یک موضوع', { query: S('موضوع') }, ['query']),
    T('get_price', 'قیمت رمزارز یا نرخ ارز', { asset: S('مثلاً bitcoin یا dollar') }, ['asset']),
    T('set_reminder', 'تنظیم یادآور بعد از چند دقیقه', { minutes: S('چند دقیقه'), text: S('متن یادآوری') }, ['minutes']),
    T('list_reminders', 'فهرست یادآورهای فعال'),
    T('manage_notes', 'مدیریت یادداشت‌ها', { action: S('add | list | clear'), text: S('متن یادداشت') }, ['action']),
    T('manage_calendar', 'مدیریت رویدادهای تقویم', { action: S('add | list'), text: S('عنوان'), when: S('زمان') }, ['action']),
    T('find_file', 'جستجوی فایل در سیستم', { name: S('بخشی از نام فایل'), dir: S('پوشه‌ی شروع (اختیاری)') }, ['name']),
    T('read_file', 'خواندن یک فایل متنی', { path: S('مسیر فایل') }, ['path']),
    T('write_file', 'نوشتن در یک فایل متنی', { path: S('مسیر'), content: S('محتوا') }, ['path', 'content']),
    T('system_info', 'وضعیت سیستم (CPU/RAM/زمان روشن‌بودن)'),
    T('set_volume', 'تنظیم صدا', { action: S('up | down | mute'), amount: S('مقدار پله') }, ['action']),
    T('set_brightness', 'تنظیم روشنایی صفحه', { level: S('۰ تا ۱۰۰') }, ['level']),
    T('media_control', 'کنترل پخش‌کننده', { action: S('play | pause | next | prev') }, ['action']),
    T('youtube', 'جستجو و باز کردن یوتیوب', { query: S('عبارت') }, ['query']),
    T('power_control', 'قفل/خاموش/ری‌استارت سیستم (محافظت‌شده)', { action: S('lock | shutdown | restart') }, ['action']),
    T('run_command', 'اجرای دستور PowerShell (محافظت‌شده)', { command: S('دستور') }, ['command']),
    T('smart_home', 'کنترل دستگاه‌های هوشمند', { action: S('عملیات') }),
    T('send_email', 'ارسال ایمیل (نیاز به تنظیم)', { to: S('گیرنده'), subject: S('موضوع'), body: S('متن') }),
    T('telegram', 'ارسال پیام تلگرام (نیاز به تنظیم)', { text: S('متن') }),
  ];

  return { TOOLS, execTool, getDueReminders };
};
