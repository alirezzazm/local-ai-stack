#!/usr/bin/env bash
# Start the DAZ web UI (needs Node.js and a running Ollama).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export PORT="${1:-8080}"
echo "==> DAZ web UI →  http://localhost:$PORT  (Ctrl+C to stop)"
node "$ROOT/webui/server.js"
