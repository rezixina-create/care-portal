# PowerShell script to fetch bedridden/gatch-up photo (Pure ASCII)
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$baseDir = Split-Path -Parent $PSScriptRoot
$destDir = Join-Path $baseDir "data\photos\personal"
$targetFile = Join-Path $destDir "resident_suzuki_snap.jpg"
$backupFile = Join-Path $destDir "resident_suzuki_snap_backup.jpg"
$candidateDir = Join-Path $baseDir "tests\candidates"

if (-not (Test-Path $candidateDir)) {
    New-Item -ItemType Directory -Path $candidateDir -Force | Out-Null
}

# Backup original
if ((Test-Path $targetFile) -and (-not (Test-Path $backupFile))) {
    Copy-Item $targetFile $backupFile -Force
}

$ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

$urls = @(
    @{ Name = "semi_fowler"; Url = "https://upload.wikimedia.org/wikipedia/commons/b/b4/Semi-Fowler%27s_position.jpg" },
    @{ Name = "fowler"; Url = "https://upload.wikimedia.org/wikipedia/commons/b/b3/Fowler%27s_Position.jpg" },
    @{ Name = "unsplash_senior_bed"; Url = "https://unsplash.com/photos/wE49j2vP-L4/download?force=true" },
    @{ Name = "unsplash_senior_lying"; Url = "https://unsplash.com/photos/8_Q5Lq0h63s/download?force=true" },
    @{ Name = "unsplash_senior_room"; Url = "https://unsplash.com/photos/hE5l9G1N8rA/download?force=true" },
    @{ Name = "unsplash_senior_smile"; Url = "https://unsplash.com/photos/wU6G37QyN_k/download?force=true" }
)

$downloaded = @()

foreach ($item in $urls) {
    $outPath = Join-Path $candidateDir "$($item.Name).jpg"
    Write-Host "Attempting download: $($item.Name) from $($item.Url)..."
    try {
        $wc = New-Object System.Net.WebClient
        $wc.Headers.Add("User-Agent", $ua)
        $wc.DownloadFile($item.Url, $outPath)
        
        $fi = Get-Item $outPath
        if ($fi.Length -gt 15000) {
            # Check JPEG magic bytes FF D8
            $bytes = [System.IO.File]::ReadAllBytes($outPath)
            if ($bytes[0] -eq 0xFF -and $bytes[1] -eq 0xD8) {
                Write-Host "  -> Success: $($item.Name) ($($fi.Length) bytes, valid JPEG)" -ForegroundColor Green
                $downloaded += @{ Name = $item.Name; Path = $outPath; Size = $fi.Length }
            } else {
                Write-Host "  -> Failed: Not a valid JPEG magic header" -ForegroundColor Yellow
                Remove-Item $outPath -Force
            }
        } else {
            Write-Host "  -> Failed: File too small ($($fi.Length) bytes)" -ForegroundColor Yellow
            Remove-Item $outPath -Force
        }
    } catch {
        Write-Host "  -> Download error: $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host "`nTotal valid downloaded candidates: $($downloaded.Count)"

if ($downloaded.Count -gt 0) {
    # Prefer unsplash realistic photos if available, otherwise semi_fowler
    $selected = $null
    foreach ($d in $downloaded) {
        if ($d.Name -like "unsplash*") {
            $selected = $d
            break
        }
    }
    if ($null -eq $selected) {
        $selected = $downloaded[0]
    }
    
    Write-Host "Selecting: $($selected.Name) ($($selected.Size) bytes)" -ForegroundColor Cyan
    Copy-Item $selected.Path $targetFile -Force
    Write-Host "Updated $targetFile successfully!" -ForegroundColor Green
} else {
    Write-Host "No external candidates downloaded. Keeping backup or existing." -ForegroundColor Yellow
}

# Run verify_all.ps1
$verifyScript = Join-Path $baseDir "tests\verify_all.ps1"
if (Test-Path $verifyScript) {
    Write-Host "`nRunning verify_all.ps1..." -ForegroundColor Yellow
    & powershell.exe -ExecutionPolicy Bypass -File $verifyScript
}
