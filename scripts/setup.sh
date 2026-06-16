#!/usr/bin/env bash
# Install Ollama (if missing), start it, pull the model for the chosen profile,
# and make sure the dataset is present.
# Usage: ./scripts/setup.sh [weak|strong|server]
set -euo pipefail

PROFILE="${1:-auto}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [ "$PROFILE" = "auto" ]; then
  echo "==> Detecting hardware..."
  PROFILE="$(bash "$(dirname "${BASH_SOURCE[0]}")/detect.sh")"
fi
CFG="$ROOT/profiles/$PROFILE.json"
[ -f "$CFG" ] || { echo "Profile not found: $CFG"; exit 1; }

# tiny JSON reader (no jq dependency)
json() { grep -o "\"$1\"[^,}]*" "$CFG" | head -1 | sed -E 's/.*:\s*"?([^",}]*)"?.*/\1/'; }
MODEL="$(json model)"
echo "==> Profile: $PROFILE  |  Model: $MODEL"

# 1) Ensure Ollama is installed
if ! command -v ollama >/dev/null 2>&1; then
  echo "==> Ollama not found. Installing..."
  curl -fsSL https://ollama.com/install.sh | sh
fi

# 2) Start the server if not already running
if ! curl -fsS http://localhost:11434/api/tags >/dev/null 2>&1; then
  echo "==> Starting Ollama server..."
  nohup ollama serve >/tmp/ollama.log 2>&1 &
  sleep 3
fi

# 3) Pull the model
echo "==> Pulling model: $MODEL (this can take a while)..."
ollama pull "$MODEL"

# 4) Dataset check
DATASET="$ROOT/data/dataset.jsonl"
if [ -f "$DATASET" ]; then
  echo "==> Dataset ready: $DATASET ($(wc -l < "$DATASET") examples)"
else
  echo "!! Dataset missing at $DATASET"
fi

echo ""
echo "Done. Run it with:  ./scripts/run.sh $PROFILE"
