# Double Cycle Verification Runner
# Guarantees 0 bugs across 2 consecutive full cycles as requested by user
$ErrorActionPreference = "Continue"

$carePortalDir = (Get-Item "$PSScriptRoot\..").FullName

function Cleanup-Port8888 {
    $conns = Get-NetTCPConnection -LocalPort 8888 -ErrorAction SilentlyContinue
    foreach ($c in $conns) {
        if ($c.OwningProcess -gt 0) {
            Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue
        }
    }
    Get-Process -Name "cloudflared" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 500
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "   Care Portal Double-Cycle Verification (2 Consecutive Cycles)" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

$cycleErrors = @(0, 0)

for ($cycle = 1; $cycle -le 2; $cycle++) {
    Write-Host "`n**********************************************************" -ForegroundColor Yellow
    Write-Host "  Starting Verification Cycle $cycle / 2..." -ForegroundColor Yellow
    Write-Host "**********************************************************" -ForegroundColor Yellow

    Cleanup-Port8888

    # 1. verify_all.ps1 (9 Tests)
    Write-Host "`n[Cycle $cycle - Step 1] Running verify_all.ps1 (9 multi-checks)..." -ForegroundColor Cyan
    $res1 = & powershell.exe -ExecutionPolicy Bypass -File "$PSScriptRoot\verify_all.ps1" 2>&1
    $out1 = $res1 -join "`n"
    if ($LASTEXITCODE -ne 0 -or $out1 -notmatch "PERFECT PASS") {
        Write-Host "[FAIL] verify_all.ps1 failed in Cycle $cycle!" -ForegroundColor Red
        Write-Host $out1
        $cycleErrors[$cycle - 1]++
    } else {
        Write-Host "  [CYCLE $cycle - PASS] All 9 checks passed cleanly!" -ForegroundColor Green
    }

    Cleanup-Port8888

    # 2. run_e2e_test.ps1 (Assertions in Real Headless Browser)
    Write-Host "`n[Cycle $cycle - Step 2] Running run_e2e_test.ps1 (E2E assertions in Real Browser)..." -ForegroundColor Cyan
    $res2 = & powershell.exe -ExecutionPolicy Bypass -File "$PSScriptRoot\run_e2e_test.ps1" 2>&1
    $out2 = $res2 -join "`n"
    if ($LASTEXITCODE -ne 0 -or $out2 -notmatch "ALL \d+ TESTS PASSED") {
        Write-Host "[FAIL] run_e2e_test.ps1 failed in Cycle $cycle!" -ForegroundColor Red
        Write-Host $out2
        $cycleErrors[$cycle - 1]++
    } else {
        Write-Host "  [CYCLE $cycle - PASS] All E2E assertions passed cleanly!" -ForegroundColor Green
    }

    Cleanup-Port8888

    # 3. test_persistence.ps1 (F5 Reload & Persistence in Real Browser)
    Write-Host "`n[Cycle $cycle - Step 3] Running test_persistence.ps1 (Browser Reload Persistence)..." -ForegroundColor Cyan
    $res3 = & powershell.exe -ExecutionPolicy Bypass -File "$PSScriptRoot\test_persistence.ps1" 2>&1
    $out3 = $res3 -join "`n"
    if ($LASTEXITCODE -ne 0 -or $out3 -notmatch "Data persistence across reload verified successfully") {
        Write-Host "[FAIL] test_persistence.ps1 failed in Cycle $cycle!" -ForegroundColor Red
        Write-Host $out3
        $cycleErrors[$cycle - 1]++
    } else {
        Write-Host "  [CYCLE $cycle - PASS] Data persistence verified cleanly!" -ForegroundColor Green
    }

    Cleanup-Port8888

    if ($cycleErrors[$cycle - 1] -eq 0) {
        Write-Host "`n>>> CYCLE $cycle COMPLETE: 100% PERFECT PASS (0 Errors)" -ForegroundColor Green
    } else {
        Write-Host "`n>>> CYCLE $cycle COMPLETE: $($cycleErrors[$cycle - 1]) ERRORS FOUND" -ForegroundColor Red
    }
}

Write-Host "`n==========================================================" -ForegroundColor Cyan
Write-Host "  FINAL DOUBLE-CYCLE SUMMARY" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  Cycle 1 Errors: $($cycleErrors[0])" -ForegroundColor $(if ($cycleErrors[0] -eq 0) { "Green" } else { "Red" })
Write-Host "  Cycle 2 Errors: $($cycleErrors[1])" -ForegroundColor $(if ($cycleErrors[1] -eq 0) { "Green" } else { "Red" })

if ($cycleErrors[0] -eq 0 -and $cycleErrors[1] -eq 0) {
    Write-Host "`n  *** [DOUBLE CYCLE SUCCESS] ALL TESTS PASSED TWICE CONSECUTIVELY WITH ZERO BUGS! ***" -ForegroundColor Green
    exit 0
} else {
    Write-Host "`n  [FAILED] One or more cycles failed." -ForegroundColor Red
    exit 1
}
