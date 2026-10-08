# Apply Clean, Warm, Natural Flux Seed 2024 Image for Suzuki-san (Pure ASCII)
$ErrorActionPreference = "Stop"

$baseDir = Split-Path -Parent $PSScriptRoot
$destDir = Join-Path $baseDir "data\photos\personal"
$targetFile = Join-Path $destDir "resident_suzuki_snap.jpg"
$candidateFile = Join-Path $baseDir "tests\candidates\flux_clean_seed_2024.jpg"

if (-not (Test-Path $candidateFile)) {
    Write-Host "Candidate file not found: $candidateFile" -ForegroundColor Red
    exit 1
}

Copy-Item $candidateFile $targetFile -Force
Write-Host "Successfully applied flux_clean_seed_2024.jpg to $targetFile ($((Get-Item $targetFile).Length) bytes)!" -ForegroundColor Green

# Run verify_all.ps1
$verifyScript = Join-Path $baseDir "tests\verify_all.ps1"
if (Test-Path $verifyScript) {
    Write-Host "`nRunning comprehensive verification tests..." -ForegroundColor Yellow
    & powershell.exe -ExecutionPolicy Bypass -File $verifyScript
}
