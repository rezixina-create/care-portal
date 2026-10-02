# Dignified High-Definition Crop for Suzuki-san (Pure ASCII)
$ErrorActionPreference = "Stop"

$baseDir = Split-Path -Parent $PSScriptRoot
$destDir = Join-Path $baseDir "data\photos\personal"
$targetFile = Join-Path $destDir "resident_suzuki_snap.jpg"
$backupFile = Join-Path $destDir "resident_suzuki_snap_backup.jpg"

Add-Type -AssemblyName System.Drawing

$src = [System.Drawing.Bitmap]::FromFile($backupFile)
$sw = $src.Width
$sh = $src.Height

# High precision crop centered on Suzuki:
# X: 340 to 920 (width 580) -> completely excludes bookshelf and background residents
# Y: 110 to 830 (height 720) -> from top of white hair down to warm knitted blanket
$cropX = 340
$cropY = 110
$cropW = 580
$cropH = 720

$outBmp = New-Object System.Drawing.Bitmap(800, 1000, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($outBmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

$g.DrawImage($src, (New-Object System.Drawing.Rectangle(0, 0, 800, 1000)), $cropX, $cropY, $cropW, $cropH, [System.Drawing.GraphicsUnit]::Pixel)

# Soft gentle warm tone enhancement
$tint = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(8, 255, 235, 205))
$g.FillRectangle($tint, 0, 0, 800, 1000)

$src.Dispose()
$g.Dispose()

$codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.FormatDescription -eq "JPEG" }
$encParams = New-Object System.Drawing.Imaging.EncoderParameters(1)
$encParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]95)

$outBmp.Save($targetFile, $codec, $encParams)
$outBmp.Dispose()

Write-Host "Created dignified crop: $targetFile" -ForegroundColor Green

# Run verify_all.ps1
$verifyScript = Join-Path $baseDir "tests\verify_all.ps1"
if (Test-Path $verifyScript) {
    Write-Host "`nRunning verification tests..." -ForegroundColor Yellow
    & powershell.exe -ExecutionPolicy Bypass -File $verifyScript
}
