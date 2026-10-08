# Static Onclick Handlers Check
$ErrorActionPreference = "Stop"
$dir = (Get-Item "$PSScriptRoot\..").FullName
$html = [System.IO.File]::ReadAllText("$dir\index.html", [System.Text.Encoding]::UTF8)
$js = [System.IO.File]::ReadAllText("$dir\app.js", [System.Text.Encoding]::UTF8)

$matches = [System.Text.RegularExpressions.Regex]::Matches($html, 'onclick=["'']\s*([a-zA-Z0-9_]+)\s*\(')
$fns = @($matches | ForEach-Object { $_.Groups[1].Value } | Select-Object -Unique)

$missing = @()
foreach ($fn in $fns) {
    if ($fn -eq "if" -or $fn -eq "alert" -or $fn -eq "confirm") { continue }
    $regex = "(?:function\s+$fn\b|class\s+$fn\b|const\s+$fn\s*=|let\s+$fn\s*=|var\s+$fn\s*=|window\.$fn\s*=)"
    if (-not [System.Text.RegularExpressions.Regex]::IsMatch($js, $regex)) {
        $missing += $fn
    }
}

if ($missing.Count -gt 0) {
    Write-Host "[FAIL] Missing onclick functions: $($missing -join ', ')" -ForegroundColor Red
    exit 1
}

Write-Host "[PASS] Static Onclick Check: All $($fns.Count) onclick handlers exist in app.js" -ForegroundColor Green
exit 0
