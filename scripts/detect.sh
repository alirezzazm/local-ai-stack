#!/usr/bin/env bash
# Detect hardware and print the recommended profile (weak/strong/server).
ramGB=$(awk '/MemTotal/ {printf "%d", $2/1024/1024}' /proc/meminfo 2>/dev/null || echo 0)
vramGB=0; gpuName="none"
if command -v nvidia-smi >/dev/null 2>&1; then
  line=$(nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits 2>/dev/null | head -1)
  gpuName=$(echo "$line" | cut -d, -f1 | xargs)
  mib=$(echo "$line" | cut -d, -f2 | xargs)
  vramGB=$(( mib / 1024 ))
fi
if   [ "$vramGB" -ge 40 ]; then profile=server
elif [ "$vramGB" -ge 16 ]; then profile=strong
else profile=weak; fi
echo "GPU: $gpuName | VRAM: ${vramGB}GB | RAM: ${ramGB}GB  ->  profile: $profile" >&2
echo "$profile"
