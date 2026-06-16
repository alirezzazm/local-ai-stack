#!/usr/bin/env bash
# Build the Persian assistant model `motaro-fa` from its Modelfile.
# Needs the base model first:  ollama pull qwen2.5:3b
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MF="$ROOT/modelfiles/motaro-fa.Modelfile"
echo "==> Building model 'motaro-fa' from $MF"
ollama create motaro-fa -f "$MF"
echo "Done. Chat with it:  ollama run motaro-fa"
