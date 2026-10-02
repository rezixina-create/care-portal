Add-Type -AssemblyName System.Drawing

$targetPath = "C:\Users\Owner\.gemini\antigravity\scratch\care_portal\data\photos\personal\resident_suzuki_snap.jpg"
$bmp = [System.Drawing.Bitmap]::FromFile($targetPath)

# Shelf plate area: X: 15..125, Y: 370..425
# Sample from wood surface: X: 15..125, Y: 435..455
for ($y = 370; $y -le 425; $y++) {
    for ($x = 15; $x -le 125; $x++) {
        $sampleY = 435 + (($y - 370) % 20)
        $pix = $bmp.GetPixel($x, $sampleY)
        $bmp.SetPixel($x, $y, $pix)
    }
}

$tempPath = "C:\Users\Owner\.gemini\antigravity\scratch\care_portal\data\photos\personal\resident_suzuki_snap_temp.jpg"
$bmp.Save($tempPath, [System.Drawing.Imaging.ImageFormat]::Jpeg)
$bmp.Dispose()

Remove-Item -Path $targetPath -Force
Move-Item -Path $tempPath -Destination $targetPath -Force
Write-Host "Replaced plate with wood grain successfully."
