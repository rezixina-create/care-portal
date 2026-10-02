# Generate Perfect Gatch-up Bed Photo via Flux (Pure ASCII)
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Add-Type -AssemblyName System.Drawing

$baseDir = Split-Path -Parent $PSScriptRoot
$destDir = Join-Path $baseDir "data\photos\personal"
$targetFile = Join-Path $destDir "resident_suzuki_snap.jpg"
$candidateDir = Join-Path $baseDir "tests\candidates"

$seeds = @(1234, 5678, 9999)
$prompt = "photorealistic documentary photograph of 91-year-old Japanese elderly man, grandfather with short white hair, resting peacefully in motorized nursing care bed in Japan. The bed backrest is elevated at a 40 degree angle (gatch-up Fowler position). He is comfortably reclined on white pillows, covered up to chest in a warm quilt blanket, wearing elderly male cardigan. Modest private bedroom in Japanese senior care home, wooden headboard, bedside safety rail, gentle afternoon sunlight. Dignified, authentic, calm expression, no text, no watermark, 8k photo"

$encodedPrompt = [System.Uri]::EscapeDataString($prompt)
$ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
$wc = New-Object System.Net.WebClient
$wc.Headers.Add("User-Agent", $ua)

$bestFile = $null

foreach ($seed in $seeds) {
    $url = "https://image.pollinations.ai/prompt/$encodedPrompt`?width=1024&height=768&model=flux&nologo=true&seed=$seed"
    $outFile = Join-Path $candidateDir "flux_bed_seed_$seed.jpg"
    
    Write-Host "Generating seed $seed..." -ForegroundColor Cyan
    try {
        $wc.DownloadFile($url, $outFile)
        $fi = Get-Item $outFile
        if ($fi.Length -gt 40000) {
            Write-Host "  Success: $outFile ($($fi.Length) bytes)" -ForegroundColor Green
            $bestFile = $outFile
            break # Got a valid one!
        }
    } catch {
        Write-Host "  Error on seed ${seed}: $($_.Exception.Message)" -ForegroundColor Yellow
    }
}

if ($bestFile -ne $null) {
    # Remove watermark from bottom right by cropping bottom 35px cleanly
    $srcBmp = [System.Drawing.Bitmap]::FromFile($bestFile)
    $w = $srcBmp.Width
    $h = $srcBmp.Height - 35 # Crop off the watermark
    
    $cleanBmp = New-Object System.Drawing.Bitmap($w, $h, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($cleanBmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.DrawImage($srcBmp, (New-Object System.Drawing.Rectangle(0, 0, $w, $h)), 0, 0, $w, $h, [System.Drawing.GraphicsUnit]::Pixel)
    
    $srcBmp.Dispose()
    $g.Dispose()
    
    $codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.FormatDescription -eq "JPEG" }
    $encParams = New-Object System.Drawing.Imaging.EncoderParameters(1)
    $encParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]95)
    
    $cleanBmp.Save($targetFile, $codec, $encParams)
    $cleanBmp.Dispose()
    
    Write-Host "`nSuccessfully saved clean watermark-free photo to $targetFile" -ForegroundColor Green
} else {
    Write-Host "Failed to generate candidate" -ForegroundColor Red
    exit 1
}

# Run verify_all.ps1
$verifyScript = Join-Path $baseDir "tests\verify_all.ps1"
if (Test-Path $verifyScript) {
    Write-Host "`nRunning verification tests..." -ForegroundColor Yellow
    & powershell.exe -ExecutionPolicy Bypass -File $verifyScript
}
