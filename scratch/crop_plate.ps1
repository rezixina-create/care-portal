Add-Type -AssemblyName System.Drawing

$targetPath = "C:\Users\Owner\.gemini\antigravity\scratch\care_portal\data\photos\personal\resident_suzuki_snap.jpg"
$bmp = [System.Drawing.Bitmap]::FromFile($targetPath)

# Crop the shelf area (X: 0..250, Y: 300..500)
$crop = New-Object System.Drawing.Bitmap 250, 200
$g = [System.Drawing.Graphics]::FromImage($crop)
$g.DrawImage($bmp, (New-Object System.Drawing.Rectangle 0, 0, 250, 200), (New-Object System.Drawing.Rectangle 0, 300, 250, 200), [System.Drawing.GraphicsUnit]::Pixel)
$crop.Save("C:\Users\Owner\.gemini\antigravity\scratch\care_portal\tests\crop_plate.jpg", [System.Drawing.Imaging.ImageFormat]::Jpeg)
$g.Dispose()
$crop.Dispose()
$bmp.Dispose()
Write-Host "Cropped shelf area."
