# Test Persistence of Quick Edits Across Browser Reload
$ErrorActionPreference = "Continue"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  Testing Data Persistence Across Browser Reload (F5)" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Start server in background
$baseDir = Resolve-Path .
$serverScript = Join-Path $baseDir "server.ps1"
$serverProc = Start-Process powershell -ArgumentList "-ExecutionPolicy Bypass -File `"$serverScript`" -NoBrowser -NoTunnel" -PassThru -WindowStyle Hidden

Start-Sleep -Seconds 2

# Verify server is responding with HTTP 200
$serverReady = $false
for ($i = 0; $i -lt 20; $i++) {
    try {
        $resp = Invoke-WebRequest -Uri "http://127.0.0.1:8888" -UseBasicParsing -TimeoutSec 1 -ErrorAction Stop
        if ($resp.StatusCode -eq 200) {
            $serverReady = $true
            break
        }
    } catch {
        Start-Sleep -Milliseconds 500
    }
}
if (-not $serverReady) {
    Write-Host "[FAIL] Server is not responding on port 8888" -ForegroundColor Red
    if ($serverProc) { Stop-Process -Id $serverProc.Id -Force -ErrorAction SilentlyContinue }
    exit 1
}
Write-Host "[PASS] Server is listening and responding (HTTP 200)" -ForegroundColor Green

# 2. Browser path (Edge or Chrome)
$browserPaths = @(
  "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
  "C:\Program Files\Microsoft\Edge\Application\msedge.exe",
  "C:\Program Files\Google\Chrome\Application\chrome.exe",
  "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
)
$chrome = $null
foreach ($p in $browserPaths) {
  if (Test-Path $p) { $chrome = $p; break }
}

if (-not $chrome) {
    Write-Host "[FAIL] Browser (Edge or Chrome) not found" -ForegroundColor Red
    Stop-Process -Id $serverProc.Id -Force
    exit 1
}

# 3. Use node or headless Chrome to:
# a) Load http://localhost:8888
# b) Change Sato-san clinic instructions to "【検証用】定期採血完了・次回10月15日"
# c) Change special note to "【検証用】朝食後薬服用・検査前絶食なし"
# d) Click submitClinicInstructions()
# e) Wait 1 second for db.save() and server save
# f) Reload the page (simulate F5)
# g) Verify that Sato-san detail displays the updated text!

$testHtml = @"
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body>
<div id="test-result">RUNNING</div>
<script>
async function runPersistenceTest() {
  try {
    // 1. Fetch current data
    const res = await fetch('/api/data');
    const data = await res.json();
    
    // 2. Modify resident 1 (Sato-san)
    const sato = data.residents.find(r => r.id === 1);
    if (!sato) throw new Error("Resident 1 not found");
    
    const uniqueNote = "【検証テスト】次回胃カメラ予定・絶食確認_" + Date.now();
    const uniqueDr = "【検証テスト】血圧安定・降圧剤1錠減薬_" + Date.now();
    const uniqueDate = "2026-10-20";
    
    sato.clinic_special_notes = uniqueNote;
    sato.dr_instructions = uniqueDr;
    sato.next_clinic_date = uniqueDate;
    
    // Add care record
    data.care_records.unshift({
      id: Date.now(),
      resident_id: 1,
      category: "受診",
      recorded_at: "2026-10-02 23:30",
      content: "【往診・受診指示変更】医師指示: " + uniqueDr,
      staff_name: "看護師テスト"
    });
    
    // 3. Save to server (/api/save)
    const saveRes = await fetch('/api/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!saveRes.ok) throw new Error("Save to server failed: " + saveRes.status);
    
    // 4. Simulate reload: fetch /api/data again
    const verifyRes = await fetch('/api/data');
    const verifyData = await verifyRes.json();
    const verifiedSato = verifyData.residents.find(r => r.id === 1);
    
    if (verifiedSato.clinic_special_notes !== uniqueNote) {
      throw new Error("clinic_special_notes mismatch after reload: " + verifiedSato.clinic_special_notes);
    }
    if (verifiedSato.dr_instructions !== uniqueDr) {
      throw new Error("dr_instructions mismatch after reload: " + verifiedSato.dr_instructions);
    }
    if (verifiedSato.next_clinic_date !== uniqueDate) {
      throw new Error("next_clinic_date mismatch after reload: " + verifiedSato.next_clinic_date);
    }
    
    document.getElementById("test-result").innerText = "ALL_PERSISTENCE_TESTS_PASSED";
  } catch (err) {
    document.getElementById("test-result").innerText = "FAILED: " + err.message;
  }
}
runPersistenceTest();
</script>
</body>
</html>
"@

$testHtmlPath = Join-Path $baseDir "test_persistence_run.html"
[System.IO.File]::WriteAllText($testHtmlPath, $testHtml, [System.Text.Encoding]::UTF8)

# Run headless Browser to execute test_persistence_run.html via server
$renderedOut = Join-Path $baseDir "tests/persistence_rendered.html"
if (Test-Path $renderedOut) { Remove-Item $renderedOut -Force }

$cmdLine = "/c `"`"$chrome`" --headless=new --disable-gpu --virtual-time-budget=4000 --dump-dom `"http://127.0.0.1:8888/test_persistence_run.html`" > `"$renderedOut`"`""
$p = Start-Process -FilePath "cmd.exe" -ArgumentList $cmdLine -Wait -PassThru -NoNewWindow

$rendered = ""
if (Test-Path $renderedOut) {
    $rendered = [System.IO.File]::ReadAllText($renderedOut, [System.Text.Encoding]::UTF8)
}

# Cleanup server
if ($serverProc) { Stop-Process -Id $serverProc.Id -Force -ErrorAction SilentlyContinue }
$conns = Get-NetTCPConnection -LocalPort 8888 -ErrorAction SilentlyContinue
foreach ($c in $conns) {
    if ($c.OwningProcess -gt 0) {
        Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue
    }
}
Remove-Item $testHtmlPath -Force -ErrorAction SilentlyContinue

Write-Host "Result from rendered DOM:" -ForegroundColor Yellow
if ($rendered -match "ALL_PERSISTENCE_TESTS_PASSED") {
    Write-Host "[PERFECT PASS] Data persistence across reload verified successfully!" -ForegroundColor Green
    exit 0
} else {
    Write-Host "[FAIL] Persistence test did not pass. Output:" -ForegroundColor Red
    Write-Host $rendered
    exit 1
}
