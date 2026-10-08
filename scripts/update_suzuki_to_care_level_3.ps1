# Update Suzuki-san to Care Level 3 with Full Consistency (Pure ASCII)
$ErrorActionPreference = "Stop"

$baseDir = Split-Path -Parent $PSScriptRoot
$jsonPath = Join-Path $baseDir "data\portal_database.json"

$jsonRaw = [System.IO.File]::ReadAllText($jsonPath, [System.Text.Encoding]::UTF8)
$data = $jsonRaw | ConvertFrom-Json

# 1. Update Resident 3 (Suzuki Ichiro) to Care Level 3
foreach ($r in $data.residents) {
    if ($r.id -eq 3) {
        $r.care_level = [System.Text.Encoding]::UTF8.GetString([System.Text.Encoding]::UTF8.GetBytes("要介護3"))
        $r.care_plan_goal = [System.Text.Encoding]::UTF8.GetString([System.Text.Encoding]::UTF8.GetBytes("ベッド上での安定した端座位保持を活かし、介助による車椅子移乗・離床機会の確保。残存機能の維持と誤嚥予防。"))
        $r.sensor_alert = [System.Text.Encoding]::UTF8.GetString([System.Text.Encoding]::UTF8.GetBytes("⚠️ 離床・転倒防止センサーマット (ベッド脇・端座位見守り)"))
        Write-Host "Updated Resident 3 care_level to 要介護3" -ForegroundColor Green
    }
}

# 2. Update Care Record (id: 1003)
foreach ($c in $data.care_records) {
    if ($c.id -eq 1003) {
        $c.content = [System.Text.Encoding]::UTF8.GetString([System.Text.Encoding]::UTF8.GetBytes("居室ベッドにて安定した端座位保持を確認。声かけに穏やかに目を細めて応じられる。軽介助にて車椅子へ移乗し、デイルームにて穏やかに過ごされる。"))
        Write-Host "Updated Care Record 1003" -ForegroundColor Green
    }
}

# 3. Update Photo (id: 6)
foreach ($p in $data.photos) {
    if ($p.id -eq 6) {
        $p.title = [System.Text.Encoding]::UTF8.GetString([System.Text.Encoding]::UTF8.GetBytes("居室ベッドサイド（端座位・安楽姿勢）での穏やかなご様子"))
        Write-Host "Updated Photo 6 title" -ForegroundColor Green
    }
}

# 4. Update Equipments for Resident 3
# Ensure he has Bed, Air Mattress, AND Modular Wheelchair for transfers
$hasWheelchair = $false
foreach ($eq in $data.equipments) {
    if ($eq.resident_id -eq 3 -and $eq.equipment_name -like "*車椅子*") {
        $hasWheelchair = $true
    }
}

if (-not $hasWheelchair) {
    $maxId = 0
    foreach ($eq in $data.equipments) {
        if ($eq.id -gt $maxId) { $maxId = $eq.id }
    }
    $newEq = [PSCustomObject]@{
        id = $maxId + 1
        resident_id = 3
        equipment_name = [System.Text.Encoding]::UTF8.GetString([System.Text.Encoding]::UTF8.GetBytes("多機能モジュール型車椅子 (移乗・座位保持サポート)"))
        ownership_type = [System.Text.Encoding]::UTF8.GetString([System.Text.Encoding]::UTF8.GetBytes("介護保険レンタル"))
        notes = [System.Text.Encoding]::UTF8.GetString([System.Text.Encoding]::UTF8.GetBytes("端座位からの移乗・離床用 (アームサポート跳ね上げ式)"))
    }
    $data.equipments = @($data.equipments) + $newEq
    Write-Host "Added Modular Wheelchair for Resident 3 (Care Level 3)" -ForegroundColor Green
}

# Save updated JSON
$updatedJson = $data | ConvertTo-Json -Depth 10
[System.IO.File]::WriteAllText($jsonPath, $updatedJson, [System.Text.Encoding]::UTF8)
Write-Host "Saved updated database to $jsonPath" -ForegroundColor Green

# Run verify_all.ps1
$verifyScript = Join-Path $baseDir "tests\verify_all.ps1"
if (Test-Path $verifyScript) {
    Write-Host "`nRunning comprehensive verification tests..." -ForegroundColor Yellow
    & powershell.exe -ExecutionPolicy Bypass -File $verifyScript
}
