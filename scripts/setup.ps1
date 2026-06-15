#requires -Version 5.1
<#
.SYNOPSIS
  Install Ollama (if missing), start it, pull the model for the chosen profile,
  and make sure the dataset is present.
.EXAMPLE
  ./scripts/setup.ps1 -Profile weak
#>
param(
  [ValidateSet('weak','strong','server')]
  [string]$Profile = 'weak'
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$profilePath = Join-Path $root "profiles/$Profile.json"
if (-not (Test-Path $profilePath)) { throw "Profile not found: $profilePath" }
$cfg = Get-Content $profilePath -Raw | ConvertFrom-Json
Write-Host "==> Profile: $($cfg.name)  |  Model: $($cfg.model)" -ForegroundColor Cyan

# 1) Ensure Ollama is installed
if (-not (Get-Command ollama -ErrorAction SilentlyContinue)) {
  Write-Host "==> Ollama not found. Installing via winget..." -ForegroundColor Yellow
  winget install --id Ollama.Ollama --accept-source-agreements --accept-package-agreements --silent
  $env:PATH += ";$env:LOCALAPPDATA\Programs\Ollama"
}

# 2) Start the Ollama service if it isn't already serving
if (-not (Get-Process -Name ollama -ErrorAction SilentlyContinue)) {
  Write-Host "==> Starting Ollama server..." -ForegroundColor Yellow
  Start-Process ollama -ArgumentList 'serve' -WindowStyle Hidden
  Start-Sleep -Seconds 3
}

# 3) Pull the model
Write-Host "==> Pulling model: $($cfg.model) (this can take a while)..." -ForegroundColor Yellow
ollama pull $cfg.model

# 4) Dataset check
$dataset = Join-Path $root 'data/dataset.jsonl'
if (Test-Path $dataset) {
  $lines = (Get-Content $dataset | Measure-Object -Line).Lines
  Write-Host "==> Dataset ready: $dataset ($lines examples)" -ForegroundColor Green
} else {
  Write-Host "!! Dataset missing at $dataset" -ForegroundColor Red
}

Write-Host "`nDone. Run it with:  ./scripts/run.ps1 -Profile $Profile" -ForegroundColor Green
