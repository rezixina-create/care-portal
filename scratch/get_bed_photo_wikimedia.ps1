# get_bed_photo_wikimedia.ps1
$headers = @{ "User-Agent" = "CarePortalBot/1.0 (contact: test@example.com)" }

$terms = @(
    "elderly man in bed",
    "elderly man bed",
    "senior in bed",
    "patient resting in bed",
    "geriatric bed"
)

$targetDir = "C:\Users\Owner\.gemini\antigravity\scratch\care_portal\tests\wm_bed"
if (-not (Test-Path $targetDir)) { New-Item -ItemType Directory -Path $targetDir -Force | Out-Null }

$idx = 1
foreach ($t in $terms) {
    Write-Host "Searching: $t"
    $url = "https://commons.wikimedia.org/w/api.php?action=query&list=search&srsearch=" + [System.Uri]::EscapeDataString($t) + "&srnamespace=6&srlimit=8&format=json"
    $res = Invoke-RestMethod -Uri $url -Headers $headers -Method Get
    if ($res.query -and $res.query.search) {
        foreach ($s in $res.query.search) {
            if ($s.title -like "*.jpg" -or $s.title -like "*.jpeg" -or $s.title -like "*.png") {
                # Get direct URL
                $fileUrlQuery = "https://commons.wikimedia.org/w/api.php?action=query&titles=" + [System.Uri]::EscapeDataString($s.title) + "&prop=imageinfo&iiprop=url&format=json"
                $infoRes = Invoke-RestMethod -Uri $fileUrlQuery -Headers $headers -Method Get
                foreach ($p in $infoRes.query.pages.PSObject.Properties) {
                    $imgUrl = $p.Value.imageinfo[0].url
                    if ($imgUrl) {
                        $savePath = Join-Path $targetDir "wm_bed_${idx}.jpg"
                        Write-Host "  Found: $($s.title)"
                        curl.exe -s -L -H "User-Agent: Mozilla/5.0" "$imgUrl" -o "$savePath"
                        if ((Test-Path $savePath) -and (Get-Item $savePath).Length -gt 15000) {
                            Write-Host "  -> Downloaded: wm_bed_${idx}.jpg ($((Get-Item $savePath).Length) bytes)"
                            $idx++
                        }
                    }
                }
            }
            if ($idx -gt 6) { break }
        }
    }
    if ($idx -gt 6) { break }
}

Write-Host "Total downloaded: $($idx - 1)"
