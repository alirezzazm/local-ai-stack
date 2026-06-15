# دیتاست آموزشی

`dataset.jsonl` — هر خط یک نمونه‌ی آموزشی در قالب استاندارد chat:

```json
{"messages": [
  {"role": "system",    "content": "..."},
  {"role": "user",      "content": "..."},
  {"role": "assistant", "content": "..."}
]}
```

این همان فرمتی است که Unsloth، LLaMA-Factory، Axolotl و OpenAI fine-tuning می‌فهمند.

## افزودن داده‌ی جدید
هر گفتگوی جدید را به‌صورت یک خط JSON جدید به انتهای فایل اضافه کن. برای نتیجه‌ی خوبِ fine-tune به چند صد تا چند هزار نمونه‌ی باکیفیت نیاز است.

## اعتبارسنجی فرمت
```bash
python - <<'PY'
import json
for i,l in enumerate(open("data/dataset.jsonl",encoding="utf-8")):
    if l.strip(): json.loads(l)        # خطا بدهد یعنی آن خط خراب است
print("OK")
PY
```
