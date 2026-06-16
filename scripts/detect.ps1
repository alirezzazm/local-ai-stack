#requires -Version 5.1
<#  Detect hardware and print the recommended profile (weak/strong/server). #>
$ErrorActionPreference = 'SilentlyContinue'
$ramGB = [math]::Round((Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory / 1GB, 0)
$vramGB = 0; $gpuName = 'none'
$smi = & nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits 2>$null
if ($smi) {
  $parts = ($smi | Select-Object -First 1) -split ','
  $gpuName = $parts[0].Trim()
  $vramGB = [math]::Round([double]$parts[1].Trim() / 1024, 0)
}
$profile = if ($vramGB -ge 40) { 'server' } elseif ($vramGB -ge 16) { 'strong' } else { 'weak' }
Write-Host "GPU: $gpuName | VRAM: ${vramGB}GB | RAM: ${ramGB}GB  →  profile: $profile" -ForegroundColor Cyan
$profile   # last value = return value
