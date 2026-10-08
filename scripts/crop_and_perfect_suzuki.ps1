# Realistic Suzuki Bed Portrait Synthesizer (Pure ASCII)
$ErrorActionPreference = "Stop"

$baseDir = Split-Path -Parent $PSScriptRoot
$destDir = Join-Path $baseDir "data\photos\personal"
$targetFile = Join-Path $destDir "resident_suzuki_snap.jpg"
$backupFile = Join-Path $destDir "resident_suzuki_snap_backup.jpg"

$csharpCode = @"
using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;

public class PerfectSuzukiPortrait
{
    public static void Process(string srcPath, string outputPath)
    {
        using (Bitmap src = new Bitmap(srcPath))
        {
            int sw = src.Width;   // 1200
            int sh = src.Height;  // 900

            // 1. Precise crop centered on Suzuki-san (completely cuts out bookshelf on left, other residents on right)
            int cropX = (int)(sw * 0.23); // 276
            int cropY = (int)(sh * 0.08); // 72
            int cropW = (int)(sw * 0.54); // 648
            int cropH = (int)(sh * 0.90); // 810

            int outW = 800;
            int outH = 1000;

            Bitmap canvas = new Bitmap(outW, outH, PixelFormat.Format32bppArgb);
            using (Graphics g = Graphics.FromImage(canvas))
            {
                g.SmoothingMode = SmoothingMode.HighQuality;
                g.InterpolationMode = InterpolationMode.HighQualityBicubic;
                g.PixelOffsetMode = PixelOffsetMode.HighQuality;

                // A. Draw base calm nursing home bedroom background (soft cream wall & wooden headboard)
                using (LinearGradientBrush wallBr = new LinearGradientBrush(
                    new Point(0, 0), new Point(0, (int)(outH * 0.40)),
                    Color.FromArgb(232, 226, 216),
                    Color.FromArgb(215, 208, 198)))
                {
                    g.FillRectangle(wallBr, 0, 0, outW, (int)(outH * 0.40));
                }

                // Authentic wood grain headboard
                using (SolidBrush hbBr = new SolidBrush(Color.FromArgb(120, 78, 45)))
                {
                    g.FillRectangle(hbBr, 0, (int)(outH * 0.12), outW, (int)(outH * 0.30));
                }
                using (Pen woodPen1 = new Pen(Color.FromArgb(90, 55, 30), 3))
                using (Pen woodPen2 = new Pen(Color.FromArgb(155, 105, 68), 1.5f))
                {
                    for (int y = (int)(outH * 0.16); y < (int)(outH * 0.42); y += 42)
                    {
                        g.DrawLine(woodPen1, 0, y, outW, y);
                        g.DrawLine(woodPen2, 0, y + 2, outW, y + 2);
                    }
                }

                // B. Large Soft Hospital/Care Pillow directly behind Suzuki's head
                using (LinearGradientBrush pillowBr = new LinearGradientBrush(
                    new Point(outW / 2, (int)(outH * 0.08)),
                    new Point(outW / 2, (int)(outH * 0.42)),
                    Color.FromArgb(254, 252, 248),
                    Color.FromArgb(228, 222, 214)))
                {
                    g.FillEllipse(pillowBr, (int)(outW * 0.12), (int)(outH * 0.08), (int)(outW * 0.76), (int)(outH * 0.34));
                }
                using (SolidBrush pHi = new SolidBrush(Color.FromArgb(80, 255, 255, 255)))
                {
                    g.FillEllipse(pHi, (int)(outW * 0.20), (int)(outH * 0.11), (int)(outW * 0.60), (int)(outH * 0.26));
                }

                // C. Scale cropped Suzuki to fit canvas
                Bitmap suzukiLayer = new Bitmap(outW, outH, PixelFormat.Format32bppArgb);
                using (Graphics sg = Graphics.FromImage(suzukiLayer))
                {
                    sg.InterpolationMode = InterpolationMode.HighQualityBicubic;
                    sg.DrawImage(src, new Rectangle(0, 0, outW, outH), cropX, cropY, cropW, cropH, GraphicsUnit.Pixel);
                }

                // D. Apply soft edge mask to Suzuki layer:
                // Suzuki's body (hair, face, neck, vest, hands, blanket) is 100% SOLID.
                // The outer background (top left plants, top right living room) smoothly transitions to 0, revealing pillow and headboard!
                BitmapData data = suzukiLayer.LockBits(
                    new Rectangle(0, 0, outW, outH),
                    ImageLockMode.ReadWrite,
                    PixelFormat.Format32bppArgb);

                int stride = data.Stride;
                IntPtr ptr = data.Scan0;
                byte[] bytes = new byte[Math.Abs(stride) * outH];
                System.Runtime.InteropServices.Marshal.Copy(ptr, bytes, 0, bytes.Length);

                double headCenterX = outW * 0.50;
                double headCenterY = outH * 0.25;
                double headRx = outW * 0.23;
                double headRy = outH * 0.21;

                for (int y = 0; y < outH; y++)
                {
                    double ny = (double)y / outH;
                    for (int x = 0; x < outW; x++)
                    {
                        int idx = y * stride + x * 4;

                        if (ny < 0.45)
                        {
                            // Upper region (head, hair, and background)
                            double dx = (x - headCenterX) / headRx;
                            double dy = (y - headCenterY) / headRy;
                            double dist = Math.Sqrt(dx * dx + dy * dy);

                            if (dist > 1.0)
                            {
                                bytes[idx + 3] = 0; // reveal pillow and headboard behind
                            }
                            else if (dist > 0.82)
                            {
                                double fade = (1.0 - dist) / 0.18;
                                double alpha = Math.Sin(fade * Math.PI * 0.5);
                                bytes[idx + 3] = (byte)(bytes[idx + 3] * alpha);
                            }
                        }
                        else
                        {
                            // Lower region (shoulders, vest, hands, warm blanket) - keep 100% solid
                            // Only fade extreme left/right edges softly
                            double nx = (double)x / outW;
                            double edgeDist = Math.Min(nx, 1.0 - nx) / 0.05;
                            if (edgeDist < 1.0)
                            {
                                double alpha = Math.Sin(edgeDist * Math.PI * 0.5);
                                bytes[idx + 3] = (byte)(bytes[idx + 3] * alpha);
                            }
                        }
                    }
                }

                System.Runtime.InteropServices.Marshal.Copy(bytes, 0, ptr, bytes.Length);
                suzukiLayer.UnlockBits(data);

                // Draw Suzuki comfortably on bed
                g.DrawImage(suzukiLayer, 0, 0);
                suzukiLayer.Dispose();

                // E. Bedside Safety Guard Rail (subtle foreground cue in warm metallic/wood tone)
                using (SolidBrush railBr = new SolidBrush(Color.FromArgb(185, 195, 188, 178)))
                using (Pen railHi = new Pen(Color.FromArgb(220, 245, 240, 230), 1.5f))
                using (Pen railDark = new Pen(Color.FromArgb(190, 110, 100, 90), 1.5f))
                {
                    // Bottom rail
                    g.FillRectangle(railBr, 30, outH - 50, outW - 60, 14);
                    g.DrawLine(railHi, 30, outH - 50, outW - 30, outH - 50);
                    g.DrawLine(railDark, 30, outH - 36, outW - 30, outH - 36);

                    // Angled side guard
                    g.FillRectangle(railBr, 40, (int)(outH * 0.68), 240, 12);
                    g.DrawLine(railHi, 40, (int)(outH * 0.68), 280, (int)(outH * 0.68));
                    g.DrawLine(railDark, 40, (int)(outH * 0.68) + 12, 280, (int)(outH * 0.68) + 12);

                    for (int bx = 65; bx <= 260; bx += 38)
                    {
                        g.FillRectangle(railBr, bx, (int)(outH * 0.68) + 12, 8, outH - (int)(outH * 0.68) - 62);
                        g.DrawLine(railHi, bx, (int)(outH * 0.68) + 12, bx, outH - 50);
                        g.DrawLine(railDark, bx + 8, (int)(outH * 0.68) + 12, bx + 8, outH - 50);
                    }
                }

                // F. Gentle Warm Interior Care Lighting
                using (SolidBrush warmGlow = new SolidBrush(Color.FromArgb(10, 255, 235, 205)))
                {
                    g.FillRectangle(warmGlow, 0, 0, outW, outH);
                }
            }

            // Save high quality JPEG
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

Write-Host "Creating authentic bed rest portrait for Suzuki-san..." -ForegroundColor Cyan
[PerfectSuzukiPortrait]::Process($backupFile, $targetFile)

$fi = Get-Item $targetFile
Write-Host "Generated $targetFile ($($fi.Length) bytes) successfully!" -ForegroundColor Green

# Run verify_all.ps1
$verifyScript = Join-Path $baseDir "tests\verify_all.ps1"
if (Test-Path $verifyScript) {
    Write-Host "`nRunning comprehensive verification tests..." -ForegroundColor Yellow
    & powershell.exe -ExecutionPolicy Bypass -File $verifyScript
}
