#!/usr/bin/env bash
# Build the Persian assistant model `daz` from its Modelfile.
# Needs the base model first:  ollama pull qwen2.5:3b
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MF="$ROOT/modelfiles/daz.Modelfile"
echo "==> Building model 'daz' from $MF"
ollama create daz -f "$MF"
echo "Done. Chat with it:  ollama run daz"
