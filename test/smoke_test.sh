#!/usr/bin/env bash
# Send one prompt to the profile's model and print the answer.
# Usage: ./test/smoke_test.sh [weak|strong|server] ["your prompt"]
set -euo pipefail
PROFILE="${1:-weak}"
PROMPT="${2:-In one sentence, what is a large language model?}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CFG="$ROOT/profiles/$PROFILE.json"
MODEL="$(grep -o '"model"[^,}]*' "$CFG" | head -1 | sed -E 's/.*:\s*"?([^",}]*)"?.*/\1/')"

echo "==> Smoke test | model: $MODEL | prompt: $PROMPT"
curl -fsS http://localhost:11434/api/generate \
  -d "{\"model\":\"$MODEL\",\"prompt\":\"$PROMPT\",\"stream\":false}" \
  | python3 -c "import sys,json;d=json.load(sys.stdin);print('\n--- RESPONSE ---');print(d['response']);print('----------------')"
