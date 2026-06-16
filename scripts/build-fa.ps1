#requires -Version 5.1
<#  Build the Persian assistant model `daz` from its Modelfile.
    Needs the base model (qwen2.5:3b) pulled first — run setup.ps1 or:
       ollama pull qwen2.5:3b
#>
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$mf = Join-Path $root 'modelfiles/daz.Modelfile'
Write-Host "==> Building model 'daz' from $mf" -ForegroundColor Cyan
ollama create daz -f $mf
Write-Host "Done. Chat with it:  ollama run daz" -ForegroundColor Green
