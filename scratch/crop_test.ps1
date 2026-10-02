Add-Type -AssemblyName System.Drawing
$src = [System.Drawing.Bitmap]::FromFile("C:\Users\Owner\.gemini\antigravity\brain\4b265d6d-9c8d-442b-afe5-5771244cf85d\resident_sato_photo_1790853080369.jpg")
Write-Host "Width: $($src.Width), Height: $($src.Height)"

# Crop right side (elderly man and caregiver)
$cropRect = New-Object System.Drawing.Rectangle 950, 250, 480, 600
$bmp = New-Object System.Drawing.Bitmap 480, 600
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.DrawImage($src, (New-Object System.Drawing.Rectangle 0, 0, 480, 600), $cropRect, [System.Drawing.GraphicsUnit]::Pixel)
$bmp.Save("tests\crop_bg_resident.jpg", [System.Drawing.Imaging.ImageFormat]::Jpeg)
$g.Dispose()
$bmp.Dispose()
$src.Dispose()
Write-Host "Cropped successfully."