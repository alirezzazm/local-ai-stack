#requires -Version 5.1
<#
.SYNOPSIS  Start an interactive chat with the model for the chosen profile.
.EXAMPLE   ./scripts/run.ps1 -Profile weak
#>
param(
  [ValidateSet('weak','strong','server')]
  [string]$Profile = 'weak'
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$cfg = Get-Content (Join-Path $root "profiles/$Profile.json") -Raw | ConvertFrom-Json
Write-Host "==> Chatting with $($cfg.model) (profile: $Profile). Type /bye to exit." -ForegroundColor Cyan
ollama run $cfg.model
