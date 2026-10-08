# Headless Edge JavaScript Syntax & Test Suite Runner
$edgePath = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
$testHtml = (Resolve-Path "$PSScriptRoot\..\test_suite.html").Path
$testUrl = "file:///" + ($testHtml -replace '\\', '/')
$outHtml = "$PSScriptRoot\edge_dom.html"

if (Test-Path $outHtml) { Remove-Item $outHtml -Force }

Write-Host "Running Headless Edge for: $testUrl" -ForegroundColor Cyan

$cmdLine = "/c `"`"$edgePath`" --headless --disable-gpu --virtual-time-budget=3000 --dump-dom `"$testUrl`" > `"$outHtml`"`""
$p = Start-Process -FilePath "cmd.exe" -ArgumentList $cmdLine -Wait -PassThru -NoNewWindow

if (Test-Path $outHtml) {
    $content = [System.IO.File]::ReadAllText($outHtml, [System.Text.Encoding]::UTF8)
    $passMatches = [System.Text.RegularExpressions.Regex]::Matches($content, '\[PASS\]')
    $failMatches = [System.Text.RegularExpressions.Regex]::Matches($content, '\[FAIL\]')

    Write-Host "Assertions Passed: $($passMatches.Count)" -ForegroundColor Green
    Write-Host "Assertions Failed: $($failMatches.Count)" -ForegroundColor $(if ($failMatches.Count -gt 0) { "Red" } else { "Green" })

    if ($failMatches.Count -eq 0 -and $passMatches.Count -ge 30) {
        Write-Host "`n[PERFECT PASS] Edge Browser Headless Engine: ALL $($passMatches.Count) TESTS PASSED WITH 0 ERRORS!" -ForegroundColor Green
        exit 0
    } else {
        Write-Host "`n[FAIL] Test suite failed or did not complete properly." -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "[FAIL] Output DOM file was not generated." -ForegroundColor Red
    exit 1
}
