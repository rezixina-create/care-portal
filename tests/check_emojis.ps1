$portalDir = (Get-Item "$PSScriptRoot\..").FullName
$files = @(
    "index.html",
    "style.css",
    "data/portal_database.json",
    "test_suite.html",
    "modal_test_runner.html",
    "static/index.html",
    "static/style.css",
    "static/test_suite.html",
    "static/modal_test_runner.html"
)

# [Claude整理 2026-10-19] app.js は js/ に分けた
$files = @($files) + @(Get-ChildItem (Join-Path $portalDir "js\*.js") | ForEach-Object { "js/" + $_.Name }) + @(Get-ChildItem (Join-Path $portalDir "static\js\*.js") -ErrorAction SilentlyContinue | ForEach-Object { "static/js/" + $_.Name })
$found = 0
$regex = New-Object System.Text.RegularExpressions.Regex "[\uD83C-\uDBFF][\uDC00-\uDFFF]|[\u2600-\u26FF]|[\u2700-\u27BF]"

foreach ($f in $files) {
    $fullPath = Join-Path $portalDir $f
    if (-not (Test-Path $fullPath)) { continue }
    $content = [System.IO.File]::ReadAllText($fullPath, [System.Text.Encoding]::UTF8)
    $matches = $regex.Matches($content)
    if ($matches.Count -gt 0) {
        Write-Host "[FAIL] Found $($matches.Count) emoji(s) in $f" -ForegroundColor Red
        $found += $matches.Count
    } else {
        Write-Host "  [PASS] Zero emojis in $f" -ForegroundColor Green
    }
}

if ($found -gt 0) {
    Write-Host "`n[FAIL] Total $found emoji(s) detected!" -ForegroundColor Red
    exit 1
} else {
    Write-Host "`n[PASS] STRICT ZERO EMOJI POLICY 100% SATISFIED! (0 emojis across all files)" -ForegroundColor Green
    exit 0
}
