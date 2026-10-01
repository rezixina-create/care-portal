# End-to-End Real Browser HTTP Test Runner
$carePortalDir = (Get-Item "$PSScriptRoot\..").FullName
$edgePath = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
if (-not (Test-Path $edgePath)) {
    $edgePath = "C:\Program Files\Microsoft\Edge\Application\msedge.exe"
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  Care Portal E2E Real Browser Test (Cycle 1)" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. サーバー起動
Write-Host "`n[Step 1] Starting Care Portal Server on port 8000..." -ForegroundColor Yellow
$serverProcess = Start-Process -FilePath "powershell.exe" -ArgumentList "-ExecutionPolicy", "Bypass", "-File", "`"$carePortalDir\server.ps1`"" -PassThru -NoNewWindow

# 待機 (ポート8000が開くまで最大10秒)
$ready = $false
for ($i = 0; $i -lt 20; $i++) {
    Start-Sleep -Milliseconds 500
    $conn = Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue
    if ($conn) {
        $ready = $true
        break
    }
}

if (-not $ready) {
    Write-Host "[FAIL] Server failed to start on port 8000" -ForegroundColor Red
    if ($serverProcess) { Stop-Process -Id $serverProcess.Id -Force }
    exit 1
}

Write-Host "  [PASS] Server is listening on http://127.0.0.1:8000" -ForegroundColor Green

# 2. Edge ヘッドレスで test_suite.html を実行
Write-Host "`n[Step 2] Running Test Suite via Headless Edge..." -ForegroundColor Yellow
$testUrl = "http://127.0.0.1:8000/test_suite.html"
$outHtml = "$PSScriptRoot\e2e_result.html"
if (Test-Path $outHtml) { Remove-Item $outHtml -Force }

$cmdLine = "/c `"`"$edgePath`" --headless=new --disable-gpu --virtual-time-budget=5000 --dump-dom `"$testUrl`" > `"$outHtml`"`""
$p = Start-Process -FilePath "cmd.exe" -ArgumentList $cmdLine -Wait -PassThru -NoNewWindow

# 3. サーバー停止
Write-Host "`n[Step 3] Stopping Server..." -ForegroundColor Yellow
if ($serverProcess) {
    Stop-Process -Id $serverProcess.Id -Force -ErrorAction SilentlyContinue
}
# ポート8000を確実に解放
$tcp = Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue
if ($tcp) {
    Stop-Process -Id $tcp.OwningProcess -Force -ErrorAction SilentlyContinue
}
Write-Host "  [PASS] Server stopped cleanly" -ForegroundColor Green

# 4. 結果判定
Write-Host "`n[Step 4] Analyzing Test Suite Results..." -ForegroundColor Yellow
if (Test-Path $outHtml) {
    $content = [System.IO.File]::ReadAllText($outHtml, [System.Text.Encoding]::UTF8)

    $passMatches = [System.Text.RegularExpressions.Regex]::Matches($content, '<div class="test-pass">([^<]+)</div>')
    $failMatches = [System.Text.RegularExpressions.Regex]::Matches($content, '<div class="test-fail">([^<]+)</div>')

    Write-Host "  Passed assertions: $($passMatches.Count)" -ForegroundColor Green
    Write-Host "  Failed assertions: $($failMatches.Count)" -ForegroundColor $(if ($failMatches.Count -gt 0) { "Red" } else { "Green" })

    # 個別テストログの表示
    foreach ($m in $passMatches) {
        Write-Host "    $($m.Groups[1].Value)" -ForegroundColor Green
    }
    foreach ($m in $failMatches) {
        Write-Host "    $($m.Groups[1].Value)" -ForegroundColor Red
    }

    if ($failMatches.Count -eq 0 -and $passMatches.Count -ge 30) {
        Write-Host "`n==========================================================" -ForegroundColor Cyan
        Write-Host "  [PERFECT PASS] ALL $($passMatches.Count) TESTS PASSED IN REAL BROWSER!" -ForegroundColor Green
        Write-Host "==========================================================" -ForegroundColor Cyan
        exit 0
    } else {
        Write-Host "`n[FAIL] Test suite failed with $($failMatches.Count) errors." -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "[FAIL] Test result file not generated" -ForegroundColor Red
    exit 1
}
