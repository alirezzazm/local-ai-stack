# Fine-tune (آموزش مدل با داده‌ی خودت)

داده‌ها از [`../data/dataset.jsonl`](../data/dataset.jsonl) خوانده می‌شوند (قالب `messages`).

| پروفایل | ابزار پیشنهادی | فایل |
|---------|----------------|------|
| `weak` / `strong` | **Unsloth + QLoRA** (تک‌GPU، سریع‌ترین) | [`unsloth_qlora.py`](unsloth_qlora.py) |
| `server` | **LLaMA-Factory** (چند GPU، DeepSpeed) | [`llamafactory_server.yaml`](llamafactory_server.yaml) |

## نکته‌ها
- برای fine-tune **به GPU با CUDA نیاز داری**؛ روی CPU عملاً ممکن نیست.
- این دیتاست فقط نقطه‌ی شروع است؛ برای نتیجه‌ی خوب چند صد تا چند هزار نمونه‌ی باکیفیت لازم است.
- بعد از آموزش، آداپتور را می‌توانی با `ollama create` به یک مدل GGUF تبدیل و در همین استک استفاده کنی.

## بعد از آموزش → استفاده در Ollama
```bash
# 1) آداپتور/مدل را به GGUF تبدیل کن (با llama.cpp)
# 2) یک Modelfile بساز:
#    FROM ./merged-model.gguf
# 3) ثبتش کن:
ollama create my-finetuned -f Modelfile
ollama run my-finetuned
```
