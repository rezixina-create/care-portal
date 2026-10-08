# Generate Brand New AI Photo via Pollinations Flux (Pure ASCII)
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$baseDir = Split-Path -Parent $PSScriptRoot
$destDir = Join-Path $baseDir "data\photos\personal"
$targetFile = Join-Path $destDir "resident_suzuki_snap.jpg"
$candidateDir = Join-Path $baseDir "tests\candidates"

if (-not (Test-Path $candidateDir)) {
    New-Item -ItemType Directory -Path $candidateDir -Force | Out-Null
}

$prompt = "photorealistic documentary photograph of a 91-year-old Japanese grandfather lying down peacefully in a motorized nursing home care bed in Japan, head of the bed is elevated at 35 degrees gatch-up Fowler position, head resting comfortably on soft white medical pillow, covered up to chest in a warm clean quilt blanket, peaceful serene resting expression, natural soft morning sunlight from room window, wooden headboard, bedside safety rail, high detail authentic Japanese nursing facility room, no text, no nametag, no label, 8k photo"

$encodedPrompt = [System.Uri]::EscapeDataString($prompt)
$genUrl = "https://image.pollinations.ai/prompt/$encodedPrompt`?width=1024&height=768&model=flux&nologo=true&seed=8192"

Write-Host "Requesting brand new AI generation from Flux engine..." -ForegroundColor Cyan
Write-Host "URL: $genUrl"

$tempFile = Join-Path $candidateDir "flux_suzuki_bed_$([Guid]::NewGuid().ToString().Substring(0,8)).jpg"
$ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

try {
    $wc = New-Object System.Net.WebClient
    $wc.Headers.Add("User-Agent", $ua)
    # Allow up to 60 seconds for image generation
    $wc.DownloadFile($genUrl, $tempFile)
    
    $fi = Get-Item $tempFile
    Write-Host "Downloaded size: $($fi.Length) bytes" -ForegroundColor Yellow
    
    if ($fi.Length -gt 40000) {
        # Check JPEG or PNG header
        $bytes = [System.IO.File]::ReadAllBytes($tempFile)
        $isJpeg = ($bytes[0] -eq 0xFF -and $bytes[1] -eq 0xD8)
        $isPng = ($bytes[0] -eq 0x89 -and $bytes[1] -eq 0x50)
        
        if ($isJpeg -or $isPng) {
            Write-Host "Valid image generated successfully!" -ForegroundColor Green
            Copy-Item $tempFile $targetFile -Force
            Write-Host "Updated $targetFile" -ForegroundColor Green
        } else {
            Write-Host "Downloaded file is not a valid image binary" -ForegroundColor Red
            exit 1
        }
    } else {
        Write-Host "Downloaded file is too small ($($fi.Length) bytes), likely an error message" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "Error generating image: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Run verify_all.ps1
$verifyScript = Join-Path $baseDir "tests\verify_all.ps1"
if (Test-Path $verifyScript) {
    Write-Host "`nRunning verification tests..." -ForegroundColor Yellow
    & powershell.exe -ExecutionPolicy Bypass -File $verifyScript
}
