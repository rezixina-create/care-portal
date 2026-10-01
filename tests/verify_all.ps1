# Care Portal Comprehensive Verification Runner (Pure ASCII)
$ErrorActionPreference = "Continue"
$testDir = $PSScriptRoot

$tests = @(
    "check_brackets.ps1",
    "check_ids.ps1",
    "check_onclick.ps1",
    "check_dynamic_onclick.ps1",
    "check_server_syntax.ps1",
    "validate_json.ps1",
    "check_b5_features.ps1",
    "check_management_features.ps1"
)

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  Care Portal Comprehensive Multi-Check (8 Tests)" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

$passed = 0
$failed = 0

foreach ($t in $tests) {
    $scriptPath = Join-Path $testDir $t
    Write-Host "`n>>> Running $t..." -ForegroundColor Yellow
    $res = & powershell.exe -ExecutionPolicy Bypass -File $scriptPath 2>&1
    $output = $res -join "`n"
    Write-Host $output

    if ($LASTEXITCODE -eq 0 -and $output -match "\[PASS\]") {
        $passed++
    } else {
        $failed++
    }
}

Write-Host "`n==========================================================" -ForegroundColor Cyan
Write-Host "  Verification Summary:" -ForegroundColor Cyan
Write-Host "  Passed: $passed / $($tests.Count)" -ForegroundColor Green
Write-Host "  Failed: $failed / $($tests.Count)" -ForegroundColor $(if ($failed -gt 0) { "Red" } else { "Green" })

if ($failed -eq 0) {
    Write-Host "`n  *** [PERFECT PASS] ALL $($tests.Count) TESTS PASSED WITH 0 ERRORS! ***" -ForegroundColor Green
} else {
    Write-Host "`n  [FAILED] $failed test(s) failed." -ForegroundColor Red
}
Write-Host "==========================================================" -ForegroundColor Cyan

exit $failed
