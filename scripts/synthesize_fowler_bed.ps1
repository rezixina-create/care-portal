# Synthesize Fowler Bed Photo for Suzuki-san (Pure ASCII)
$ErrorActionPreference = "Stop"

$baseDir = Split-Path -Parent $PSScriptRoot
$destDir = Join-Path $baseDir "data\photos\personal"
$targetFile = Join-Path $destDir "resident_suzuki_snap.jpg"
$backupFile = Join-Path $destDir "resident_suzuki_snap_backup.jpg"
$semiFowlerFile = Join-Path $baseDir "tests\candidates\semi_fowler.jpg"

$csharpCode = @"
using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;

public class FowlerBedSynthesizer
{
    public static void Create(string fowlerPath, string suzukiPath, string outputPath)
    {
        using (Bitmap fowlerSrc = new Bitmap(fowlerPath))
        using (Bitmap suzukiSrc = new Bitmap(suzukiPath))
        {
            // Scale up fowler base image to high-res (900x600)
            int W = 900;
            int H = 600;

            Bitmap canvas = new Bitmap(W, H, PixelFormat.Format32bppArgb);
            using (Graphics g = Graphics.FromImage(canvas))
            {
                g.SmoothingMode = SmoothingMode.HighQuality;
                g.InterpolationMode = InterpolationMode.HighQualityBicubic;
                g.PixelOffsetMode = PixelOffsetMode.HighQuality;

                // 1. Draw scaled real nursing bed in Semi-Fowler's position (30 deg gatch-up)
                g.DrawImage(fowlerSrc, 0, 0, W, H);

                // 2. Head replacement: Suzuki-san (peaceful resting profile with white hair)
                // In fowler image: head is around X: 120-220, Y: 230-310 (scaled coords)
                int sw = suzukiSrc.Width;
                int sh = suzukiSrc.Height;

                // Crop Suzuki face tightly (white hair, peaceful smile/eyes, ear)
                int fx = (int)(sw * 0.42);
                int fy = (int)(sh * 0.12);
                int fw = (int)(sw * 0.22);
                int fh = (int)(sw * 0.28);

                Bitmap faceBmp = new Bitmap(fw, fh, PixelFormat.Format32bppArgb);
                using (Graphics fg = Graphics.FromImage(faceBmp))
                {
                    fg.InterpolationMode = InterpolationMode.HighQualityBicubic;
                    fg.DrawImage(suzukiSrc, new Rectangle(0, 0, fw, fh), fx, fy, fw, fh, GraphicsUnit.Pixel);
                }

                // Rotate face ~20 degrees to recline naturally on the 30-deg elevated pillow
                int hw = 100;
                int hh = (int)(hw * ((double)fh / fw));
                Bitmap headScaled = new Bitmap(hw, hh, PixelFormat.Format32bppArgb);
                using (Graphics hg = Graphics.FromImage(headScaled))
                {
                    hg.InterpolationMode = InterpolationMode.HighQualityBicubic;
                    hg.DrawImage(faceBmp, 0, 0, hw, hh);
                }
                faceBmp.Dispose();

                // Rotate
                Bitmap headRotated = new Bitmap(hw + 40, hh + 40, PixelFormat.Format32bppArgb);
                using (Graphics rg = Graphics.FromImage(headRotated))
                {
                    rg.InterpolationMode = InterpolationMode.HighQualityBicubic;
                    rg.TranslateTransform((hw + 40) / 2, (hh + 40) / 2);
                    rg.RotateTransform(15);
                    rg.DrawImage(headScaled, -hw / 2, -hh / 2);
                }
                headScaled.Dispose();

                // Soft feather on head
                BitmapData hdata = headRotated.LockBits(
                    new Rectangle(0, 0, headRotated.Width, headRotated.Height),
                    ImageLockMode.ReadWrite,
                    PixelFormat.Format32bppArgb);

                int hstride = hdata.Stride;
                IntPtr hptr = hdata.Scan0;
                byte[] hbytes = new byte[Math.Abs(hstride) * headRotated.Height];
                System.Runtime.InteropServices.Marshal.Copy(hptr, hbytes, 0, hbytes.Length);

                double hcx = headRotated.Width * 0.50;
                double hcy = headRotated.Height * 0.50;
                double hrx = headRotated.Width * 0.40;
                double hry = headRotated.Height * 0.42;

                for (int y = 0; y < headRotated.Height; y++)
                {
                    for (int x = 0; x < headRotated.Width; x++)
                    {
                        int idx = y * hstride + x * 4;
                        double dx = (x - hcx) / hrx;
                        double dy = (y - hcy) / hry;
                        double d = Math.Sqrt(dx * dx + dy * dy);
                        if (d > 1.0) {
                            hbytes[idx + 3] = 0;
                        } else if (d > 0.70) {
                            double fade = (1.0 - d) / 0.30;
                            hbytes[idx + 3] = (byte)(hbytes[idx + 3] * Math.Sin(fade * Math.PI * 0.5));
                        }
                    }
                }
                System.Runtime.InteropServices.Marshal.Copy(hbytes, 0, hptr, hbytes.Length);
                headRotated.UnlockBits(hdata);

                // Place Suzuki head on pillow
                g.DrawImage(headRotated, 120, 220);
                headRotated.Dispose();

                // 3. Warm Quilted Blanket covering body completely (covers red suit and bare feet)
                // From chest (X: 250, Y: 300) extending all the way down the bed to footboard (X: 820, Y: 430)
                using (LinearGradientBrush quiltBr = new LinearGradientBrush(
                    new Point(250, 280), new Point(820, 440),
                    Color.FromArgb(248, 245, 238),
                    Color.FromArgb(220, 215, 204)))
                {
                    GraphicsPath quiltPath = new GraphicsPath();
                    // Top folded edge across chest
                    quiltPath.AddBezier(
                        new Point(245, 335),
                        new Point(290, 305),
                        new Point(340, 310),
                        new Point(420, 325)
                    );
                    // Line down to foot of bed covering feet
                    quiltPath.AddBezier(
                        new Point(420, 325),
                        new Point(580, 330),
                        new Point(740, 340),
                        new Point(815, 380)
                    );
                    // Tucking under footboard
                    quiltPath.AddLine(815, 380, 815, 435);
                    // Bottom edge along mattress
                    quiltPath.AddBezier(
                        new Point(815, 435),
                        new Point(680, 420),
                        new Point(480, 400),
                        new Point(280, 395)
                    );
                    quiltPath.CloseFigure();

                    // Subtle shadow underneath quilt on mattress
                    using (SolidBrush qShadow = new SolidBrush(Color.FromArgb(70, 40, 35, 30)))
                    {
                        Matrix sm = new Matrix();
                        sm.Translate(0, 4);
                        GraphicsPath sp = (GraphicsPath)quiltPath.Clone();
                        sp.Transform(sm);
                        g.FillPath(qShadow, sp);
                        sp.Dispose();
                        sm.Dispose();
                    }

                    g.FillPath(quiltBr, quiltPath);

                    // Folded rolled collar at chest
                    using (LinearGradientBrush rollBr = new LinearGradientBrush(
                        new Point(245, 305), new Point(420, 340),
                        Color.FromArgb(255, 254, 250),
                        Color.FromArgb(232, 226, 218)))
                    {
                        GraphicsPath rollPath = new GraphicsPath();
                        rollPath.AddBezier(
                            new Point(240, 330), new Point(290, 300),
                            new Point(340, 305), new Point(415, 320));
                        rollPath.AddBezier(
                            new Point(415, 332), new Point(340, 317),
                            new Point(290, 312), new Point(240, 342));
                        rollPath.CloseFigure();

                        g.FillPath(rollBr, rollPath);

                        using (Pen rollPen = new Pen(Color.FromArgb(160, 190, 185, 175), 1.2f))
                        {
                            g.DrawPath(rollPen, rollPath);
                        }
                        rollPath.Dispose();
                    }

                    // Soft fabric creases along the bed
                    using (Pen creasePen = new Pen(Color.FromArgb(40, 90, 85, 75), 2.5f))
                    {
                        g.DrawBezier(creasePen, new Point(360, 320), new Point(480, 340), new Point(620, 355), new Point(780, 385));
                        g.DrawBezier(creasePen, new Point(340, 350), new Point(460, 365), new Point(600, 380), new Point(760, 410));
                    }

                    quiltPath.Dispose();
                }

                // 4. Redraw Safety Bed Rail (it sits in front of the mattress and blanket)
                // Real nursing bed side rail at X: 140 to 480
                using (SolidBrush railBr = new SolidBrush(Color.FromArgb(215, 185, 178, 168)))
                using (Pen railHi = new Pen(Color.FromArgb(240, 235, 228), 1.5f))
                using (Pen railDark = new Pen(Color.FromArgb(110, 100, 90), 1.5f))
                {
                    // Angled rail top bar (matches the 30-deg backrest angle!)
                    GraphicsPath railBar = new GraphicsPath();
                    railBar.AddLine(140, 320, 470, 320);
                    railBar.AddLine(470, 334, 140, 334);
                    railBar.CloseFigure();

                    g.FillPath(railBr, railBar);
                    g.DrawLine(railHi, 140, 320, 470, 320);
                    g.DrawLine(railDark, 140, 334, 470, 334);

                    // Upright slats
                    for (int rx = 180; rx <= 440; rx += 52)
                    {
                        g.FillRectangle(railBr, rx, 334, 10, 80);
                        g.DrawLine(railHi, rx, 334, rx, 414);
                        g.DrawLine(railDark, rx + 10, 334, rx + 10, 414);
                    }
                    railBar.Dispose();
                }

                // 5. Overall Warm Care Atmosphere
                using (SolidBrush warmGlow = new SolidBrush(Color.FromArgb(12, 255, 235, 205)))
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

Write-Host "Synthesizing authentic 30-deg Gatch-up bed resting photo for Suzuki-san..." -ForegroundColor Cyan
[FowlerBedSynthesizer]::Create($semiFowlerFile, $backupFile, $targetFile)

$fi = Get-Item $targetFile
Write-Host "Generated $targetFile ($($fi.Length) bytes) successfully!" -ForegroundColor Green

# Run verify_all.ps1
$verifyScript = Join-Path $baseDir "tests\verify_all.ps1"
if (Test-Path $verifyScript) {
    Write-Host "`nRunning comprehensive verification tests..." -ForegroundColor Yellow
    & powershell.exe -ExecutionPolicy Bypass -File $verifyScript
}
