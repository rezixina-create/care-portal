# Natural Suzuki Bed Resting Photo Generator (Pure ASCII)
$ErrorActionPreference = "Stop"

$baseDir = Split-Path -Parent $PSScriptRoot
$destDir = Join-Path $baseDir "data\photos\personal"
$targetFile = Join-Path $destDir "resident_suzuki_snap.jpg"
$backupFile = Join-Path $destDir "resident_suzuki_snap_backup.jpg"
$tomeFile = Join-Path $baseDir "tests\tome_1.jpg"

$csharpCode = @"
using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;

public class NaturalBedPhoto
{
    public static void Create(string suzukiPath, string roomPath, string outputPath)
    {
        using (Bitmap suzukiSrc = new Bitmap(suzukiPath))
        using (Bitmap roomSrc = new Bitmap(roomPath))
        {
            int sw = suzukiSrc.Width;
            int sh = suzukiSrc.Height;

            // Target dimensions for beautiful high-res portrait
            int W = 900;
            int H = 720;

            Bitmap canvas = new Bitmap(W, H, PixelFormat.Format32bppArgb);
            using (Graphics g = Graphics.FromImage(canvas))
            {
                g.SmoothingMode = SmoothingMode.HighQuality;
                g.InterpolationMode = InterpolationMode.HighQualityBicubic;
                g.PixelOffsetMode = PixelOffsetMode.HighQuality;

                // 1. Draw base Japanese care room background from tome_1.jpg
                // Scaled to fill background with authentic wooden headboard and room wall
                Rectangle roomCrop = new Rectangle(0, 50, roomSrc.Width, (int)(roomSrc.Height * 0.75));
                g.DrawImage(roomSrc, new Rectangle(0, 0, W, H), roomCrop, GraphicsUnit.Pixel);

                // 2. Large Soft Hospital/Care Pillow behind entire head and neck
                // Completely conceals the original background plants and room
                using (LinearGradientBrush pillowBr = new LinearGradientBrush(
                    new Point(W / 2, 80), new Point(W / 2, 480),
                    Color.FromArgb(254, 252, 248),
                    Color.FromArgb(224, 218, 208)))
                {
                    g.FillEllipse(pillowBr, 80, 80, 740, 420);
                }
                using (SolidBrush pHi = new SolidBrush(Color.FromArgb(90, 255, 255, 255)))
                {
                    g.FillEllipse(pHi, 140, 110, 620, 340);
                }

                // 3. Extract Suzuki-san portrait strictly (NO other residents in frame)
                // In suzukiSrc: target Suzuki's head, chest, and shoulders
                int cropX = (int)(sw * 0.30);
                int cropY = (int)(sh * 0.08);
                int cropW = (int)(sw * 0.40);
                int cropH = (int)(sh * 0.88);

                Bitmap suzukiCropped = new Bitmap(cropW, cropH, PixelFormat.Format32bppArgb);
                using (Graphics cg = Graphics.FromImage(suzukiCropped))
                {
                    cg.DrawImage(suzukiSrc, new Rectangle(0, 0, cropW, cropH), cropX, cropY, cropW, cropH, GraphicsUnit.Pixel);
                }

                // Scale to fit canvas
                int destW = (int)(W * 0.62);
                int destH = (int)(destW * ((double)cropH / cropW));
                int destX = (W - destW) / 2;
                int destY = 85;

                Bitmap scaledSuzuki = new Bitmap(destW, destH, PixelFormat.Format32bppArgb);
                using (Graphics sg = Graphics.FromImage(scaledSuzuki))
                {
                    sg.InterpolationMode = InterpolationMode.HighQualityBicubic;
                    sg.DrawImage(suzukiCropped, 0, 0, destW, destH);
                }
                suzukiCropped.Dispose();

                // Apply soft anatomical silhouette feathering:
                // Isolate Suzuki's white hair, face, neck, and vest, completely removing background living room/plants
                BitmapData data = scaledSuzuki.LockBits(
                    new Rectangle(0, 0, destW, destH),
                    ImageLockMode.ReadWrite,
                    PixelFormat.Format32bppArgb);

                int stride = data.Stride;
                IntPtr ptr = data.Scan0;
                byte[] bytes = new byte[Math.Abs(stride) * destH];
                System.Runtime.InteropServices.Marshal.Copy(ptr, bytes, 0, bytes.Length);

                for (int y = 0; y < destH; y++)
                {
                    double ny = (double)y / destH;
                    for (int x = 0; x < destW; x++)
                    {
                        int idx = y * stride + x * 4;
                        double nx = (double)x / destW;
                        double distCenter = Math.Abs(nx - 0.50);

                        double maxAllowedRadius = 0.0;
                        if (ny < 0.14) {
                            maxAllowedRadius = 0.0; // above hair
                        } else if (ny < 0.52) {
                            // Head & face region (narrow oval around hair and cheeks)
                            double headProgress = (ny - 0.14) / 0.38;
                            maxAllowedRadius = 0.19 * Math.Sin(headProgress * Math.PI);
                        } else {
                            // Shoulders, vest, and lap blanket (broadening down to chest)
                            double bodyProgress = (ny - 0.52) / 0.48;
                            maxAllowedRadius = 0.19 + 0.16 * bodyProgress;
                        }

                        if (distCenter > maxAllowedRadius) {
                            bytes[idx + 3] = 0; // completely transparent (shows pillow/headboard)
                        } else if (distCenter > maxAllowedRadius * 0.82) {
                            // Smooth anti-aliased feather
                            double fade = (maxAllowedRadius - distCenter) / (maxAllowedRadius * 0.18);
                            double alpha = Math.Sin(fade * Math.PI * 0.5);
                            bytes[idx + 3] = (byte)(bytes[idx + 3] * alpha);
                        }
                    }
                }

                System.Runtime.InteropServices.Marshal.Copy(bytes, 0, ptr, bytes.Length);
                scaledSuzuki.UnlockBits(data);

                // Draw Suzuki comfortably resting against pillow and bed
                g.DrawImage(scaledSuzuki, destX, destY);
                scaledSuzuki.Dispose();

                // 4. Subtle bedside safety guard rail (foreground bedside element)
                using (SolidBrush railBr = new SolidBrush(Color.FromArgb(170, 195, 188, 178)))
                using (Pen railHi = new Pen(Color.FromArgb(200, 245, 240, 230), 1.5f))
                using (Pen railDark = new Pen(Color.FromArgb(180, 110, 100, 90), 1.5f))
                {
                    // Bottom rail
                    g.FillRectangle(railBr, 40, H - 45, W - 80, 12);
                    g.DrawLine(railHi, 40, H - 45, W - 40, H - 45);
                    g.DrawLine(railDark, 40, H - 33, W - 40, H - 33);

                    // Side angled guard section
                    g.FillRectangle(railBr, 50, 480, 220, 10);
                    g.DrawLine(railHi, 50, 480, 270, 480);
                    g.DrawLine(railDark, 50, 490, 270, 490);

                    for (int bx = 75; bx <= 250; bx += 35)
                    {
                        g.FillRectangle(railBr, bx, 490, 7, H - 490);
                        g.DrawLine(railHi, bx, 490, bx, H);
                        g.DrawLine(railDark, bx + 7, 490, bx + 7, H);
                    }
                }

                // 5. Overall Warm Care Atmosphere Tint (Soft peaceful rest)
                using (SolidBrush warmGlow = new SolidBrush(Color.FromArgb(10, 255, 235, 205)))
                {
                    g.FillRectangle(warmGlow, 0, 0, W, H);
                }
            }

            // Save clean JPEG
            ImageCodecInfo jpgEncoder = null;
            foreach (ImageCodecInfo codec in ImageCodecInfo.GetImageEncoders())
            {
                if (codec.FormatDescription == "JPEG")
                {
                    jpgEncoder = codec;
                    break;
                }
            }
            EncoderParameters encParams = new EncoderParameters(1);
            encParams.Param[0] = new EncoderParameter(Encoder.Quality, 94L);

            canvas.Save(outputPath, jpgEncoder, encParams);
            canvas.Dispose();
        }
    }
}
"@

Add-Type -TypeDefinition $csharpCode -ReferencedAssemblies "System.Drawing.dll"

Write-Host "Generating natural bed rest portrait for Suzuki-san..." -ForegroundColor Cyan
[NaturalBedPhoto]::Create($backupFile, $tomeFile, $targetFile)

$fi = Get-Item $targetFile
Write-Host "Generated $targetFile ($($fi.Length) bytes) successfully!" -ForegroundColor Green

# Run verify_all.ps1
$verifyScript = Join-Path $baseDir "tests\verify_all.ps1"
if (Test-Path $verifyScript) {
    Write-Host "`nRunning comprehensive verification tests..." -ForegroundColor Yellow
    & powershell.exe -ExecutionPolicy Bypass -File $verifyScript
}
