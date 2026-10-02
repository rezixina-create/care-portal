Add-Type -AssemblyName System.Drawing

$testFiles = @("tests\sample_jp1.jpg", "tests\sample_jp2.jpg", "tests\wc_m1.jpg", "tests\wc_m2.jpg", "tests\wc_m4.jpg", "tests\wc_m5.jpg", "tests\wc_c1.jpg", "tests\wc_c2.jpg")
foreach ($f in $testFiles) {
    if (Test-Path $f) {
        $img = [System.Drawing.Image]::FromFile((Resolve-Path $f))
        Write-Host "$f - $($img.Width)x$($img.Height)"
        $img.Dispose()
    }
}