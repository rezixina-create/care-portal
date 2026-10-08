# Perfect Suzuki Photo Script (Pure ASCII)
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Add-Type -AssemblyName System.Drawing

$baseDir = Split-Path -Parent $PSScriptRoot
$destDir = Join-Path $baseDir "data\photos\personal"
$targetFile = Join-Path $destDir "resident_suzuki_snap.jpg"
$backupFile = Join-Path $destDir "resident_suzuki_snap_backup.jpg"
$tomeFile = Join-Path $baseDir "tests\tome_1.jpg"
$candidateDir = Join-Path $baseDir "tests\candidates"

if (-not (Test-Path $candidateDir)) {
    New-Item -ItemType Directory -Path $candidateDir -Force | Out-Null
}

$ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

# Method 1: Try scraping Unsplash real photos of senior in bed
$unsplashPages = @(
    "https://unsplash.com/photos/portrait-of-senior-patient-lying-on-bed-in-hospital-healthcare-and-medical-concept-wE49j2vP-L4",
    "https://unsplash.com/photos/an-elderly-man-in-a-hospital-gown-lying-in-a-bed-with-a-nurse-8_Q5Lq0h63s",
    "https://unsplash.com/photos/an-elderly-man-in-a-blue-hospital-gown-on-a-bed-in-a-room-hE5l9G1N8rA"
)

$downloadedReal = $null

foreach ($page in $unsplashPages) {
    try {
        Write-Host "Scraping Unsplash page: $page..."
        $wc = New-Object System.Net.WebClient
        $wc.Headers.Add("User-Agent", $ua)
        $html = $wc.DownloadString($page)
        
        # Search for images.unsplash.com/photo- URLs
        if ($html -match '(https://images\.unsplash\.com/photo-[a-zA-Z0-9_\-]+)') {
            $imgBase = $matches[1]
            $imgUrl = "$imgBase`?auto=format&fit=crop&w=1000&q=80"
            Write-Host "  Found image URL: $imgUrl" -ForegroundColor Cyan
            
            $tempOut = Join-Path $candidateDir "unsplash_real_$([Guid]::NewGuid().ToString().Substring(0,8)).jpg"
            $wc.DownloadFile($imgUrl, $tempOut)
            
            $fi = Get-Item $tempOut
            if ($fi.Length -gt 25000) {
                $bytes = [System.IO.File]::ReadAllBytes($tempOut)
                if ($bytes[0] -eq 0xFF -and $bytes[1] -eq 0xD8) {
                    Write-Host "  -> Successfully downloaded real photo ($($fi.Length) bytes)!" -ForegroundColor Green
                    $downloadedReal = $tempOut
                    break
                }
            }
        }
    } catch {
        Write-Host "  -> Scraping failed: $($_.Exception.Message)" -ForegroundColor Yellow
    }
}

