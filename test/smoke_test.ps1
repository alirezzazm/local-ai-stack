#requires -Version 5.1
<#  Send one prompt to the profile's model and print the answer. #>
param(
  [ValidateSet('weak','strong','server')]
  [string]$Profile = 'weak',
  [string]$Prompt = 'In one sentence, what is a large language model?'
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$cfg = Get-Content (Join-Path $root "profiles/$Profile.json") -Raw | ConvertFrom-Json

Write-Host "==> Smoke test | model: $($cfg.model) | prompt: $Prompt" -ForegroundColor Cyan
$body = @{ model = $cfg.model; prompt = $Prompt; stream = $false } | ConvertTo-Json
$resp = Invoke-RestMethod -Uri 'http://localhost:11434/api/generate' -Method Post -Body $body -ContentType 'application/json'
Write-Host "`n--- RESPONSE ---" -ForegroundColor Green
Write-Host $resp.response
Write-Host "----------------" -ForegroundColor Green
Write-Host ("tokens: {0} eval | {1:N1} tok/s" -f $resp.eval_count, ($resp.eval_count / ($resp.eval_duration/1e9)))
