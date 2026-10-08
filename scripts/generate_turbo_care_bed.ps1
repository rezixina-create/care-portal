# Generate Colorful, Warm Care Bed Photos via Turbo Engine (Pure ASCII)
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Add-Type -AssemblyName System.Drawing

$baseDir = Split-Path -Parent $PSScriptRoot
$candidateDir = Join-Path $baseDir "tests\candidates"

$prompts = @(
    @{
        Name = "warm_checkered";
        Prompt = "Warm, bright documentary photograph in a Japanese nursing care home bedroom. An 90-year-old Japanese grandfather with short white hair and a gentle peaceful smile is lying down resting comfortably in an adjustable care bed, bed head elevated at 35 degrees gatch-up recline. Head resting on a soft beige pillow. He is wearing cozy dark blue and red checkered flannel care pajamas, covered up to chest in a warm yellow-beige quilt blanket. Bright morning sunlight streaming through the window, wooden headboard, bedside safety handrail, cheerful colorful home-like atmosphere, dignified senior, photorealistic, 8k, no text, no watermark"
    },
    @{
        Name = "serene_green";
        Prompt = "Authentic lifestyle photograph taken inside a Japanese elderly care facility. A 91-year-old Japanese elderly man with white hair, relaxed and peacefully resting in an electric motorized nursing bed with 35 degree elevated backrest. Head rests gently against a comfortable soft pillow. Wearing soft pastel blue buttoned pajama shirt, covered to chest in an olive green and cream warm fleece blanket. Bright pleasant bedroom with light wood furniture, bedside rail, sunny window, warm inviting colors, happy calm expression, photorealistic, 8k, no text, no watermark"
    },
    @{
        Name = "natural_rest";
        Prompt = "Candid daytime photograph in a Japanese elder care home private room. An elderly Japanese grandfather (91 years old, kind face, white hair) comfortably resting in bed with backrest elevated at 30 degrees semi-Fowler position. Reclining back peacefully, warm gentle smile, wearing cozy grey cardigan over checkered shirt. Covered in a warm brown and beige patterned quilt. Sunny room with curtain and wooden bed frame, natural daylight, warm lifelike colors, dignified nursing care snapshot, highly realistic, 8k, no text, no watermark"
    }
)

$ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
$wc = New-Object System.Net.WebClient
$wc.Headers.Add("User-Agent", $ua)

foreach ($item in $prompts) {
    $encoded = [System.Uri]::EscapeDataString($item.Prompt)
    $url = "https://image.pollinations.ai/prompt/$encoded`?width=1024&height=768&nologo=true&seed=42"
    $outFile = Join-Path $candidateDir "turbo_$($item.Name).jpg"
    $cleanFile = Join-Path $candidateDir "turbo_clean_$($item.Name).jpg"
    
    Write-Host "Generating $($item.Name)..." -ForegroundColor Cyan
    try {
        $wc.DownloadFile($url, $outFile)
        $fi = Get-Item $outFile
        if ($fi.Length -gt 30000) {
            # Crop bottom 35px to remove any logo
            $srcBmp = [System.Drawing.Bitmap]::FromFile($outFile)
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
            
            $cleanBmp.Save($cleanFile, $codec, $encParams)
            $cleanBmp.Dispose()
            
            Write-Host "  Success: $cleanFile ($((Get-Item $cleanFile).Length) bytes)" -ForegroundColor Green
        }
    } catch {
        Write-Host "  Error: $($_.Exception.Message)" -ForegroundColor Red
    }
}
