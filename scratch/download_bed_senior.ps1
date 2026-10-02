# download_bed_senior.ps1
$ids = @(
    "photo-1678940806728-cd5a451ee1ea",
    "photo-1765896387454-3c29c0473615",
    "photo-1726754581429-915b8fc7e930",
    "photo-1664478214797-c3c932160cef",
    "photo-1726873324709-ddce7c5188b4",
    "photo-1723618935529-066c31f7d46b"
)

$outDir = "C:\Users\Owner\.gemini\antigravity\scratch\care_portal\tests\unsplash_beds"
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir -Force | Out-Null }

$idx = 1
foreach ($id in $ids) {
    $url = "https://images.unsplash.com/$id?w=800&auto=format&fit=crop&q=80"
    $dest = Join-Path $outDir "u_bed_${idx}.jpg"
    Write-Host "Downloading ${id}..."
    curl.exe -s -L -H "User-Agent: Mozilla/5.0" "$url" -o "$dest"
    if (Test-Path $dest) {
        $len = (Get-Item $dest).Length
        Write-Host "  -> Saved u_bed_${idx}.jpg ($len bytes)"
    }
    $idx++
}
