# کلاینت‌های DAZ

سه راه برای وصل‌شدن به سرور DAZ از هر دستگاهی. هر سه به یک **آدرس سرور** وصل می‌شوند — وقتی DAZ را روی سرور قوی‌تری بردی، فقط آدرس را عوض کن.

## ۱) PWA (بدون ساخت — ساده‌ترین) ⭐
آدرس سرور را در مرورگر باز کن → منو → **Install / Add to Home Screen**.
روی موبایل و دسکتاپ کار می‌کند. تغییر سرور از داخل اپ: پنل **👤 شخصیت → اتصال به سرور**.

## ۲) اپ دسکتاپ (Electron)
```bash
cd clients/desktop
npm install
set DAZ_SERVER=http://IP-سرور:8080   # ویندوز (مک/لینوکس: export DAZ_SERVER=...)
npm start                            # اجرای اپ
npm run build                        # ساخت فایل نصبی (exe/dmg/AppImage)
```

## ۳) اپ موبایل (Expo / React Native)
```bash
cd clients/mobile
npm install
# آدرس سرور را در App.js (متغیر SERVER) بگذار
npx expo start                       # اجرا روی گوشی با Expo Go
npx expo run:android                 # ساخت APK/اجرای نیتیو
```

---

### چطور به سرور قوی‌تر وصل شوی
1. این ریپو را روی سرور جدید clone کن و `./scripts/setup` + `./scripts/webui` را اجرا کن (با `DAZ_TOKEN`).
2. در هر کلاینت، فقط **آدرس سرور** را به آدرس سرور جدید تغییر بده:
   - PWA: پنل «اتصال به سرور»
   - دسکتاپ: متغیر `DAZ_SERVER`
   - موبایل: متغیر `SERVER` در `App.js`

> توجه: ساخت اپ‌های نیتیو (Electron/Expo) باید روی سیستم خودت انجام شود؛ این پوشه فقط سورس را دارد.
