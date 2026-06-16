# local-ai-stack

راه‌اندازی یک هوش مصنوعی محلی (LLM) با Ollama در **سه حالت سخت‌افزاری**.
هرجا این ریپو را clone کنی، یک اسکریپت همه‌چیز را خودکار نصب می‌کند و مدل/دیتاست را دانلود می‌کند.

> A self-hostable local LLM stack with three hardware profiles. Clone anywhere → one script installs Ollama, pulls the right model, and downloads the dataset.

---

## سه حالت اجرا (Profiles)

| حالت | سخت‌افزار هدف | مدل پیش‌فرض | RAM/VRAM لازم |
|------|----------------|-------------|----------------|
| `weak`   | لپ‌تاپ / VPS بدون GPU (CPU only) | `llama3.2:3b`     | ~۸ گیگ RAM |
| `strong` | سیستم قوی با یک GPU (مثل RTX 4090 / 24GB) | `qwen3.6:27b` (Q4) | ~۲۴ گیگ VRAM |
| `server` | سرور خیلی قوی / چند GPU | `qwen3.6:27b` (full) یا `llama3.3:70b` | ۴۸ گیگ+ VRAM |

پروفایل‌ها در پوشه‌ی [`profiles/`](profiles/) به‌صورت JSON تعریف شده‌اند و به‌راحتی قابل ویرایش‌اند.

---

## نصب و اجرا

### ویندوز (PowerShell)
```powershell
# حالت ضعیف (پیش‌فرض)
./scripts/setup.ps1 -Profile weak
./scripts/run.ps1   -Profile weak

# حالت قوی
./scripts/setup.ps1 -Profile strong
```

### لینوکس / مک (bash)
```bash
chmod +x scripts/*.sh
./scripts/setup.sh weak     # یا strong / server
./scripts/run.sh weak
```

اسکریپت `setup` این کارها را انجام می‌دهد:
1. اگر Ollama نصب نیست، نصبش می‌کند.
2. سرویس Ollama را بالا می‌آورد.
3. مدلِ متناظر با پروفایل را `pull` می‌کند.
4. دیتاست را در `data/` آماده می‌کند.

---

## دستیار فارسی (DAZ)
یک مدل سفارشی فارسی‌زبان بر پایه‌ی Qwen، با شخصیت و قانون «همیشه فارسی جواب بده» (تعریف در [`modelfiles/daz.Modelfile`](modelfiles/daz.Modelfile)).

```powershell
ollama pull qwen2.5:3b      # مدل پایه
./scripts/build-fa.ps1      # ساخت DAZ   (لینوکس/مک: ./scripts/build-fa.sh)
ollama run daz
```
> نکته: مدل پایه‌ی ۳B فارسی را در حد قابل‌قبول می‌فهمد ولی گرامرش گاهی می‌لنگد. برای فارسیِ روان، روی سیستم GPU‌دار پایه را به `qwen2.5:7b` یا بزرگ‌تر تغییر بده (خط `FROM` در Modelfile).

## رابط گرافیکی (Web UI)
یک رابط چت فارسی (RTL) داخل مرورگر — با ورودی **متن** و **صدا** (تبدیل گفتار به متن توسط مرورگر) و خروجی صوتی (TTS). قلاب ورودی **عکس** هم هست که با یک مدل بینایی (مثل `llava`) فعال می‌شود.

```powershell
# نیاز: Node.js + یک Ollama در حال اجرا + مدل daz ساخته‌شده
./scripts/webui.ps1            # لینوکس/مک: ./scripts/webui.sh
# سپس در مرورگر باز کن:  http://localhost:8080
```
- بدون هیچ وابستگی npm (فقط Node خام). فایل‌ها در [`webui/`](webui/).
- نام مدل را از بالای صفحه می‌توانی عوض کنی (پیش‌فرض `daz`).
- 🎤 ورودی صوتی فارسی در مرورگرهای مبتنی بر Chrome بهتر کار می‌کند.
- 📷 برای فهم عکس به مدل بینایی نیاز است: `ollama pull llava` و سپس نام مدل را در UI به `llava` تغییر بده.

## دیتاست آموزشی
[`data/dataset.jsonl`](data/dataset.jsonl) — داده‌ها در قالب استاندارد chat (`messages`) برای fine-tune.
جزئیات در [`data/README.md`](data/README.md).

## Fine-tune (آموزش با داده‌ی خودت)
کانفیگ‌های آماده در [`finetune/`](finetune/):
- `weak/strong` → **Unsloth + QLoRA** (تک‌GPU)
- `server` → **LLaMA-Factory / Axolotl** (چند GPU)

---

## تست
```powershell
./test/smoke_test.ps1     # ویندوز
```
```bash
./test/smoke_test.sh      # لینوکس/مک
```
یک پرسش نمونه به مدل می‌دهد و پاسخ را چاپ می‌کند تا مطمئن شوی همه‌چیز کار می‌کند.
