# 🖥️ راهنمای اجرا روی سرور + اتصال کلاینت‌ها

این راهنما می‌گوید چطور DAZ را روی یک سرور (لینوکس یا ویندوز) به‌صورت دائمی بالا بیاوری، امن و در دسترس کنی، و از کلاینت‌ها (مرورگر، اپ دسکتاپ، اپ موبایل) به آن وصل شوی.

---

## بخش ۱ — راه‌اندازی روی سرور

### الف) لینوکس (سرور معمول)
```bash
# 1) پیش‌نیازها
sudo apt update && sudo apt install -y git curl
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash - && sudo apt install -y nodejs

# 2) گرفتن پروژه و نصب
git clone https://github.com/alirezzazm/local-ai-stack
cd local-ai-stack
chmod +x scripts/*.sh
./scripts/setup.sh auto          # Ollama نصب + مدل مناسب سخت‌افزار را دانلود می‌کند
ollama pull qwen2.5:7b           # پایه‌ی DAZ (روی GPU: مدل بزرگ‌تر)
./scripts/build-fa.sh            # ساخت مدل DAZ

# 3) اجرا (با رمز و قابل‌دسترسی از بیرون)
DAZ_TOKEN="یک‌رمز‌قوی" HOST=0.0.0.0 PORT=8080 ./scripts/webui.sh
```

### ب) ویندوز سرور
```powershell
git clone https://github.com/alirezzazm/local-ai-stack ; cd local-ai-stack
./scripts/setup.ps1 -Profile auto
ollama pull qwen2.5:7b ; ./scripts/build-fa.ps1
$env:DAZ_TOKEN="یک‌رمز‌قوی"; $env:HOST="0.0.0.0"; ./scripts/webui.ps1
# باز کردن پورت در فایروال:
New-NetFirewallRule -DisplayName "DAZ" -Direction Inbound -Protocol TCP -LocalPort 8080 -Action Allow
```

### ج) سرور GPU با vLLM (سریع + چند کاربر)
```bash
pip install vllm
./scripts/serve-vllm.sh Qwen/Qwen2.5-32B-Instruct
DAZ_BACKEND=openai OPENAI_BASE=http://localhost:8000/v1 OPENAI_MODEL=daz \
  DAZ_TOKEN="رمز" HOST=0.0.0.0 ./scripts/webui.sh
```
یا یک‌جا با داکر: `DAZ_TOKEN=رمز docker compose -f docker-compose.vllm.yml up -d`

---

## بخش ۲ — همیشه‌روشن نگه‌داشتن (سرویس دائمی)

### لینوکس — systemd
فایل `/etc/systemd/system/daz.service`:
```ini
[Unit]
Description=DAZ AI server
After=network.target

[Service]
WorkingDirectory=/home/USER/local-ai-stack
ExecStart=/usr/bin/node webui/server.js
Environment=HOST=0.0.0.0
Environment=PORT=8080
Environment=DAZ_TOKEN=یک‌رمز‌قوی
Restart=always
User=USER

[Install]
WantedBy=multi-user.target
```
```bash
sudo systemctl daemon-reload && sudo systemctl enable --now daz
sudo systemctl status daz          # وضعیت
journalctl -u daz -f               # لاگ زنده
```

### ویندوز — به‌صورت سرویس با NSSM
```powershell
# nssm را از nssm.cc بگیر، سپس:
nssm install DAZ "C:\Program Files\nodejs\node.exe" "C:\src\local-ai-stack\webui\server.js"
nssm set DAZ AppEnvironmentExtra HOST=0.0.0.0 PORT=8080 DAZ_TOKEN=یک‌رمز‌قوی
nssm start DAZ
```

---

## بخش ۳ — دسترسی امن از اینترنت

### روش ۱ (پیشنهادی) — تونل Cloudflare (HTTPS رایگان، بدون باز کردن پورت)
```bash
cloudflared tunnel --url http://localhost:8080
```
یک آدرس `https://....trycloudflare.com` می‌دهد. این آدرس را در همه‌ی کلاینت‌ها استفاده کن. (HTTPS برای نصب اپ موبایل و میکروفون لازم است.)

### روش ۲ — IP عمومی + پورت
- `HOST=0.0.0.0` + باز کردن پورت در فایروال سرور **و** فایروال ابر/دیتاسنتر.
- آدرس: `http://IP-سرور:8080`
- ⚠️ حتماً `DAZ_TOKEN` بگذار، چون عمومی است.

### روش ۳ — دامنه + HTTPS با Nginx (حرفه‌ای)
```nginx
server {
  server_name daz.example.com;
  location / { proxy_pass http://127.0.0.1:8080; proxy_set_header Host $host; }
}
```
سپس `sudo certbot --nginx -d daz.example.com` برای گواهی HTTPS.

---

## بخش ۴ — اتصال کلاینت‌ها

در همه‌ی کلاینت‌ها فقط **آدرس سرور** و **توکن** را می‌دهی. اگر سرور را عوض کردی، فقط آدرس را تغییر بده.

### الف) مرورگر / اپ نصب‌شده (PWA) — ساده‌ترین
1. آدرس سرور را باز کن (مثلاً `https://daz.example.com`).
2. توکن را وارد کن (یک‌بار؛ ذخیره می‌شود).
3. منوی مرورگر → **Install / Add to Home Screen** → مثل اپ مستقل.
4. تغییر سرور بعداً: پنل 👤 شخصیت → «اتصال به سرور».

### ب) اپ دسکتاپ (Electron)
```bash
cd clients/desktop
npm install
# ویندوز:
set DAZ_SERVER=https://daz.example.com && npm start
# مک/لینوکس:
export DAZ_SERVER=https://daz.example.com && npm start
npm run build       # ساخت فایل نصبی (exe/dmg/AppImage)
```

### ج) اپ موبایل (Expo / React Native)
```bash
cd clients/mobile
npm install
# آدرس سرور را در App.js (متغیر SERVER) بگذار
npx expo start                 # تست با Expo Go
npx expo run:android           # ساخت APK
```

### نکته‌ی توکن در کلاینت
- در PWA/مرورگر: کادر می‌پرسد، یا در پنل «اتصال به سرور» وارد کن.
- در دسکتاپ/موبایل: صفحه‌ی DAZ که لود شد، اگر توکن خواست همان‌جا وارد کن (در حافظه ذخیره می‌شود).

---

## بخش ۵ — به‌روزرسانی و نگه‌داری
```bash
cd local-ai-stack
git pull                       # گرفتن آخرین تغییرات
sudo systemctl restart daz     # ری‌استارت سرویس (لینوکس)
```
- دانش آموخته در `knowledge/` و دیتاست در `data/` خودکار به گیت sync می‌شوند (با اعتبارنامه‌ی گیتِ سرور).
- پشتیبان‌گیری: کافی است پوشه‌ی `knowledge/`, `data/`, `persona.json` را نگه داری.

---

## جمع‌بندی جریان کامل
```
سرور:   clone → setup.sh auto → build-fa → (systemd) webui با DAZ_TOKEN و HOST=0.0.0.0
امنیت:  cloudflared tunnel  →  آدرس HTTPS
کلاینت: آدرس + توکن را بده → نصب PWA / اپ دسکتاپ / اپ موبایل
عوض‌کردن سرور: فقط آدرس را در کلاینت تغییر بده
```
