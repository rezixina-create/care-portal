# One-Step Master Update Script (100% ASCII)
$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$portalDir = Split-Path -Parent $scriptDir

function Unesc($s) {
    return [System.Text.RegularExpressions.Regex]::Unescape($s)
}

Write-Host ">>> Step 1: Processing Suzuki Ichiro photo (Removing name tags/plates)..." -ForegroundColor Cyan
& powershell.exe -ExecutionPolicy Bypass -File (Join-Path $scriptDir "fix_suzuki_image.ps1")

Write-Host "`n>>> Step 2: Updating portal_database.json for Care Level 4 consistency..." -ForegroundColor Cyan
$jsonPath = Join-Path $portalDir "data\portal_database.json"
$rawJson = [System.IO.File]::ReadAllText($jsonPath, [System.Text.Encoding]::UTF8)
$db = $rawJson | ConvertFrom-Json

# 2.1 Resident 3 care_plan_goal & sensor_alert
$newGoal = Unesc("\u98df\u5f8c30\u5206\u306f\u30ea\u30af\u30e9\u30a4\u30cb\u30f3\u30b0\u8eca\u6905\u5b50\u3067\u306e\u5b89\u697d\u5ea7\u4f4d\u4fdd\u6301\u30fb\u30dd\u30b8\u30b7\u30e7\u30cb\u30f3\u30b0\u3002\u4f53\u5727\u5206\u6563\u3068\u8aa4\u56a5\u4e88\u9632\u3002")
$newAlert = Unesc("\u26a0\ufe0f \u8eca\u6905\u5b50\u79fb\u4e57\u6642\u5168\u4ecb\u52a9 (\u30c6\u30a3\u30eb\u30c8\uff06\u30ea\u30af\u30e9\u30a4\u30cb\u30f3\u30b0\u5f0f)")

foreach ($r in $db.residents) {
    if ($r.id -eq 3) {
        $r.care_plan_goal = $newGoal
        $r.sensor_alert = $newAlert
        Write-Host "  [OK] Updated resident 3 care plan goal and sensor alert." -ForegroundColor Green
    }
}

# 2.2 Photo 6 title
$newPhotoTitle = Unesc("\u30c7\u30a4\u30eb\u30fc\u30e0\u7a93\u969b\u3067\u306e\u30ea\u30af\u30e9\u30a4\u30cb\u30f3\u30b0\u30fb\u3072\u306a\u305f\u307c\u3063\u3053")
foreach ($p in $db.photos) {
    if ($p.id -eq 6) {
        $p.title = $newPhotoTitle
        Write-Host "  [OK] Updated photo 6 title." -ForegroundColor Green
    }
}

# 2.3 Care record 1003 content
$newCareRecord = Unesc("\u30c7\u30a4\u30eb\u30fc\u30e0\u5357\u5411\u304d\u7a93\u969b\u306b\u3066\u3001\u30ea\u30af\u30e9\u30a4\u30cb\u30f3\u30b0\u8eca\u6905\u5b50\u3067\u306e\u5b89\u697d\u59ff\u52e2\u4fdd\u6301\u30fb\u30dd\u30b8\u30b7\u30e7\u30cb\u30f3\u30b0\u5b9f\u65bd\u3002\u65e5\u5dee\u3057\u306b\u3042\u305f\u308a\u819d\u639b\u3051\u3092\u304b\u3051\u7a4f\u3084\u304b\u306a\u8868\u60c5\u3092\u3055\u308c\u308b\u3002\u4f53\u5727\u5206\u6563\u30fb\u30af\u30c3\u30b7\u30e7\u30f3\u8abf\u6574\u826f\u597d\u3002")
foreach ($c in $db.care_records) {
    if ($c.id -eq 1003) {
        $c.content = $newCareRecord
        Write-Host "  [OK] Updated care record 1003 content." -ForegroundColor Green
    }
}

# 2.4 Add equipments for Suzuki Ichiro
$hasTiltWheelchair = $false
foreach ($eq in $db.equipments) {
    if ($eq.resident_id -eq 3 -and $eq.equipment_name -match "リクライニング") {
        $hasTiltWheelchair = $true
        break
    }
}

if (-not $hasTiltWheelchair) {
    $maxEqId = 0
    foreach ($eq in $db.equipments) {
        if ($eq.id -gt $maxEqId) { $maxEqId = $eq.id }
    }
    
    $newEq1 = [PSCustomObject]@{
        id = $maxEqId + 1
        resident_id = 3
        equipment_name = Unesc("\u30c6\u30a3\u30eb\u30c8\uff06\u30ea\u30af\u30e9\u30a4\u30cb\u30f3\u30b0\u5f0f\u8eca\u6905\u5b50")
        ownership_type = Unesc("\u4ecb\u8b77\u4fdd\u967a\u30ec\u30f3\u30bf\u30eb")
        notes = Unesc("\u4f53\u5727\u5206\u6563\u30fb\u30d8\u30c3\u30c9\u30ec\u30b9\u30c8\u652f\u6301\u30fb\u30d5\u30c3\u30c8\u30ec\u30b9\u30c8\u30a8\u30ec\u30d9\u30fc\u30c6\u30a3\u30f3\u30b0\u6a5f\u80fd\u4ed8\u304d")
    }
    $newEq2 = [PSCustomObject]@{
        id = $maxEqId + 2
        resident_id = 3
        equipment_name = Unesc("\u4f53\u5727\u5206\u6563\u30b2\u30eb\u30fb\u30a6\u30ec\u30bf\u30f3\u30af\u30c3\u30b7\u30e7\u30f3")
        ownership_type = Unesc("\u65bd\u8a2d\u5099\u54c1")
        notes = Unesc("\u5ea7\u4f4d\u4fdd\u6301\u30fb\u8925\u7621\u4e88\u9632\u7528")
    }
    
    $eqList = [System.Collections.ArrayList]@($db.equipments)
    [void]$eqList.Add($newEq1)
    [void]$eqList.Add($newEq2)
    $db.equipments = $eqList
    Write-Host "  [OK] Added tilt/reclining wheelchair and cushion for Suzuki Ichiro." -ForegroundColor Green
}

# Save JSON with UTF8 without BOM
$newJson = $db | ConvertTo-Json -Depth 32
[System.IO.File]::WriteAllText($jsonPath, $newJson, (New-Object System.Text.UTF8Encoding($false)))
Write-Host "  [OK] Saved portal_database.json." -ForegroundColor Green

Write-Host "`n>>> Step 3: Running Comprehensive Verification Tests..." -ForegroundColor Cyan
$testScript = Join-Path $portalDir "tests\verify_all.ps1"
& powershell.exe -ExecutionPolicy Bypass -File $testScript

Write-Host "`n>>> Master Update Finished Successfully!" -ForegroundColor Green
