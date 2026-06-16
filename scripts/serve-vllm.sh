#!/usr/bin/env bash
# Serve a model with vLLM (OpenAI-compatible) for multi-user / high-throughput
# on a big GPU server — an alternative engine to Ollama.
# Needs an NVIDIA GPU + Python.  Install:  pip install vllm
# Usage:  ./scripts/serve-vllm.sh [HF_MODEL]
set -euo pipefail
MODEL="${1:-Qwen/Qwen2.5-7B-Instruct}"   # e.g. Qwen/Qwen2.5-32B-Instruct on a big server
PORT="${VLLM_PORT:-8000}"

echo "==> Starting vLLM for $MODEL on :$PORT (served as 'daz')"
python -m vllm.entrypoints.openai.api_server \
  --model "$MODEL" \
  --host 0.0.0.0 --port "$PORT" \
  --served-model-name daz \
  --max-model-len "${VLLM_MAXLEN:-8192}" \
  --enable-auto-tool-choice --tool-call-parser hermes

echo ""
echo "Now run the DAZ UI pointing at vLLM:"
echo "  DAZ_BACKEND=openai OPENAI_BASE=http://localhost:$PORT/v1 OPENAI_MODEL=daz DAZ_TOKEN=yourtoken ./scripts/webui.sh"
