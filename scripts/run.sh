#!/usr/bin/env bash
# Start an interactive chat with the model for the chosen profile.
# Usage: ./scripts/run.sh [weak|strong|server]
set -euo pipefail
PROFILE="${1:-weak}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CFG="$ROOT/profiles/$PROFILE.json"
MODEL="$(grep -o '"model"[^,}]*' "$CFG" | head -1 | sed -E 's/.*:\s*"?([^",}]*)"?.*/\1/')"
echo "==> Chatting with $MODEL (profile: $PROFILE). Type /bye to exit."
ollama run "$MODEL"
