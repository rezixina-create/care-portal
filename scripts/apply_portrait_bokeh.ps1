# Apply Professional Portrait Bokeh Effect for Suzuki-san (Pure ASCII)
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

public class PortraitBokeh
{
    public static void Apply(string srcPath, string outputPath)
    {
        using (Bitmap src = new Bitmap(srcPath))
        {
            int sw = src.Width;
            int sh = src.Height;

            // 1. Precise crop centered on Suzuki
            int cropX = (int)(sw * 0.28);
            int cropY = (int)(sh * 0.08);
            int cropW = (int)(sw * 0.44);
            int cropH = (int)(sh * 0.88);

            int outW = 800;
            int outH = 1000;

            Bitmap baseImg = new Bitmap(outW, outH, PixelFormat.Format32bppArgb);
            using (Graphics g = Graphics.FromImage(baseImg))
            {
                g.InterpolationMode = InterpolationMode.HighQualityBicubic;
                g.DrawImage(src, new Rectangle(0, 0, outW, outH), cropX, cropY, cropW, cropH, GraphicsUnit.Pixel);
            }

            // 2. Create heavy optical bokeh blur for background (simulating creamy F/1.2 lens)
            int blurW = outW / 24;
            int blurH = outH / 24;
            Bitmap small = new Bitmap(blurW, blurH, PixelFormat.Format32bppArgb);
            using (Graphics sg = Graphics.FromImage(small))
            {
                sg.InterpolationMode = InterpolationMode.Bilinear;
                sg.DrawImage(baseImg, 0, 0, blurW, blurH);
            }

            Bitmap bokeh = new Bitmap(outW, outH, PixelFormat.Format32bppArgb);
            using (Graphics bg = Graphics.FromImage(bokeh))
            {
                bg.InterpolationMode = InterpolationMode.HighQualityBicubic;
                bg.DrawImage(small, 0, 0, outW, outH);
            }
            small.Dispose();

            // 3. Seamless 2D Capsule Depth of Field: Suzuki is 100% sharp; background melts into pure warm bokeh
            Bitmap finalBmp = new Bitmap(outW, outH, PixelFormat.Format32bppArgb);
            BitmapData baseData = baseImg.LockBits(new Rectangle(0, 0, outW, outH), ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
            BitmapData bokehData = bokeh.LockBits(new Rectangle(0, 0, outW, outH), ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
            BitmapData finalData = finalBmp.LockBits(new Rectangle(0, 0, outW, outH), ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);

            int stride = baseData.Stride;
            byte[] baseBytes = new byte[Math.Abs(stride) * outH];
            byte[] bokehBytes = new byte[Math.Abs(stride) * outH];
            byte[] finalBytes = new byte[Math.Abs(stride) * outH];

            System.Runtime.InteropServices.Marshal.Copy(baseData.Scan0, baseBytes, 0, baseBytes.Length);
            System.Runtime.InteropServices.Marshal.Copy(bokehData.Scan0, bokehBytes, 0, bokehBytes.Length);

            for (int y = 0; y < outH; y++)
            {
                double ny = (double)y / outH;
                // Vertical capsule spine along Suzuki's body
                double segY = Math.Max(0.24, Math.Min(0.85, ny));
                double dy = (ny - segY) / 0.16;

                // Width expands from head (0.22) down to shoulders/vest (0.34)
                double radiusX = (ny < 0.48) ? 0.22 : 0.34;

                for (int x = 0; x < outW; x++)
                {
                    int idx = y * stride + x * 4;
                    double dx = ((double)x / outW - 0.50) / radiusX;
                    double dist = Math.Sqrt(dx * dx + dy * dy);

                    double sharpWeight = 0.0;
                    if (dist < 0.75)
                    {
                        sharpWeight = 1.0;
                    }
                    else if (dist < 1.05)
                    {
                        double fade = (1.05 - dist) / 0.30;
                        sharpWeight = Math.Sin(fade * Math.PI * 0.5);
                    }
                    else
                    {
                        sharpWeight = 0.0; // full bokeh background
                    }

                    double bWeight = 1.0 - sharpWeight;
                    finalBytes[idx + 0] = (byte)(baseBytes[idx + 0] * sharpWeight + bokehBytes[idx + 0] * bWeight);
                    finalBytes[idx + 1] = (byte)(baseBytes[idx + 1] * sharpWeight + bokehBytes[idx + 1] * bWeight);
                    finalBytes[idx + 2] = (byte)(baseBytes[idx + 2] * sharpWeight + bokehBytes[idx + 2] * bWeight);
                    finalBytes[idx + 3] = 255;
                }
            }

            System.Runtime.InteropServices.Marshal.Copy(finalBytes, 0, finalData.Scan0, finalBytes.Length);
            baseImg.UnlockBits(baseData);
            bokeh.UnlockBits(bokehData);
            finalBmp.UnlockBits(finalData);

            baseImg.Dispose();
            bokeh.Dispose();

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
            encParams.Param[0] = new EncoderParameter(Encoder.Quality, 95L);

            finalBmp.Save(outputPath, jpgEncoder, encParams);
            finalBmp.Dispose();
        }
    }
}
"@

Add-Type -TypeDefinition $csharpCode -ReferencedAssemblies "System.Drawing.dll"

Write-Host "Applying professional portrait bokeh for Suzuki-san..." -ForegroundColor Cyan
[PortraitBokeh]::Apply($backupFile, $targetFile)

$fi = Get-Item $targetFile
Write-Host "Generated $targetFile ($($fi.Length) bytes) successfully!" -ForegroundColor Green

# Run verify_all.ps1
$verifyScript = Join-Path $baseDir "tests\verify_all.ps1"
if (Test-Path $verifyScript) {
    Write-Host "`nRunning verification tests..." -ForegroundColor Yellow
    & powershell.exe -ExecutionPolicy Bypass -File $verifyScript
}
