# Photorealistic Japanese Care Room Bed Resting Synthesizer (Pure ASCII)
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

public class RealBedSynthesizer
{
    public static void Synthesize(string suzukiPath, string roomPath, string outputPath)
    {
        if (!System.IO.File.Exists(roomPath) || !System.IO.File.Exists(suzukiPath))
        {
            throw new Exception("Source files do not exist");
        }

        using (Bitmap roomSrc = new Bitmap(roomPath))
        using (Bitmap suzukiSrc = new Bitmap(suzukiPath))
        {
            int W = roomSrc.Width;   // 800
            int H = roomSrc.Height;  // 533

            Bitmap canvas = new Bitmap(W, H, PixelFormat.Format32bppArgb);
            using (Graphics g = Graphics.FromImage(canvas))
            {
                g.SmoothingMode = SmoothingMode.HighQuality;
                g.InterpolationMode = InterpolationMode.HighQualityBicubic;
                g.PixelOffsetMode = PixelOffsetMode.HighQuality;

                // 1. Draw entire base room
                g.DrawImage(roomSrc, 0, 0, W, H);

                // 2. Clone clean wooden headboard from left (X: 20 to 280, Y: 100 to 220) to center (X: 300 to 580)
                // This cleanly covers Tome-san's hair and head behind the pillow
                Rectangle hbSrc = new Rectangle(40, 110, 240, 110);
                g.DrawImage(roomSrc, new Rectangle(300, 110, 260, 110), hbSrc, GraphicsUnit.Pixel);
                g.DrawImage(roomSrc, new Rectangle(480, 110, 160, 110), hbSrc, GraphicsUnit.Pixel);

                // 3. Create realistic comfortable hospital/care pillow
                // Sample real bed linen texture from bottom left (X: 40, Y: 360, W: 220, H: 140)
                Bitmap linenPatch = new Bitmap(220, 140, PixelFormat.Format32bppArgb);
                using (Graphics lg = Graphics.FromImage(linenPatch))
                {
                    lg.DrawImage(roomSrc, new Rectangle(0, 0, 220, 140), 40, 360, 220, 140, GraphicsUnit.Pixel);
                }

                // Draw pillow back shadow
                using (SolidBrush pShadow = new SolidBrush(Color.FromArgb(90, 50, 45, 40)))
                {
                    g.FillEllipse(pShadow, 220, 125, 360, 220);
                }

                // Pillow body using real linen texture
                using (TextureBrush linenBr = new TextureBrush(linenPatch, WrapMode.TileFlipXY))
                {
                    linenBr.ScaleTransform(1.2f, 1.2f);
                    g.FillEllipse(linenBr, 230, 115, 340, 210);

                    // Pillow soft highlight
                    using (SolidBrush pHi = new SolidBrush(Color.FromArgb(70, 255, 255, 255)))
                    {
                        g.FillEllipse(pHi, 260, 130, 280, 160);
                    }
                }

                // 4. Suzuki-san Face Extraction & Natural Blending into Pillow
                int sw = suzukiSrc.Width;
                int sh = suzukiSrc.Height;

                // Crop face tightly (forehead, white hair, eyes, nose, mouth, chin)
                int fx = (int)(sw * 0.42);
                int fy = (int)(sh * 0.13);
                int fw = (int)(sw * 0.18);
                int fh = (int)(sh * 0.28);

                Bitmap faceBmp = new Bitmap(fw, fh, PixelFormat.Format32bppArgb);
                using (Graphics fg = Graphics.FromImage(faceBmp))
                {
                    fg.InterpolationMode = InterpolationMode.HighQualityBicubic;
                    fg.DrawImage(suzukiSrc, new Rectangle(0, 0, fw, fh), fx, fy, fw, fh, GraphicsUnit.Pixel);
                }

                int destW = 195;
                int destH = (int)(destW * ((double)fh / fw));
                int destX = (W - destW) / 2 + 10;
                int destY = 120;

                Bitmap scaledFace = new Bitmap(destW, destH, PixelFormat.Format32bppArgb);
                using (Graphics sg = Graphics.FromImage(scaledFace))
                {
                    sg.InterpolationMode = InterpolationMode.HighQualityBicubic;
                    sg.DrawImage(faceBmp, 0, 0, destW, destH);
                }
                faceBmp.Dispose();

                // Smooth radial feathering
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

                // Head impression shadow on pillow
                using (SolidBrush headShadow = new SolidBrush(Color.FromArgb(50, 40, 35, 30)))
                {
                    g.FillEllipse(headShadow, destX - 10, destY + 10, destW + 20, destH);
                }

                g.DrawImage(scaledFace, destX, destY);
                scaledFace.Dispose();

                // 5. Warm Authentic Care Futon / Blanket using real quilted linen texture
                using (TextureBrush futonBr = new TextureBrush(linenPatch, WrapMode.TileFlipXY))
                {
                    futonBr.ScaleTransform(1.5f, 1.5f);

                    // Futon covering body from neck/chest down (Y: 280 to H)
                    GraphicsPath futonPath = new GraphicsPath();
                    futonPath.AddBezier(
                        new Point(0, 320),
                        new Point(180, 275),
                        new Point(W - 180, 275),
                        new Point(W, 320)
                    );
                    futonPath.AddLine(W, 320, W, H);
                    futonPath.AddLine(W, H, 0, H);
                    futonPath.CloseFigure();

                    // Subtle futon depth shadow
                    using (SolidBrush fShadow = new SolidBrush(Color.FromArgb(60, 40, 35, 30)))
                    {
                        Matrix tr = new Matrix();
                        tr.Translate(0, -5);
                        GraphicsPath sp = (GraphicsPath)futonPath.Clone();
                        sp.Transform(tr);
                        g.FillPath(fShadow, sp);
                        sp.Dispose();
                        tr.Dispose();
                    }

                    g.FillPath(futonBr, futonPath);

                    // Soft folded quilt collar (warm roll tucked across chest)
                    using (LinearGradientBrush collarBr = new LinearGradientBrush(
                        new Point(W / 2, 270), new Point(W / 2, 305),
                        Color.FromArgb(255, 253, 248),
                        Color.FromArgb(225, 218, 208)))
                    {
                        GraphicsPath collarPath = new GraphicsPath();
                        collarPath.AddBezier(
                            new Point(40, 315),
                            new Point(220, 270),
                            new Point(W - 220, 270),
                            new Point(W - 40, 315)
                        );
                        collarPath.AddBezier(
                            new Point(W - 40, 332),
                            new Point(W - 220, 287),
                            new Point(220, 287),
                            new Point(40, 332)
                        );
                        collarPath.CloseFigure();

                        g.FillPath(collarBr, collarPath);

                        using (Pen collarPen = new Pen(Color.FromArgb(140, 180, 172, 160), 1.5f))
                        {
                            g.DrawPath(collarPen, collarPath);
                        }
                        collarPath.Dispose();
                    }

                    // Soft fabric fold shading
                    using (Pen foldPen = new Pen(Color.FromArgb(30, 80, 70, 60), 4))
                    {
                        foldPen.StartCap = LineCap.Round;
                        foldPen.EndCap = LineCap.Round;
                        g.DrawBezier(foldPen, new Point(180, 310), new Point(160, 400), new Point(140, 470), new Point(120, H));
                        g.DrawBezier(foldPen, new Point(W - 180, 310), new Point(W - 160, 400), new Point(W - 140, 470), new Point(W - 120, H));
                        g.DrawBezier(foldPen, new Point(W / 2, 320), new Point(W / 2 + 15, 410), new Point(W / 2 - 10, 480), new Point(W / 2, H));
                    }

                    futonPath.Dispose();
                }
                linenPatch.Dispose();

                // 6. Nursing Bed Safety Side Rail (warm wood/metallic bedside guardrail)
                using (SolidBrush railBr = new SolidBrush(Color.FromArgb(195, 188, 178)))
                using (Pen railHi = new Pen(Color.FromArgb(240, 236, 228), 1.5f))
                using (Pen railDark = new Pen(Color.FromArgb(115, 108, 98), 1.5f))
                {
                    // Top rail bar
                    g.FillRectangle(railBr, 30, 330, 220, 11);
                    g.DrawLine(railHi, 30, 330, 250, 330);
                    g.DrawLine(railDark, 30, 341, 250, 341);

                    // Vertical safety slats
                    for (int sx = 55; sx <= 230; sx += 35)
                    {
                        g.FillRectangle(railBr, sx, 341, 8, H - 341);
                        g.DrawLine(railHi, sx, 341, sx, H);
                        g.DrawLine(railDark, sx + 8, 341, sx + 8, H);
                    }
                }

                // 7. Subtle Overall Room Light Warmth
                using (SolidBrush warmGlow = new SolidBrush(Color.FromArgb(12, 255, 235, 200)))
                {
                    g.FillRectangle(warmGlow, 0, 0, W, H);
                }
            }

            // Save as high-quality JPEG
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

Write-Host "Creating photorealistic bed resting scene for Suzuki-san..." -ForegroundColor Cyan
[RealBedSynthesizer]::Synthesize($backupFile, $tomeFile, $targetFile)

$fi = Get-Item $targetFile
Write-Host "Generated $targetFile ($($fi.Length) bytes) successfully!" -ForegroundColor Green

# Run verify_all.ps1
$verifyScript = Join-Path $baseDir "tests\verify_all.ps1"
if (Test-Path $verifyScript) {
    Write-Host "`nRunning verification tests..." -ForegroundColor Yellow
    & powershell.exe -ExecutionPolicy Bypass -File $verifyScript
}
