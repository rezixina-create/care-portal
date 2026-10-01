# Robust Bracket Balance Checker
$ErrorActionPreference = "Stop"
$dir = (Get-Item "$PSScriptRoot\..").FullName
$lines = [System.IO.File]::ReadAllLines("$dir\app.js", [System.Text.Encoding]::UTF8)

# 1. 行単位でコメントとクォート文字列を除去
$cleanLines = @()
foreach ($l in $lines) {
    $cl = [System.Text.RegularExpressions.Regex]::Replace($l, '//.*$', '')
    $cl = [System.Text.RegularExpressions.Regex]::Replace($cl, '\"(\\.|[^\"])*\"', '""')
    $cl = [System.Text.RegularExpressions.Regex]::Replace($cl, "\'(\\.|[^\'])*\'", "''")
    $cleanLines += $cl
}

# 2. 結合してブロックコメントと複数行テンプレートリテラルを除去
$full = $cleanLines -join "`n"
$full = [System.Text.RegularExpressions.Regex]::Replace($full, '/\*[\s\S]*?\*/', '')

for ($depth = 0; $depth -lt 5; $depth++) {
    $full = [System.Text.RegularExpressions.Regex]::Replace($full, '\`[^`]*\`', '``')
}

$cOpen = ($full.ToCharArray() | Where-Object { $_ -eq '{' }).Count
$cClose = ($full.ToCharArray() | Where-Object { $_ -eq '}' }).Count
$pOpen = ($full.ToCharArray() | Where-Object { $_ -eq '(' }).Count
$pClose = ($full.ToCharArray() | Where-Object { $_ -eq ')' }).Count
$bOpen = ($full.ToCharArray() | Where-Object { $_ -eq '[' }).Count
$bClose = ($full.ToCharArray() | Where-Object { $_ -eq ']' }).Count

$errs = @()
if ($cOpen -ne $cClose) { $errs += "Curly brace mismatch: { = $cOpen, } = $cClose" }
if ($pOpen -ne $pClose) { $errs += "Parentheses mismatch: ( = $pOpen, ) = $pClose" }
if ($bOpen -ne $bClose) { $errs += "Square bracket mismatch: [ = $bOpen, ] = $bClose" }

if ($errs.Count -gt 0) {
    Write-Host "[FAIL] Bracket Balance Errors ($($errs.Count)):" -ForegroundColor Red
    foreach ($e in $errs) { Write-Host "  $e" -ForegroundColor Red }
    exit 1
}

Write-Host "[PASS] Bracket Balance: { } = $cOpen pairs, ( ) = $pOpen pairs, [ ] = $bOpen pairs (100% matched)" -ForegroundColor Green
exit 0