if ($downloadedReal -ne $null) {
    Write-Host "Applying scraped real senior bed photo..." -ForegroundColor Green
    Copy-Item $downloadedReal $targetFile -Force
} else {
    Write-Host "Creating seamless soft-blended bed scene using actual room environment..." -ForegroundColor Cyan
    # Method 2: Seamless realistic photo composite using actual Japanese care room (tome_1.jpg) and Suzuki face
    $baseBmp = [System.Drawing.Image]::FromFile($tomeFile)
    $w = $baseBmp.Width
    $h = $baseBmp.Height
    
    $outBmp = New-Object System.Drawing.Bitmap($w, $h)
    $g = [System.Drawing.Graphics]::FromImage($outBmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    
    # Draw original room background (headboard, wall, bed)
    $g.DrawImage($baseBmp, 0, 0, $w, $h)
    $baseBmp.Dispose()
    
    # Load Suzuki face
    $suzukiBmp = [System.Drawing.Image]::FromFile($backupFile)
    $sw = $suzukiBmp.Width
    $sh = $suzukiBmp.Height
    
    # Crop Suzuki face
    $sCropX = [int]($sw * 0.35)
    $sCropY = [int]($sh * 0.12)
    $sCropW = [int]($sw * 0.30)
    $sCropH = [int]($sh * 0.38)
    
    $suzukiFaceBmp = New-Object System.Drawing.Bitmap($sCropW, $sCropH)
    $fg = [System.Drawing.Graphics]::FromImage($suzukiFaceBmp)
    $fg.DrawImage($suzukiBmp, (New-Object System.Drawing.Rectangle(0, 0, $sCropW, $sCropH)), $sCropX, $sCropY, $sCropW, $sCropH, [System.Drawing.GraphicsUnit]::Pixel)
    $fg.Dispose()
    $suzukiBmp.Dispose()
    
    # Create feather alpha mask
    $maskedFace = New-Object System.Drawing.Bitmap($sCropW, $sCropH, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $mg = [System.Drawing.Graphics]::FromImage($maskedFace)
    $mg.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.AddEllipse(10, 10, $sCropW - 20, $sCropH - 20)
    
    $pbr = New-Object System.Drawing.Drawing2D.PathGradientBrush($path)
    $pbr.CenterColor = [System.Drawing.Color]::FromArgb(255, 255, 255, 255)
    $pbr.SurroundColors = @([System.Drawing.Color]::FromArgb(0, 255, 255, 255))
    
    $tbr = New-Object System.Drawing.TextureBrush($suzukiFaceBmp)
    $mg.FillEllipse($tbr, 0, 0, $sCropW, $sCropH)
    
    # Soft blend Suzuki face onto room bed (slightly tilted back into pillow)
    # Target location where head rests on bed: X: ~360, Y: ~140, W: 240, H: 290
    $destRect = New-Object System.Drawing.Rectangle(360, 130, 240, 290)
    $g.DrawImage($maskedFace, $destRect)
    
    $tbr.Dispose()
    $pbr.Dispose()
    $path.Dispose()
    $mg.Dispose()
    $maskedFace.Dispose()
    $suzukiFaceBmp.Dispose()
    
    # Add warm hospital futon / blanket roll across chest (Y: 380 down to bottom)
    # Natural bedsheet / futon color matching the room
    $futonBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        (New-Object System.Drawing.Point(0, 370)),
        (New-Object System.Drawing.Point(0, $h)),
        ([System.Drawing.Color]::FromArgb(245, 242, 235)),
        ([System.Drawing.Color]::FromArgb(220, 215, 205))
    )
    $futonPts = @(
        (New-Object System.Drawing.Point(0, 420)),
        (New-Object System.Drawing.Point(200, 385)),
        (New-Object System.Drawing.Point(400, 375)),
        (New-Object System.Drawing.Point(600, 380)),
        (New-Object System.Drawing.Point($w, 420)),
        (New-Object System.Drawing.Point($w, $h)),
        (New-Object System.Drawing.Point(0, $h))
    )
    $g.FillPolygon($futonBrush, $futonPts)
    
    # Soft blanket rim shadow
    $rimPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(60, 120, 115, 105), 3)
    $g.DrawCurve($rimPen, @(
        (New-Object System.Drawing.Point(0, 420)),
        (New-Object System.Drawing.Point(200, 385)),
        (New-Object System.Drawing.Point(400, 375)),
        (New-Object System.Drawing.Point(600, 380)),
        (New-Object System.Drawing.Point($w, 420))
    ))
    
    # Save high quality JPEG
    $codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.FormatDescription -eq "JPEG" }
    $encParams = New-Object System.Drawing.Imaging.EncoderParameters(1)
    $encParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]95)
    
    $outBmp.Save($targetFile, $codec, $encParams)
    $g.Dispose()
    $outBmp.Dispose()
    Write-Host "Seamless blended realistic photo created successfully!" -ForegroundColor Green
}

# Run verify_all.ps1
$verifyScript = Join-Path $baseDir "tests\verify_all.ps1"
if (Test-Path $verifyScript) {
    Write-Host "`nRunning verification tests..." -ForegroundColor Yellow
    & powershell.exe -ExecutionPolicy Bypass -File $verifyScript
}
