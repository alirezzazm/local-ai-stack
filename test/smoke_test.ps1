#requires -Version 5.1
<#  Send one prompt to the profile's model and print the answer. #>
param(
  [ValidateSet('weak','strong','server')]
  [string]$Profile = 'weak',
  [string]$Prompt = 'In one sentence, what is a large language model?'
)
$ErrorActionPreference = 'Stop'
# Print non-ASCII (e.g. Persian) correctly in the console
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$root = Split-Path -Parent $PSScriptRoot
$cfg = Get-Content (Join-Path $root "profiles/$Profile.json") -Raw | ConvertFrom-Json

Write-Host "==> Smoke test | model: $($cfg.model) | prompt: $Prompt" -ForegroundColor Cyan
$body = @{ model = $cfg.model; prompt = $Prompt; stream = $false } | ConvertTo-Json -Compress
# Send the body as UTF-8 bytes — PowerShell 5.1 otherwise mangles non-ASCII prompts
$bytes = [System.Text.Encoding]::UTF8.GetBytes($body)
$resp = Invoke-RestMethod -Uri 'http://localhost:11434/api/generate' -Method Post -Body $bytes -ContentType 'application/json; charset=utf-8'
Write-Host "`n--- RESPONSE ---" -ForegroundColor Green
Write-Host $resp.response
Write-Host "----------------" -ForegroundColor Green
Write-Host ("tokens: {0} eval | {1:N1} tok/s" -f $resp.eval_count, ($resp.eval_count / ($resp.eval_duration/1e9)))
