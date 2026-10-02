# High Quality Photo Synthesizer for Suzuki Bed Rest (Pure ASCII)
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

public class BedPhotoGenerator
{
    public static void Generate(string suzukiPath, string outputPath)
    {
        int W = 900;
        int H = 675;

        Bitmap canvas = new Bitmap(W, H, PixelFormat.Format32bppArgb);
        using (Graphics g = Graphics.FromImage(canvas))
        {
            g.SmoothingMode = SmoothingMode.HighQuality;
            g.InterpolationMode = InterpolationMode.HighQualityBicubic;
            g.PixelOffsetMode = PixelOffsetMode.HighQuality;

            // 1. Warm room interior wall
            using (LinearGradientBrush wallBrush = new LinearGradientBrush(
                new Point(0, 0), new Point(0, H),
                Color.FromArgb(238, 233, 224),
                Color.FromArgb(215, 208, 196)))
            {
                g.FillRectangle(wallBrush, 0, 0, W, H);
            }

            // 2. Real wood grain headboard
            using (SolidBrush woodBase = new SolidBrush(Color.FromArgb(130, 85, 50)))
            using (Pen woodDark = new Pen(Color.FromArgb(95, 60, 32), 2))
            using (Pen woodLight = new Pen(Color.FromArgb(165, 115, 75), 1))
            {
                g.FillRectangle(woodBase, 40, 60, W - 80, 280);
                for (int y = 80; y < 330; y += 38)
                {
                    g.DrawLine(woodDark, 40, y, W - 40, y);
                    g.DrawLine(woodLight, 40, y + 2, W - 40, y + 2);
                }
            }

            // 3. Elevated Gatch-up Backrest (30-35 deg angle)
            Point[] backrest = new Point[] {
                new Point(90, 160),
                new Point(W - 90, 160),
                new Point(W - 130, 440),
                new Point(130, 440)
            };
            using (LinearGradientBrush backBrush = new LinearGradientBrush(
                new Point(0, 160), new Point(0, 440),
                Color.FromArgb(245, 242, 236),
                Color.FromArgb(228, 222, 214)))
            {
                g.FillPolygon(backBrush, backrest);
            }

            // 4. Large Fluffy Hospital / Nursing Pillow
            // Outer shadow
            using (SolidBrush shadowBr = new SolidBrush(Color.FromArgb(70, 140, 135, 125)))
            {
                g.FillEllipse(shadowBr, 240, 155, 420, 250);
            }
            // Pillow body
            using (LinearGradientBrush pillowBr = new LinearGradientBrush(
                new Point(300, 140), new Point(300, 380),
                Color.FromArgb(255, 254, 250),
                Color.FromArgb(235, 232, 225)))
            {
                g.FillEllipse(pillowBr, 250, 140, 400, 240);
            }
            // Pillow center highlight
            using (SolidBrush pillowHi = new SolidBrush(Color.FromArgb(100, 255, 255, 255)))
            {
                g.FillEllipse(pillowHi, 300, 170, 300, 170);
            }

            // 5. Suzuki-san Face Extraction & Seamless Feathered Blend onto Pillow
            if (System.IO.File.Exists(suzukiPath))
            {
                using (Bitmap src = new Bitmap(suzukiPath))
                {
                    int sw = src.Width;
                    int sh = src.Height;

                    // Crop face area precisely (avoid outer room background)
                    int fx = (int)(sw * 0.40);
                    int fy = (int)(sh * 0.13);
                    int fw = (int)(sw * 0.20);
                    int fh = (int)(sh * 0.32);

                    Bitmap faceBmp = new Bitmap(fw, fh, PixelFormat.Format32bppArgb);
                    using (Graphics fg = Graphics.FromImage(faceBmp))
                    {
                        fg.DrawImage(src, new Rectangle(0, 0, fw, fh), fx, fy, fw, fh, GraphicsUnit.Pixel);
                    }

                    // Create smoothly feathered face on pillow
                    int destW = 270;
                    int destH = (int)(destW * ((double)fh / fw));
                    int destX = (W - destW) / 2;
                    int destY = 150;

                    Bitmap scaledFace = new Bitmap(destW, destH, PixelFormat.Format32bppArgb);
                    using (Graphics sg = Graphics.FromImage(scaledFace))
                    {
                        sg.InterpolationMode = InterpolationMode.HighQualityBicubic;
                        sg.DrawImage(faceBmp, 0, 0, destW, destH);
                    }
                    faceBmp.Dispose();

                    // Apply soft radial alpha falloff to face
                    BitmapData data = scaledFace.LockBits(
                        new Rectangle(0, 0, destW, destH),
                        ImageLockMode.ReadWrite,
                        PixelFormat.Format32bppArgb);

                    int stride = data.Stride;
                    IntPtr ptr = data.Scan0;
                    byte[] bytes = new byte[Math.Abs(stride) * destH];
                    System.Runtime.InteropServices.Marshal.Copy(ptr, bytes, 0, bytes.Length);

                    double cx = destW * 0.50;
                    double cy = destH * 0.48;
                    double rx = destW * 0.44;
                    double ry = destH * 0.48;

                    for (int y = 0; y < destH; y++)
                    {
                        for (int x = 0; x < destW; x++)
                        {
                            int idx = y * stride + x * 4;
                            double dx = (x - cx) / rx;
                            double dy = (y - cy) / ry;
                            double dist = Math.Sqrt(dx * dx + dy * dy);

                            if (dist > 1.0)
                            {
                                bytes[idx + 3] = 0;
                            }
                            else if (dist > 0.65)
                            {
                                double fade = (1.0 - dist) / 0.35;
                                double alpha = Math.Sin(fade * Math.PI * 0.5);
                                bytes[idx + 3] = (byte)(bytes[idx + 3] * alpha);
                            }
                        }
                    }

                    System.Runtime.InteropServices.Marshal.Copy(bytes, 0, ptr, bytes.Length);
                    scaledFace.UnlockBits(data);

                    g.DrawImage(scaledFace, destX, destY);
                    scaledFace.Dispose();

                    // 6. Warm Real Blanket / Futon from the original knitted blanket texture
                    // Sample blanket from Suzuki's knitted lap blanket (bottom center of original image)
                    int bx = (int)(sw * 0.30);
                    int by = (int)(sh * 0.82);
                    int bw = (int)(sw * 0.40);
                    int bh = (int)(sh * 0.16);

                    Bitmap blanketBmp = new Bitmap(bw, bh, PixelFormat.Format32bppArgb);
                    using (Graphics bg = Graphics.FromImage(blanketBmp))
                    {
                        bg.DrawImage(src, new Rectangle(0, 0, bw, bh), bx, by, bw, bh, GraphicsUnit.Pixel);
                    }

                    // Quilt Texture Brush
                    using (TextureBrush quiltBr = new TextureBrush(blanketBmp, WrapMode.TileFlipXY))
                    {
                        quiltBr.ScaleTransform(1.8f, 1.8f);

                        // Body futon contour tucking up to shoulders and chest
                        GraphicsPath futonPath = new GraphicsPath();
                        futonPath.AddBezier(
                            new Point(40, 410),
                            new Point(220, 345),
                            new Point(W - 220, 345),
                            new Point(W - 40, 410)
                        );
                        futonPath.AddLine(W - 40, 410, W, H);
                        futonPath.AddLine(W, H, 0, H);
                        futonPath.AddLine(0, 410, 40, 410);

                        g.FillPath(quiltBr, futonPath);

                        // Folded collar of the futon / blanket (warm rolled edge)
                        using (LinearGradientBrush collarBrush = new LinearGradientBrush(
                            new Point(0, 340), new Point(0, 385),
                            Color.FromArgb(240, 235, 226),
                            Color.FromArgb(205, 195, 180)))
                        {
                            GraphicsPath collarPath = new GraphicsPath();
                            collarPath.AddBezier(
                                new Point(140, 375),
                                new Point(320, 335),
                                new Point(W - 320, 335),
                                new Point(W - 140, 375)
                            );
                            collarPath.AddBezier(
                                new Point(W - 140, 395),
                                new Point(W - 320, 355),
                                new Point(320, 355),
                                new Point(140, 395)
                            );
                            collarPath.CloseFigure();
                            g.FillPath(collarBrush, collarPath);

                            using (Pen collarPen = new Pen(Color.FromArgb(120, 160, 150, 140), 2))
                            {
                                g.DrawPath(collarPen, collarPath);
                            }
                        }

                        // Futon soft drape shadow
                        using (Pen drapePen = new Pen(Color.FromArgb(50, 80, 70, 60), 4))
                        {
                            g.DrawBezier(drapePen,
                                new Point(280, 390), new Point(260, 520),
                                new Point(240, 600), new Point(220, H));
                            g.DrawBezier(drapePen,
                                new Point(W - 280, 390), new Point(W - 260, 520),
                                new Point(W - 240, 600), new Point(W - 220, H));
                        }

                        futonPath.Dispose();
                    }
                    blanketBmp.Dispose();
                }
            }

            // 7. Nursing Bed Safety Side Rail (subtle foreground cue)
            using (SolidBrush railBr = new SolidBrush(Color.FromArgb(190, 185, 175)))
            using (Pen railHi = new Pen(Color.FromArgb(235, 232, 225), 2))
            using (Pen railDark = new Pen(Color.FromArgb(120, 115, 105), 1))
            {
                // Bottom rail
                g.FillRectangle(railBr, 40, 560, W - 80, 14);
                g.DrawLine(railHi, 40, 560, W - 40, 560);
                g.DrawLine(railDark, 40, 574, W - 40, 574);

                // Side rail angled upper section
                g.FillRectangle(railBr, 60, 360, 260, 12);
                g.DrawLine(railHi, 60, 360, 320, 360);
                g.DrawLine(railDark, 60, 372, 320, 372);

                for (int rx = 90; rx <= 300; rx += 45)
                {
                    g.FillRectangle(railBr, rx, 372, 8, 188);
                    g.DrawLine(railHi, rx, 372, rx, 560);
                    g.DrawLine(railDark, rx + 8, 372, rx + 8, 560);
                }
            }

            // 8. Overall Gentle Atmosphere Tint (Warm afternoon rest)
            using (SolidBrush warmTint = new SolidBrush(Color.FromArgb(18, 255, 230, 200)))
            {
                g.FillRectangle(warmTint, 0, 0, W, H);
            }
        }

        // Save as clean, high quality JPEG
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
        encParams.Param[0] = new EncoderParameter(Encoder.Quality, 93L);

        canvas.Save(outputPath, jpgEncoder, encParams);
        canvas.Dispose();
    }
}
"@

Add-Type -TypeDefinition $csharpCode -ReferencedAssemblies "System.Drawing.dll"

Write-Host "Synthesizing perfect bed rest photo for Suzuki-san..." -ForegroundColor Cyan
[BedPhotoGenerator]::Generate($backupFile, $targetFile)

$fi = Get-Item $targetFile
Write-Host "Generated $targetFile ($($fi.Length) bytes) successfully!" -ForegroundColor Green

# Run verify_all.ps1
$verifyScript = Join-Path $baseDir "tests\verify_all.ps1"
if (Test-Path $verifyScript) {
    Write-Host "`nRunning verification tests..." -ForegroundColor Yellow
    & powershell.exe -ExecutionPolicy Bypass -File $verifyScript
}
