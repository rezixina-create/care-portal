# Generate Bright, Natural Japanese Care Bed Photos (Pure ASCII)
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Add-Type -AssemblyName System.Drawing

$baseDir = Split-Path -Parent $PSScriptRoot
$destDir = Join-Path $baseDir "data\photos\personal"
$candidateDir = Join-Path $baseDir "tests\candidates"

if (-not (Test-Path $candidateDir)) {
    New-Item -ItemType Directory -Path $candidateDir -Force | Out-Null
}

$prompt = "Bright, warm, candid documentary snapshot in a Japanese elder care home bedroom. An 88-year-old Japanese grandfather with short grey hair and a warm gentle face is comfortably resting in an adjustable wooden care bed, backrest elevated at 35 degrees gatch-up recline. He is wearing a cozy pastel blue button-up shirt and cardigan, resting against a comfortable beige backrest pillow. A warm checkered quilt covers his lap and legs. Beside the bed is a wooden safety handrail. The room is bright and cheerful, sunny daylight from a window, Japanese nursing home interior, natural colors, authentic care snapshot, lively and dignified, photorealistic, no text, no watermark"

$encodedPrompt = [System.Uri]::EscapeDataString($prompt)
$ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
$wc = New-Object System.Net.WebClient
$wc.Headers.Add("User-Agent", $ua)

$seeds = @(2024, 7777, 3456)

foreach ($seed in $seeds) {
    $url = "https://image.pollinations.ai/prompt/$encodedPrompt`?width=1024&height=768&model=flux&nologo=true&seed=$seed"
    $rawOut = Join-Path $candidateDir "flux_natural_seed_$seed.jpg"
    $cleanOut = Join-Path $candidateDir "flux_clean_seed_$seed.jpg"
    
    Write-Host "Generating seed $seed..." -ForegroundColor Cyan
    try {
        $wc.DownloadFile($url, $rawOut)
        $fi = Get-Item $rawOut
        if ($fi.Length -gt 40000) {
            # Crop bottom 35px to remove pollinations watermark
            $srcBmp = [System.Drawing.Bitmap]::FromFile($rawOut)
            $w = $srcBmp.Width
            $h = $srcBmp.Height - 35
            
            $cleanBmp = New-Object System.Drawing.Bitmap($w, $h, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
            $g = [System.Drawing.Graphics]::FromImage($cleanBmp)
            $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $g.DrawImage($srcBmp, (New-Object System.Drawing.Rectangle(0, 0, $w, $h)), 0, 0, $w, $h, [System.Drawing.GraphicsUnit]::Pixel)
            
            $srcBmp.Dispose()
            $g.Dispose()
            
            $codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.FormatDescription -eq "JPEG" }
            $encParams = New-Object System.Drawing.Imaging.EncoderParameters(1)
            $encParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]95)
            
            $cleanBmp.Save($cleanOut, $codec, $encParams)
            $cleanBmp.Dispose()
            
            Write-Host "  Success: $cleanOut ($((Get-Item $cleanOut).Length) bytes)" -ForegroundColor Green
        }
    } catch {
        Write-Host "  Error: $($_.Exception.Message)" -ForegroundColor Red
    }
}
