# Test All Change Modals Click & Display Verification via Real Edge Headless Browser
$ErrorActionPreference = "Stop"
$dir = (Get-Item "$PSScriptRoot\..").FullName
$edgePath = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
if (-not (Test-Path $edgePath)) {
    $edgePath = "C:\Program Files\Microsoft\Edge\Application\msedge.exe"
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  Testing All Resident Change Modals in Real Headless Edge" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 既存プロセス・ポート8888クリーンアップ
$tcpInit = Get-NetTCPConnection -LocalPort 8888 -ErrorAction SilentlyContinue
if ($tcpInit) { Stop-Process -Id $tcpInit.OwningProcess -Force -ErrorAction SilentlyContinue }
Start-Sleep -Milliseconds 500

# 1. サーバー起動
Write-Host "`n[Step 1] Starting Server on port 8888..." -ForegroundColor Yellow
$serverProcess = Start-Process -FilePath "powershell.exe" -ArgumentList "-ExecutionPolicy", "Bypass", "-File", "`"$dir\server.ps1`"", "-NoBrowser", "-NoTunnel" -PassThru -NoNewWindow
$ready = $false
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Milliseconds 500
    $conn = Get-NetTCPConnection -LocalPort 8888 -State Listen -ErrorAction SilentlyContinue
    if ($conn) { $ready = $true; break }
}

if (-not $ready) {
    Write-Host "[FAIL] Server failed to start on port 8888" -ForegroundColor Red
    if ($serverProcess) { Stop-Process -Id $serverProcess.Id -Force }
    exit 1
}

# 2. Edge ヘッドレスで実行
Write-Host "`n[Step 2] Executing modal_test_runner.html via Headless Edge..." -ForegroundColor Yellow
$outHtml = "$PSScriptRoot\modal_test_result.html"
if (Test-Path $outHtml) { Remove-Item $outHtml -Force }

$testUrl = "http://127.0.0.1:8888/modal_test_runner.html"
$cmdLine = "/c `"`"$edgePath`" --headless=new --disable-gpu --virtual-time-budget=8000 --dump-dom `"$testUrl`" > `"$outHtml`"`""
$p = Start-Process -FilePath "cmd.exe" -ArgumentList $cmdLine -Wait -PassThru -NoNewWindow

# 3. サーバー停止
Write-Host "`n[Step 3] Stopping Server..." -ForegroundColor Yellow
if ($serverProcess) { Stop-Process -Id $serverProcess.Id -Force -ErrorAction SilentlyContinue }
$tcp = Get-NetTCPConnection -LocalPort 8888 -ErrorAction SilentlyContinue
if ($tcp) { Stop-Process -Id $tcp.OwningProcess -Force -ErrorAction SilentlyContinue }

# 4. 結果の集計
Write-Host "`n[Step 4] Checking Assertions..." -ForegroundColor Yellow
if (Test-Path $outHtml) {
    $content = [System.IO.File]::ReadAllText($outHtml, [System.Text.Encoding]::UTF8)
    $passMatches = [System.Text.RegularExpressions.Regex]::Matches($content, '<div class="test-pass">([^<]+)</div>')
    $failMatches = [System.Text.RegularExpressions.Regex]::Matches($content, '<div class="test-fail">([^<]+)</div>')

    Write-Host "`n==========================================================" -ForegroundColor Cyan
    Write-Host "  MODAL TEST RESULTS" -ForegroundColor Cyan
    Write-Host "==========================================================" -ForegroundColor Cyan
    foreach ($m in $passMatches) {
        Write-Host "  $($m.Groups[1].Value)" -ForegroundColor Green
    }
    foreach ($m in $failMatches) {
        Write-Host "  $($m.Groups[1].Value)" -ForegroundColor Red
    }

    if ($failMatches.Count -eq 0 -and $passMatches.Count -ge 7) {
        Write-Host "`n  [PERFECT PASS] ALL $($passMatches.Count) MODAL TESTS PASSED IN REAL BROWSER!" -ForegroundColor Green
        Remove-Item $outHtml -Force -ErrorAction SilentlyContinue
        exit 0
    } else {
        Write-Host "`n  [FAIL] $($failMatches.Count) tests failed out of $($passMatches.Count + $failMatches.Count)" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "[FAIL] Result file not generated" -ForegroundColor Red
    exit 1
}
