# apply_bed_update.ps1 - Pure ASCII
$ErrorActionPreference = "Continue"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$portalDir = Split-Path -Parent $scriptDir

function Unesc($s) {
    return [System.Text.RegularExpressions.Regex]::Unescape($s)
}

Write-Host "=========================================================="
Write-Host " Step 1: Search & Download Bed-Resting Senior Photo"
Write-Host "=========================================================="

$headers = @{
    "User-Agent" = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    "Accept" = "application/json"
}

$queries = @("elderly man resting in bed", "senior man lying in bed", "elderly man bed hospital", "old man in bed")
$foundUrl = $null
$destPath = Join-Path $portalDir "data\photos\personal\resident_suzuki_snap.jpg"
$tempCandidatesDir = Join-Path $portalDir "tests\bed_candidates"
if (-not (Test-Path $tempCandidatesDir)) { New-Item -ItemType Directory -Path $tempCandidatesDir -Force | Out-Null }

$candidateIndex = 1
foreach ($q in $queries) {
    Write-Host "Searching Unsplash for: $q..."
    $apiUrl = "https://unsplash.com/napi/search/photos?query=" + [System.Uri]::EscapeDataString($q) + "&per_page=5"
    try {
        $res = Invoke-RestMethod -Uri $apiUrl -Headers $headers -Method Get -TimeoutSec 10
        if ($res.results -and $res.results.Count -gt 0) {
            foreach ($r in $res.results) {
                $imgUrl = $r.urls.regular
                if ($imgUrl) {
                    $outPath = Join-Path $tempCandidatesDir "bed_${candidateIndex}.jpg"
                    Write-Host "  Downloading candidate ${candidateIndex}: $($r.id)..."
                    curl.exe -s -L -H "User-Agent: Mozilla/5.0" "$imgUrl" -o "$outPath"
                    if ((Test-Path $outPath) -and (Get-Item $outPath).Length -gt 10000) {
                        Write-Host "  -> Saved: $outPath ($((Get-Item $outPath).Length) bytes)"
                        $candidateIndex++
                    }
                }
            }
        }
    } catch {
        Write-Host "  Search query failed: $_"
    }
    if ($candidateIndex -gt 5) { break }
}

Write-Host "`nCandidate images collected: $($candidateIndex - 1)"
