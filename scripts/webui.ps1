#requires -Version 5.1
<#  Start the DAZ web UI (needs Node.js and a running Ollama). #>
param([int]$Port = 8080)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$env:PORT = $Port
Write-Host "==> DAZ web UI →  http://localhost:$Port  (Ctrl+C to stop)" -ForegroundColor Cyan
node (Join-Path $root 'webui/server.js')
