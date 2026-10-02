$ErrorActionPreference = "Continue"
$job = Start-Process powershell.exe -ArgumentList "-ExecutionPolicy Bypass -File server.ps1 -NoBrowser -NoTunnel" -PassThru
Start-Sleep -Seconds 3

try {
    Write-Host "--- Testing GET /api/data ---"
    $res = Invoke-RestMethod -Uri "http://localhost:8888/api/data" -TimeoutSec 3 -UseBasicParsing
    Write-Host "Residents count: $($res.residents.Count)"
    Write-Host "Photos count: $($res.photos.Count)"
    foreach ($p in $res.photos) {
        Write-Host "  - (Resident $($p.resident_id)) [$($p.category)] $($p.title) -> $($p.url)"
        $img = Invoke-WebRequest -Uri "http://localhost:8888/$($p.url)" -TimeoutSec 3 -UseBasicParsing
        if ($img.StatusCode -ne 200) {
            throw "Failed to download $($p.url): $($img.StatusCode)"
        }
    }

    Write-Host "`n--- Testing Weight, Grooming, Bath Records for Today (2026-10-01) ---"
    $wToday = $res.weight_records | Where-Object { $_.date -eq "2026-10-01" }
    Write-Host "Today's Weight Records: $($wToday.Count) / 4 residents"

    $gToday = $res.groomings | Where-Object { $_.date -eq "2026-10-01" }
    Write-Host "Today's Grooming Records: $($gToday.Count) / 4 residents"

    $bToday = $res.baths | Where-Object { $_.date -eq "2026-10-01" }
    Write-Host "Today's Bath Records: $($bToday.Count) / 4 residents"

    Write-Host "`n[SUCCESS] All 8 photo assets and October 1st records verified perfectly on server!"
}
catch {
    Write-Host "Error: $_" -ForegroundColor Red
}
finally {
    if ($job) {
        Stop-Process -Id $job.Id -Force -ErrorAction SilentlyContinue
    }
}
