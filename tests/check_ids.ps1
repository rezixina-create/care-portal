# DOM ID Consistency Check
$ErrorActionPreference = "Stop"
$dir = (Get-Item "$PSScriptRoot\..").FullName
$html = [System.IO.File]::ReadAllText("$dir\index.html", [System.Text.Encoding]::UTF8)
$js = [System.IO.File]::ReadAllText("$dir\app.js", [System.Text.Encoding]::UTF8)

# 1. 重複IDチェック
$idMatches = [System.Text.RegularExpressions.Regex]::Matches($html, 'id=["'']([^"'']+)["'']')
$seen = @{}
$dups = @()
foreach ($m in $idMatches) {
    $id = $m.Groups[1].Value
    if ($seen.ContainsKey($id)) { $dups += $id }
    else { $seen[$id] = $true }
}

if ($dups.Count -gt 0) {
    Write-Host "[FAIL] Duplicate IDs: $($dups -join ', ')" -ForegroundColor Red
    exit 1
}

# 2. app.js 内の getElementById 参照チェック
$jsMatches = [System.Text.RegularExpressions.Regex]::Matches($js, 'getElementById\s*\(\s*["'']([^"'']+)["'']\s*\)')
$missing = @()
$allowed = @("customPrintArea", "dynamicReport", "alertsContainer", "printPageSizeStyle", "incInjuryTempPin", "careExpiryNotesArea") # 動的生成・非必須許容
foreach ($m in $jsMatches) {
    $id = $m.Groups[1].Value
    if (-not $seen.ContainsKey($id) -and -not $allowed.Contains($id)) {
        if (-not $missing.Contains($id)) { $missing += $id }
    }
}

if ($missing.Count -gt 0) {
    Write-Host "[FAIL] Missing IDs in HTML referenced by JS: $($missing -join ', ')" -ForegroundColor Red
    exit 1
}

Write-Host "[PASS] DOM ID Check: All $($seen.Count) IDs unique, zero missing references in JS" -ForegroundColor Green
exit 0
