# Final High Quality Suzuki Bed Resting Photo Generator (Pure ASCII)
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

public class FinalBedPhoto
{
    public static void Create(string suzukiPath, string roomPath, string outputPath)
    {
        int W = 1000;
        int H = 750;

        Bitmap canvas = new Bitmap(W, H, PixelFormat.Format32bppArgb);
        using (Graphics g = Graphics.FromImage(canvas))
        {
            g.SmoothingMode = SmoothingMode.HighQuality;
            g.InterpolationMode = InterpolationMode.HighQualityBicubic;
            g.PixelOffsetMode = PixelOffsetMode.HighQuality;

            // 1. Draw Real Japanese Care Room Background from tome_1.jpg
            if (System.IO.File.Exists(roomPath))
            {
                using (Bitmap roomBmp = new Bitmap(roomPath))
                {
                    // Use the top part containing real wooden headboard, wallpaper, lighting
                    Rectangle srcRect = new Rectangle(0, 0, roomBmp.Width, (int)(roomBmp.Height * 0.70));
                    Rectangle destRect = new Rectangle(0, 0, W, (int)(H * 0.65));
                    g.DrawImage(roomBmp, destRect, srcRect, GraphicsUnit.Pixel);
                }
            }
            else
            {
                using (SolidBrush bg = new SolidBrush(Color.FromArgb(220, 212, 200)))
                {
                    g.FillRectangle(bg, 0, 0, W, H);
                }
            }

            // 2. Comfortable Gatch-up Backrest & Large Hospital Pillow
            // Soft shadow behind elevated backrest
            using (SolidBrush backShadow = new SolidBrush(Color.FromArgb(120, 40, 35, 30)))
            {
                g.FillPolygon(backShadow, new Point[] {
                    new Point(140, 190), new Point(W - 140, 190),
                    new Point(W - 180, 480), new Point(180, 480)
                });
            }

            // Pillow Body (soft white/ivory comfortable medical pillow)
            using (LinearGradientBrush pillowGrad = new LinearGradientBrush(
                new Point(W / 2, 170), new Point(W / 2, 450),
                Color.FromArgb(252, 250, 246),
                Color.FromArgb(228, 224, 216)))
            {
                g.FillEllipse(pillowGrad, 220, 170, 560, 290);
            }
            // Pillow indent / highlight
            using (SolidBrush pillowHi = new SolidBrush(Color.FromArgb(90, 255, 255, 255)))
            {
                g.FillEllipse(pillowHi, 280, 190, 440, 220);
            }

            // 3. Extract Suzuki-san Face and Blend Naturally into Pillow (Relaxed Fowler Position)
            if (System.IO.File.Exists(suzukiPath))
            {
                using (Bitmap src = new Bitmap(suzukiPath))
                {
                    int sw = src.Width;
                    int sh = src.Height;

                    // Tight crop focusing ONLY on face, white hair, and neck (no living room background)
                    int fx = (int)(sw * 0.42);
                    int fy = (int)(sh * 0.14);
                    int fw = (int)(sw * 0.18);
                    int fh = (int)(sh * 0.28);

                    Bitmap faceBmp = new Bitmap(fw, fh, PixelFormat.Format32bppArgb);
                    using (Graphics fg = Graphics.FromImage(faceBmp))
                    {
                        fg.InterpolationMode = InterpolationMode.HighQualityBicubic;
                        fg.DrawImage(src, new Rectangle(0, 0, fw, fh), fx, fy, fw, fh, GraphicsUnit.Pixel);
                    }

                    // Destination on pillow: relaxed head position, slightly reclined
                    int destW = 290;
                    int destH = (int)(destW * ((double)fh / fw));
                    int destX = (W - destW) / 2 + 5;
                    int destY = 175;

                    Bitmap scaledFace = new Bitmap(destW, destH, PixelFormat.Format32bppArgb);
                    using (Graphics sg = Graphics.FromImage(scaledFace))
                    {
                        sg.InterpolationMode = InterpolationMode.HighQualityBicubic;
                        sg.DrawImage(faceBmp, 0, 0, destW, destH);
                    }
                    faceBmp.Dispose();

                    // Smooth radial alpha feathering to blend seamlessly with pillow
                    BitmapData data = scaledFace.LockBits(
                        new Rectangle(0, 0, destW, destH),
                        ImageLockMode.ReadWrite,
                        PixelFormat.Format32bppArgb);

                    int stride = data.Stride;
                    IntPtr ptr = data.Scan0;
                    byte[] bytes = new byte[Math.Abs(stride) * destH];
                    System.Runtime.InteropServices.Marshal.Copy(ptr, bytes, 0, bytes.Length);

                    double cx = destW * 0.50;
                    double cy = destH * 0.46;
                    double rx = destW * 0.42;
                    double ry = destH * 0.46;

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
                            else if (dist > 0.60)
                            {
                                double fade = (1.0 - dist) / 0.40;
                                double alpha = Math.Sin(fade * Math.PI * 0.5);
                                bytes[idx + 3] = (byte)(bytes[idx + 3] * alpha);
                            }
                        }
                    }

                    System.Runtime.InteropServices.Marshal.Copy(bytes, 0, ptr, bytes.Length);
                    scaledFace.UnlockBits(data);

                    g.DrawImage(scaledFace, destX, destY);
                    scaledFace.Dispose();
                }
            }

