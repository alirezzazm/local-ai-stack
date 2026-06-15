"""
QLoRA fine-tuning with Unsloth — for the `weak` / `strong` profiles (single GPU).
Trains a small adapter on data/dataset.jsonl. Needs a CUDA GPU.

Install:  pip install "unsloth[colab-new] @ git+https://github.com/unslothai/unsloth.git" trl datasets
Run:      python finetune/unsloth_qlora.py
"""
import json
from pathlib import Path

from unsloth import FastLanguageModel
from datasets import Dataset
from trl import SFTTrainer
from transformers import TrainingArguments

BASE_MODEL = "unsloth/Qwen2.5-3B-Instruct"   # small base; swap for your profile
DATASET = Path(__file__).resolve().parent.parent / "data" / "dataset.jsonl"
OUTPUT = "outputs/qlora-adapter"

# 1) Load model in 4-bit (QLoRA)
model, tokenizer = FastLanguageModel.from_pretrained(
    model_name=BASE_MODEL, max_seq_length=4096, load_in_4bit=True,
)
model = FastLanguageModel.get_peft_model(
    model, r=16, lora_alpha=16, lora_dropout=0,
    target_modules=["q_proj", "k_proj", "v_proj", "o_proj",
                    "gate_proj", "up_proj", "down_proj"],
)

# 2) Load our chat dataset and render it with the model's chat template
rows = [json.loads(l) for l in DATASET.read_text(encoding="utf-8").splitlines() if l.strip()]
def to_text(ex):
    return {"text": tokenizer.apply_chat_template(ex["messages"], tokenize=False)}
ds = Dataset.from_list(rows).map(to_text)

# 3) Train
trainer = SFTTrainer(
    model=model, tokenizer=tokenizer, train_dataset=ds, dataset_text_field="text",
    max_seq_length=4096,
    args=TrainingArguments(
        per_device_train_batch_size=2, gradient_accumulation_steps=4,
        warmup_steps=5, num_train_epochs=3, learning_rate=2e-4,
        logging_steps=1, optim="adamw_8bit", output_dir=OUTPUT,
    ),
)
trainer.train()
model.save_pretrained(OUTPUT)
print(f"Adapter saved to {OUTPUT}")
