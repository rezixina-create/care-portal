# Verify index.html real browser execution & DOM rendering (Pure ASCII Script)
$ErrorActionPreference = "Stop"
$dir = (Get-Item "$PSScriptRoot\..").FullName
$edgePath = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
if (-not (Test-Path $edgePath)) {
    $edgePath = "C:\Program Files\Microsoft\Edge\Application\msedge.exe"
}

# 1. Start Server
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

$outHtml = "$PSScriptRoot\index_rendered.html"
if (Test-Path $outHtml) { Remove-Item $outHtml -Force }

# 2. Dump DOM via Headless Edge
$url = "http://127.0.0.1:8888/"
$cmdLine = "/c `"`"$edgePath`" --headless=new --disable-gpu --virtual-time-budget=4000 --dump-dom `"$url`" > `"$outHtml`"`""
$p = Start-Process -FilePath "cmd.exe" -ArgumentList $cmdLine -Wait -PassThru -NoNewWindow

# 3. Stop Server
if ($serverProcess) { Stop-Process -Id $serverProcess.Id -Force -ErrorAction SilentlyContinue }
$tcp = Get-NetTCPConnection -LocalPort 8888 -ErrorAction SilentlyContinue
if ($tcp) { Stop-Process -Id $tcp.OwningProcess -Force -ErrorAction SilentlyContinue }

# 4. Check DOM elements
if (-not (Test-Path $outHtml)) {
    Write-Host "[FAIL] Rendered DOM could not be generated" -ForegroundColor Red
    exit 1
}

$html = [System.IO.File]::ReadAllText($outHtml, [System.Text.Encoding]::UTF8)

$checks = @(
    @{ Name = "Initial Resident Profile"; Pattern = "care-accordion" },
    @{ Name = "Wi-Fi Badge"; Pattern = "syncStatusBadge" },
    @{ Name = "Backup Badge"; Pattern = "backupStatusBadge" },
    @{ Name = "Daily Schedule Timeline"; Pattern = "dailyScheduleTimeline" },
    @{ Name = "Weight Chart Container"; Pattern = "weightChartContainer" },
    @{ Name = "Quick Consume Resident Selector"; Pattern = "consumeResidentSelect" },
    @{ Name = "B5 Word Counter Badge"; Pattern = "recordB5Badge" },
    @{ Name = "Monthly Notice List Area"; Pattern = "monthlyNoticeList" },
    @{ Name = "Global Alert Bar Container"; Pattern = "alertsContainer" }
)

$allOk = $true
foreach ($c in $checks) {
    if ($html -match $c.Pattern) {
        Write-Host "  [PASS] $($c.Name) is present in rendered DOM" -ForegroundColor Green
    } else {
        Write-Host "  [FAIL] $($c.Name) is missing (Pattern: $($c.Pattern))" -ForegroundColor Red
        $allOk = $false
    }
}

if ($allOk) {
    Write-Host "`n[PERFECT PASS] index.html Real Browser Rendering Verified (0 Errors)" -ForegroundColor Green
    exit 0
} else {
    Write-Host "`n[FAIL] Some elements missing in rendered DOM" -ForegroundColor Red
    exit 1
}
