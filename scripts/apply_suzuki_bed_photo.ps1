# Apply Suzuki Bed Gatch-up Photo (Pure ASCII)
$ErrorActionPreference = "Continue"

$baseDir = Split-Path -Parent $PSScriptRoot
$destDir = Join-Path $baseDir "data\photos\personal"
$targetFile = Join-Path $destDir "resident_suzuki_snap.jpg"
$backupFile = Join-Path $destDir "resident_suzuki_snap_backup.jpg"
$pyScript = Join-Path $baseDir "scripts\generate_bed_photo.py"

Write-Host ">>> Step 1: Trying Python PIL generator..." -ForegroundColor Cyan
$pyRes = & python $pyScript 2>&1
$pyOutput = $pyRes -join "`n"
Write-Host $pyOutput

$success = $false
if ($LASTEXITCODE -eq 0 -and (Test-Path $targetFile)) {
    $fi = Get-Item $targetFile
    if ($fi.Length -gt 20000) {
        $success = $true
        Write-Host "Python generator succeeded!" -ForegroundColor Green
    }
}

if (-not $success) {
    Write-Host "`n>>> Step 2: Fallback to .NET System.Drawing generator..." -ForegroundColor Yellow
    Add-Type -AssemblyName System.Drawing
    
    $width = 1000
    $height = 750
    $bmp = New-Object System.Drawing.Bitmap($width, $height)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    
    # 1. Warm room wall background
    $wallBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        (New-Object System.Drawing.Point(0, 0)),
        (New-Object System.Drawing.Point(0, $height)),
        ([System.Drawing.Color]::FromArgb(235, 230, 222)),
        ([System.Drawing.Color]::FromArgb(210, 202, 192))
    )
    $g.FillRectangle($wallBrush, 0, 0, $width, $height)
    
    # 2. Wooden Headboard
    $woodBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(135, 90, 55))
    $g.FillRectangle($woodBrush, 60, 100, 880, 320)
    $grainPen1 = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(105, 68, 38), 3)
    $grainPen2 = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(165, 115, 78), 1)
    for ($y = 125; $y -lt 410; $y += 45) {
        $g.DrawLine($grainPen1, 65, $y, 935, $y)
        $g.DrawLine($grainPen2, 65, $y + 2, 935, $y + 2)
    }
    
    # 3. Gatch-up Backrest & Pillow
    $backBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(236, 232, 225))
    $backPts = @(
        (New-Object System.Drawing.Point(120, 220)),
        (New-Object System.Drawing.Point(880, 220)),
        (New-Object System.Drawing.Point(840, 520)),
        (New-Object System.Drawing.Point(160, 520))
    )
    $g.FillPolygon($backBrush, $backPts)
    
    # Pillow
    $pillowShadow = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(140, 160, 155, 145))
    $pillowBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(250, 248, 244))
    $pillowHi = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 255, 252))
    $g.FillEllipse($pillowShadow, 310, 205, 420, 260)
    $g.FillEllipse($pillowBrush, 320, 195, 400, 250)
    $g.FillEllipse($pillowHi, 340, 210, 360, 220)
    
    # 4. Suzuki Face Crop & Position
    $srcPath = $backupFile
    if (-not (Test-Path $srcPath)) {
        $srcPath = Join-Path $destDir "resident_suzuki_snap.jpg"
    }
    if (Test-Path $srcPath) {
        $srcBmp = [System.Drawing.Image]::FromFile($srcPath)
        $sw = $srcBmp.Width
        $sh = $srcBmp.Height
        
        $cropX = [int]($sw * 0.32)
        $cropY = [int]($sh * 0.08)
        $cropW = [int]($sw * 0.36)
        $cropH = [int]($sh * 0.44)
        
        $destRect = New-Object System.Drawing.Rectangle(340, 160, 320, 290)
        $srcRect = New-Object System.Drawing.Rectangle($cropX, $cropY, $cropW, $cropH)
        
        $g.DrawImage($srcBmp, $destRect, $srcRect, [System.Drawing.GraphicsUnit]::Pixel)
        $srcBmp.Dispose()
    }
    
    # 5. Warm Blanket / Futon Covering
    $blanketBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        (New-Object System.Drawing.Point(0, 440)),
        (New-Object System.Drawing.Point(0, $height)),
        ([System.Drawing.Color]::FromArgb(225, 218, 205)),
        ([System.Drawing.Color]::FromArgb(195, 185, 170))
    )
    $blanketPts = @(
        (New-Object System.Drawing.Point(60, 480)),
        (New-Object System.Drawing.Point(260, 440)),
        (New-Object System.Drawing.Point(500, 435)),
        (New-Object System.Drawing.Point(740, 445)),
        (New-Object System.Drawing.Point(940, 480)),
        (New-Object System.Drawing.Point(960, $height)),
        (New-Object System.Drawing.Point(40, $height))
    )
    $g.FillPolygon($blanketBrush, $blanketPts)
    
    # Collar roll
    $collarBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(240, 235, 226))
    $collarPts = @(
        (New-Object System.Drawing.Point(80, 475)),
        (New-Object System.Drawing.Point(260, 435)),
        (New-Object System.Drawing.Point(500, 430)),
        (New-Object System.Drawing.Point(740, 440)),
        (New-Object System.Drawing.Point(920, 475)),
        (New-Object System.Drawing.Point(910, 510)),
        (New-Object System.Drawing.Point(740, 475)),
        (New-Object System.Drawing.Point(500, 465)),
        (New-Object System.Drawing.Point(260, 470)),
        (New-Object System.Drawing.Point(90, 505))
    )
    $g.FillPolygon($collarBrush, $collarPts)
    
    # 6. Safety Bed Side Rail
    $railBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(210, 190, 185, 175))
    $railPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(230, 225, 220), 2)
    # Bottom bar
    $g.FillRectangle($railBrush, 50, 620, 900, 16)
    $g.DrawRectangle($railPen, 50, 620, 900, 16)
    # Top bar
    $g.FillRectangle($railBrush, 80, 390, 360, 14)
    $g.DrawRectangle($railPen, 80, 390, 360, 14)
    # Spindles
    for ($rx = 120; $rx -lt 420; $rx += 60) {
        $g.FillRectangle($railBrush, $rx, 404, 10, 216)
        $g.DrawRectangle($railPen, $rx, 404, 10, 216)
    }
    
    # Save JPEG
    $codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.FormatDescription -eq "JPEG" }
    $encParams = New-Object System.Drawing.Imaging.EncoderParameters(1)
    $encParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]92)
    
    $bmp.Save($targetFile, $codec, $encParams)
    $g.Dispose()
    $bmp.Dispose()
    Write-Host "System.Drawing generator succeeded: $targetFile" -ForegroundColor Green
}

# Run verify_all.ps1
$verifyScript = Join-Path $baseDir "tests\verify_all.ps1"
if (Test-Path $verifyScript) {
    Write-Host "`n>>> Step 3: Running comprehensive verification tests..." -ForegroundColor Yellow
    & powershell.exe -ExecutionPolicy Bypass -File $verifyScript
}
