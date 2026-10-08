# Find and Download Real Unsplash Photos (Pure ASCII)
$candidateDir = Join-Path $PSScriptRoot "..\tests\candidates"
if (-not (Test-Path $candidateDir)) {
    New-Item -ItemType Directory -Path $candidateDir -Force | Out-Null
}

$urlsToSearch = @(
    "https://unsplash.com/s/photos/senior-patient-in-bed",
    "https://unsplash.com/s/photos/elderly-patient-bed",
    "https://unsplash.com/s/photos/elderly-sleeping-bed"
)

$foundImages = @()

foreach ($page in $urlsToSearch) {
    Write-Host "Fetching $page..."
    $html = & curl.exe -s -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" $page
    
    $matches = [regex]::Matches($html, 'https://images\.unsplash\.com/photo-([a-zA-Z0-9_\-]+)')
    foreach ($m in $matches) {
        $id = $m.Groups[1].Value
        # Filter out user avatars or icons (usually short IDs)
        if ($id.Length -ge 15 -and -not ($foundImages -contains $id)) {
            $foundImages += $id
        }
    }
}

Write-Host "Found $($foundImages.Count) unique candidate image IDs" -ForegroundColor Cyan

$count = 0
foreach ($id in $foundImages) {
    if ($count -ge 6) { break }
    
    $downloadUrl = "https://images.unsplash.com/photo-$id`?auto=format&fit=crop&w=1000&q=80"
    $outFile = Join-Path $candidateDir "unsplash_$id.jpg"
    
    Write-Host "Downloading $id..."
    & curl.exe -s -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" -o $outFile $downloadUrl
    
    if (Test-Path $outFile) {
        $fi = Get-Item $outFile
        if ($fi.Length -gt 30000) {
            Write-Host "  Success: $outFile ($($fi.Length) bytes)" -ForegroundColor Green
            $count++
        } else {
            Remove-Item $outFile -Force
        }
    }
}

Write-Host "Total successfully downloaded: $count" -ForegroundColor Green
