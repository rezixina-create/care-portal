Add-Type -AssemblyName System.Drawing

$srcSuzuki = "C:\Users\Owner\.gemini\antigravity\scratch\care_portal\data\photos\personal\resident_suzuki_snap.jpg"
$srcBed = "C:\Users\Owner\.gemini\antigravity\scratch\care_portal\tests\tome_1.jpg"
$outPreview = "C:\Users\Owner\.gemini\antigravity\scratch\care_portal\tests\preview_suzuki_bed.jpg"

$bmpS = [System.Drawing.Bitmap]::FromFile($srcSuzuki) # 1200x896
$bmpB = [System.Drawing.Bitmap]::FromFile($srcBed)    # 800x533

# Target canvas 800x600
$canvas = New-Object System.Drawing.Bitmap 800, 600
$g = [System.Drawing.Graphics]::FromImage($canvas)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality

# 1. Draw Bed Background from tome_1 (scaled to fill 800x600)
# Tome's bed has wooden headboard at Y: 100..250, bedsheet at bottom, wall at top
$g.DrawImage($bmpB, (New-Object System.Drawing.Rectangle 0, 0, 800, 600), (New-Object System.Drawing.Rectangle 0, 0, $bmpB.Width, $bmpB.Height), [System.Drawing.GraphicsUnit]::Pixel)

# 2. Extract Suzuki (head, torso, blanket)
# Suzuki in bmpS (1200x896):
# Center is X: 520, Y: 110..896
# Crop source rectangle around Suzuki: X: 220, Y: 100, W: 630, H: 796
# Draw onto canvas at X: 85, Y: 50, W: 630, H: 796
# But we need soft alpha mask so background blends naturally

$subBmp = New-Object System.Drawing.Bitmap 630, 796
$subG = [System.Drawing.Graphics]::FromImage($subBmp)
$subG.DrawImage($bmpS, (New-Object System.Drawing.Rectangle 0, 0, 630, 796), (New-Object System.Drawing.Rectangle 220, 100, 630, 796), [System.Drawing.GraphicsUnit]::Pixel)
$subG.Dispose()

# Soft ellipse/polygon mask over subBmp edges
for ($y = 0; $y -lt 796; $y++) {
    for ($x = 0; $x -lt 630; $x++) {
        $orig = $subBmp.GetPixel($x, $y)
        
        # Calculate distance to head & body center
        $headCenterX = 315
        $headCenterY = 170
        
        # Distance from center
        $dx = [Math]::Abs($x - $headCenterX)
        
        # Determine alpha based on body outline
        $alpha = 1.0
        
        # Top boundary (above hair Y < 20)
        if ($y -lt 25) {
            $alpha = [Math]::Min($alpha, [Math]::Max(0.0, $y / 25.0))
        }
        
        # Left boundary
        if ($x -lt 60) {
            $alpha = [Math]::Min($alpha, [Math]::Max(0.0, $x / 60.0))
        }
        # Right boundary
        if ($x -gt 570) {
            $alpha = [Math]::Min($alpha, [Math]::Max(0.0, (630 - $x) / 60.0))
        }
        
        # Around head background (left/right of head Y < 300)
        if ($y -lt 300) {
            if ($dx -gt 135) {
                $edgeDist = $dx - 135
                $alpha = [Math]::Min($alpha, [Math]::Max(0.0, 1.0 - ($edgeDist / 45.0)))
            }
        }
        
        if ($alpha -lt 1.0) {
            $subBmp.SetPixel($x, $y, [System.Drawing.Color]::FromArgb([int](255 * $alpha), $orig.R, $orig.G, $orig.B))
        }
    }
}

# Draw blended Suzuki onto Bed background
$g.DrawImage($subBmp, 85, 40)

# Save preview
$canvas.Save($outPreview, [System.Drawing.Imaging.ImageFormat]::Jpeg)

$subBmp.Dispose()
$g.Dispose()
$canvas.Dispose()
$bmpB.Dispose()
$bmpS.Dispose()
Write-Host "Bed composition generated: $outPreview"