            // 4. Warm, Clean Hospital Quilt / Futon (Tucked gently under chin/shoulders)
            // Futon body filling bottom of image
            using (LinearGradientBrush futonBrush = new LinearGradientBrush(
                new Point(W / 2, 380), new Point(W / 2, H),
                Color.FromArgb(246, 243, 237),
                Color.FromArgb(218, 212, 202)))
            {
                GraphicsPath futonPath = new GraphicsPath();
                futonPath.AddBezier(
                    new Point(0, 430),
                    new Point(250, 385),
                    new Point(W - 250, 385),
                    new Point(W, 430)
                );
                futonPath.AddLine(W, 430, W, H);
                futonPath.AddLine(W, H, 0, H);
                futonPath.CloseFigure();

                g.FillPath(futonBrush, futonPath);

                // Futon fold / collar (rolled fabric edge resting across chest)
                using (LinearGradientBrush collarBrush = new LinearGradientBrush(
                    new Point(W / 2, 375), new Point(W / 2, 420),
                    Color.FromArgb(255, 254, 250),
                    Color.FromArgb(232, 226, 218)))
                {
                    GraphicsPath collarPath = new GraphicsPath();
                    collarPath.AddBezier(
                        new Point(80, 425),
                        new Point(300, 378),
                        new Point(W - 300, 378),
                        new Point(W - 80, 425)
                    );
                    collarPath.AddBezier(
                        new Point(W - 80, 445),
                        new Point(W - 300, 398),
                        new Point(300, 398),
                        new Point(80, 445)
                    );
                    collarPath.CloseFigure();

                    // Collar drop shadow
                    using (SolidBrush cShadow = new SolidBrush(Color.FromArgb(40, 60, 55, 50)))
                    {
                        Matrix tr = new Matrix();
                        tr.Translate(0, 4);
                        GraphicsPath shadowPath = (GraphicsPath)collarPath.Clone();
                        shadowPath.Transform(tr);
                        g.FillPath(cShadow, shadowPath);
                        shadowPath.Dispose();
                        tr.Dispose();
                    }

                    g.FillPath(collarBrush, collarPath);

                    using (Pen collarPen = new Pen(Color.FromArgb(180, 200, 195, 185), 1.5f))
                    {
                        g.DrawPath(collarPen, collarPath);
                    }
                    collarPath.Dispose();
                }

                // Natural soft fabric creases and folds
                using (Pen drapePen = new Pen(Color.FromArgb(35, 100, 90, 80), 5))
                {
                    drapePen.StartCap = LineCap.Round;
                    drapePen.EndCap = LineCap.Round;
                    g.DrawBezier(drapePen, new Point(240, 440), new Point(220, 560), new Point(190, 660), new Point(160, H));
                    g.DrawBezier(drapePen, new Point(W - 240, 440), new Point(W - 220, 560), new Point(W - 190, 660), new Point(W - 160, H));
                    g.DrawBezier(drapePen, new Point(W / 2, 450), new Point(W / 2 + 10, 580), new Point(W / 2 - 10, 680), new Point(W / 2, H));
                }

                futonPath.Dispose();
            }

            // 5. Nursing Bed Safety Side Rail (subtle foreground cue in warm wood/metallic finish)
            using (SolidBrush railBrush = new SolidBrush(Color.FromArgb(200, 190, 180)))
            using (Pen railPen = new Pen(Color.FromArgb(240, 235, 225), 1.5f))
            using (Pen railDark = new Pen(Color.FromArgb(130, 120, 110), 1.5f))
            {
                // Side rail top bar
                g.FillRectangle(railBrush, 50, 460, 280, 14);
                g.DrawLine(railPen, 50, 460, 330, 460);
                g.DrawLine(railDark, 50, 474, 330, 474);

                // Vertical slats
                for (int rx = 80; rx <= 300; rx += 45)
                {
                    g.FillRectangle(railBrush, rx, 474, 10, H - 474);
                    g.DrawLine(railPen, rx, 474, rx, H);
                    g.DrawLine(railDark, rx + 10, 474, rx + 10, H);
                }
            }

            // 6. Overall Atmosphere - Soft, Warm Care Room Lighting
            using (SolidBrush warmGlow = new SolidBrush(Color.FromArgb(14, 255, 235, 205)))
            {
                g.FillRectangle(warmGlow, 0, 0, W, H);
            }
        }

        // Save as clean JPEG (95% quality)
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
        encParams.Param[0] = new EncoderParameter(Encoder.Quality, 95L);

        canvas.Save(outputPath, jpgEncoder, encParams);
        canvas.Dispose();
    }
}
"@

Add-Type -TypeDefinition $csharpCode -ReferencedAssemblies "System.Drawing.dll"

Write-Host "Synthesizing authentic Japanese nursing room bed photo for Suzuki-san..." -ForegroundColor Cyan
[FinalBedPhoto]::Create($backupFile, $tomeFile, $targetFile)

$fi = Get-Item $targetFile
Write-Host "Generated $targetFile ($($fi.Length) bytes) successfully!" -ForegroundColor Green

# Run verify_all.ps1
$verifyScript = Join-Path $baseDir "tests\verify_all.ps1"
if (Test-Path $verifyScript) {
    Write-Host "`nRunning comprehensive verification tests..." -ForegroundColor Yellow
    & powershell.exe -ExecutionPolicy Bypass -File $verifyScript
}
