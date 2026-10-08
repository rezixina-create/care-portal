Add-Type -AssemblyName System.Drawing

$srcPath = "C:\Users\Owner\.gemini\antigravity\scratch\care_portal\tests\preview_suzuki_fixed.jpg"
$dstPath = "C:\Users\Owner\.gemini\antigravity\scratch\care_portal\data\photos\personal\resident_suzuki_snap.jpg"
$previewPath = "C:\Users\Owner\.gemini\antigravity\scratch\care_portal\tests\preview_suzuki_fixed.jpg"

$bmp = [System.Drawing.Bitmap]::FromFile($srcPath)
$w = $bmp.Width
$h = $bmp.Height

# Shelf Name Plate (X: 18..120, Y: 370..420)
# Completely cover with wood texture from shelf surface below (Y: 430..455)
$shelfX1 = 18
$shelfX2 = 120
$shelfY1 = 370
$shelfY2 = 422

for ($y = $shelfY1; $y -le $shelfY2; $y++) {
    for ($x = $shelfX1; $x -le $shelfX2; $x++) {
        $sampleY = 430 + (($y - $shelfY1) % 18)
        $srcPix = $bmp.GetPixel($x, $sampleY)
        $origPix = $bmp.GetPixel($x, $y)

        # Edge feathering (3 pixels boundary)
        $distX = [Math]::Min($x - $shelfX1, $shelfX2 - $x)
        $distY = [Math]::Min($y - $shelfY1, $shelfY2 - $y)
        $minDist = [Math]::Min($distX, $distY)
        $alpha = [Math]::Min(1.0, [Math]::Max(0.0, $minDist / 3.0))

        $r = [int]($srcPix.R * $alpha + $origPix.R * (1.0 - $alpha))
        $g = [int]($srcPix.G * $alpha + $origPix.G * (1.0 - $alpha))
        $b = [int]($srcPix.B * $alpha + $origPix.B * (1.0 - $alpha))

        $bmp.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(255, $r, $g, $b))
    }
}

$bmp.Save($dstPath, [System.Drawing.Imaging.ImageFormat]::Jpeg)
$bmp.Dispose()
Write-Host "Shelf plate completely removed and saved."
