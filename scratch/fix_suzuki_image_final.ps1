Add-Type -AssemblyName System.Drawing

$srcPath = "C:\Users\Owner\.gemini\antigravity\brain\4b265d6d-9c8d-442b-afe5-5771244cf85d\resident_sato_photo_1790853080369.jpg"
$dstPath = "C:\Users\Owner\.gemini\antigravity\scratch\care_portal\data\photos\personal\resident_suzuki_snap.jpg"

$bmp = [System.Drawing.Bitmap]::FromFile($srcPath)
$w = $bmp.Width
$h = $bmp.Height

# 1. Chest Name Tag (佐藤 太郎)
$tagX1 = 690
$tagX2 = 835
$tagY1 = 535
$tagY2 = 625
$dy = -88

Write-Host "Patching chest name tag..."
for ($y = $tagY1; $y -le $tagY2; $y++) {
    for ($x = $tagX1; $x -le $tagX2; $x++) {
        $srcX = $x
        $srcY = $y + $dy
        if ($srcY -ge 0 -and $srcY -lt $h -and $srcX -ge 0 -and $srcX -lt $w) {
            $srcPix = $bmp.GetPixel($srcX, $srcY)
            $origPix = $bmp.GetPixel($x, $y)

            $distX = [Math]::Min($x - $tagX1, $tagX2 - $x)
            $distY = [Math]::Min($y - $tagY1, $tagY2 - $y)
            $minDist = [Math]::Min($distX, $distY)
            $alpha = [Math]::Min(1.0, [Math]::Max(0.0, $minDist / 8.0))

            $r = [int]($srcPix.R * $alpha + $origPix.R * (1.0 - $alpha))
            $g = [int]($srcPix.G * $alpha + $origPix.G * (1.0 - $alpha))
            $b = [int]($srcPix.B * $alpha + $origPix.B * (1.0 - $alpha))

            $bmp.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(255, $r, $g, $b))
        }
    }
}

# 2. Shelf Name Plate (さとう たろう)
# The white plate with text is at X: 22..135, Y: 355..415.
# We will cover it using texture from the wooden shelf top (X: 140..200, Y: 380..420) or photo frame wood.
Write-Host "Patching shelf name plate..."
$pX1 = 20
$pX2 = 135
$pY1 = 352
$pY2 = 418

for ($y = $pY1; $y -le $pY2; $y++) {
    for ($x = $pX1; $x -le $pX2; $x++) {
        # Sample warm shelf wood grain from X: 145..220, Y: 385..415
        $sampleX = 145 + (($x - $pX1) % 60)
        $sampleY = 385 + (($y - $pY1) % 25)
        $srcPix = $bmp.GetPixel($sampleX, $sampleY)
        $origPix = $bmp.GetPixel($x, $y)

        # Feather boundary
        $distX = [Math]::Min($x - $pX1, $pX2 - $x)
        $distY = [Math]::Min($y - $pY1, $pY2 - $y)
        $minDist = [Math]::Min($distX, $distY)
        $alpha = [Math]::Min(1.0, [Math]::Max(0.0, $minDist / 4.0))

        $r = [int]($srcPix.R * $alpha + $origPix.R * (1.0 - $alpha))
        $g = [int]($srcPix.G * $alpha + $origPix.G * (1.0 - $alpha))
        $b = [int]($srcPix.B * $alpha + $origPix.B * (1.0 - $alpha))

        $bmp.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(255, $r, $g, $b))
    }
}

$bmp.Save($dstPath, [System.Drawing.Imaging.ImageFormat]::Jpeg)
$bmp.Dispose()
Write-Host "Successfully generated final resident_suzuki_snap.jpg with zero names/plates!"
