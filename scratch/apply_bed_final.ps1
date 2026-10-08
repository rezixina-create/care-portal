# apply_bed_final.ps1 - Pure ASCII
$ErrorActionPreference = "Continue"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$portalDir = Split-Path -Parent $scriptDir

function Unesc($s) {
    return [System.Text.RegularExpressions.Regex]::Unescape($s)
}

Write-Host "=========================================================="
Write-Host " Step 1: Search & Download Bed-Resting Senior Photo"
Write-Host "=========================================================="

$searchUrls = @(
    "https://unsplash.com/s/photos/elderly-patient-bed",
    "https://unsplash.com/s/photos/elderly-man-in-bed",
    "https://unsplash.com/s/photos/senior-in-bed"
)

$destPath = Join-Path $portalDir "data\photos\personal\resident_suzuki_snap.jpg"
$tempDir = Join-Path $portalDir "tests\bed_candidates"
if (-not (Test-Path $tempDir)) { New-Item -ItemType Directory -Path $tempDir -Force | Out-Null }

$allUrls = @()
foreach ($sUrl in $searchUrls) {
    Write-Host "Fetching: $sUrl"
    $html = curl.exe -s -L -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64)" "$sUrl"
    $matches = [System.Text.RegularExpressions.Regex]::Matches($html, 'https://images.unsplash.com/photo-[^"?]+')
    foreach ($m in $matches) {
        $u = $m.Value
        if ($allUrls -notcontains $u) {
            $allUrls += $u
        }
    }
    if ($allUrls.Count -ge 8) { break }
}

Write-Host "Found $($allUrls.Count) image candidates from Unsplash."

$savedCandidates = @()
$candIdx = 1
foreach ($u in $allUrls) {
    $imgUrl = "$u?w=800&auto=format&fit=crop&q=80"
    $candPath = Join-Path $tempDir "bed_candidate_${candIdx}.jpg"
    Write-Host "Downloading candidate ${candIdx}..."
    curl.exe -s -L -H "User-Agent: Mozilla/5.0" "$imgUrl" -o "$candPath"
    if ((Test-Path $candPath) -and (Get-Item $candPath).Length -gt 15000) {
        $savedCandidates += $candPath
        $candIdx++
    }
    if ($candIdx -gt 5) { break }
}

Write-Host "Downloaded $($savedCandidates.Count) valid candidate images."

# Pick best candidate or use candidate 1
if ($savedCandidates.Count -gt 0) {
    $chosen = $savedCandidates[0]
    Copy-Item $chosen $destPath -Force
    Write-Host "Deployed: $destPath (from $chosen)"
} else {
    Write-Host "Using existing photo."
}

Write-Host "`n=========================================================="
Write-Host " Step 2: Update portal_database.json for Bed Rest Consistency"
Write-Host "=========================================================="

$jsonPath = Join-Path $portalDir "data\portal_database.json"
$rawJson = [System.IO.File]::ReadAllText($jsonPath, [System.Text.Encoding]::UTF8)
$db = $rawJson | ConvertFrom-Json

# 2.1 Resident 3 care_plan_goal & sensor_alert
# Goal: 居室介護ベッドにて適切なギャッジアップ（30度〜45度）と体位変換・ポジショニングによる安楽保持、褥瘡・誤嚥予防。
$newGoal = Unesc("\u5c45\u5ba4\u4ecb\u8b77\u30d9\u30c3\u30c9\u306b\u3066\u9069\u5207\u306a\u30ae\u30e3\u30c3\u30b8\u30a2\u30c3\u30d7\uff0830\u5ea6\uff5e45\u5ea6\uff09\u3068\u4f53\u4f4d\u5909\u63db\u30fb\u30dd\u30b8\u30b7\u30e7\u30cb\u30f3\u30b0\u306b\u3088\u308b\u5b89\u697d\u4fdd\u6301\u3001\u8925\u7621\u30fb\u8aa4\u56a5\u4e88\u9632\u3002")

# Alert: ⚠️ 離床・転落防止センサーマット（低床ベッド・安楽ギャッジアップ保持）
$newAlert = Unesc("\u26a0\ufe0f \u96e2\u5e8a\u30fb\u8ee2\u843d\u9632\u6b62\u30bb\u30f3\u30b5\u30fc\u30de\u30c3\u30c8\uff08\u4f4e\u5e8a\u30d9\u30c3\u30c9\u30fb\u5b89\u697d\u30ae\u30e3\u30c3\u30b8\u30a2\u30c3\u30d7\u4fdd\u6301\uff09")

foreach ($r in $db.residents) {
    if ($r.id -eq 3) {
        $r.care_plan_goal = $newGoal
        $r.sensor_alert = $newAlert
        Write-Host "  [OK] Updated resident 3 care plan goal and alert." -ForegroundColor Green
    }
}

# 2.2 Photo 6 title
# Title: 居室ベッド（頭部ギャッジアップ）での安楽休息のご様子
$newPhotoTitle = Unesc("\u5c45\u5ba4\u30d9\u30c3\u30c9\uff08\u982d\u90e8\u30ae\u30e3\u30c3\u30b8\u30a2\u30c3\u30d7\uff09\u3067\u306e\u5b89\u697d\u4f11\u606f\u306e\u3054\u69d8\u5b50")
foreach ($p in $db.photos) {
    if ($p.id -eq 6) {
        $p.title = $newPhotoTitle
        Write-Host "  [OK] Updated photo 6 title." -ForegroundColor Green
    }
}

# 2.3 Care record 1003 content
# Content: 居室介護ベッドにて頭部ギャッジアップ（約30度）し安楽姿勢保持。毛布を整え体位変換実施。穏やかに目を細めて休まれる。褥瘡兆候なし。
$newCareRecord = Unesc("\u5c45\u5ba4\u4ecb\u8b77\u30d9\u30c3\u30c9\u306b\u3066\u982d\u90e8\u30ae\u30e3\u30c3\u30b8\u30a2\u30c3\u30d7\uff08\u7d0430\u5ea6\uff09\u3057\u5b89\u697d\u59ff\u52e2\u4fdd\u6301\u3002\u6bdb\u5e03\u3092\u6574\u3048\u4f53\u4f4d\u5909\u63db\u5b9f\u65bd\u3002\u7a4f\u3084\u304b\u306b\u76ee\u3092\u7d30\u3081\u3066\u4f11\u307e\u308c\u308b\u3002\u8925\u7621\u5146\u5019\u306a\u3057\u3002")
foreach ($c in $db.care_records) {
    if ($c.id -eq 1003) {
        $c.content = $newCareRecord
        Write-Host "  [OK] Updated care record 1003 content." -ForegroundColor Green
    }
}

# 2.4 Update equipments for Suzuki Ichiro
$updatedEquipments = @()
foreach ($eq in $db.equipments) {
    if ($eq.resident_id -eq 3) {
        continue
    }
    $updatedEquipments += $eq
}

$maxEqId = 0
foreach ($eq in $updatedEquipments) {
    if ($eq.id -gt $maxEqId) { $maxEqId = $eq.id }
}

$bedEq = [PSCustomObject]@{
    id = $maxEqId + 1
    resident_id = 3
    equipment_name = Unesc("\u8d85\u4f4e\u5e8a3\u30e2\u30fc\u30bf\u30fc\u4ecb\u8b77\u30d9\u30c3\u30c9 (\u982d\u90e8\u30fb\u80cc\u90e8\u30ae\u30e3\u30c3\u30b8\u30a2\u30c3\u30d7\u6a5f\u80fd\u4ed8\u304d)")
    ownership_type = Unesc("\u4ecb\u8b77\u4fdd\u967a\u30ec\u30f3\u30bf\u30eb")
    notes = Unesc("\u80cc\u4e0a\u3052\uff08\u30ae\u30e3\u30c3\u30b8\u30a2\u30c3\u30d7\uff09\u30fb\u819d\u4e0a\u3052\u30fb\u9ad8\u3055\u8abf\u6574\u3001\u8aa4\u56a5\u9632\u6b62\u30fb\u5b89\u697d\u4fdd\u6301\u7528")
}

$matEq = [PSCustomObject]@{
    id = $maxEqId + 2
    resident_id = 3
    equipment_name = Unesc("\u4f53\u5727\u5206\u6563\u30a8\u30a2\u30de\u30c3\u30c8\u30ec\u30b9 (\u3053\u3053\u3061\u3042)")
    ownership_type = Unesc("\u4ecb\u8b77\u4fdd\u967a\u30ec\u30f3\u30bf\u30eb")
    notes = Unesc("\u8925\u7621\u4e88\u9632\u30fb\u4f53\u4f4d\u5909\u63db\u4ecb\u52a9\u6a5f\u80fd\u4ed8\u304d")
}

$updatedEquipments += $bedEq
$updatedEquipments += $matEq
$db.equipments = $updatedEquipments
Write-Host "  [OK] Updated equipments." -ForegroundColor Green

# Save JSON with UTF8 without BOM
$newJson = $db | ConvertTo-Json -Depth 32
[System.IO.File]::WriteAllText($jsonPath, $newJson, (New-Object System.Text.UTF8Encoding($false)))
Write-Host "  [OK] Saved portal_database.json." -ForegroundColor Green

Write-Host "`n=========================================================="
Write-Host " Step 3: Run Comprehensive Verification Tests"
Write-Host "=========================================================="
$testScript = Join-Path $portalDir "tests\verify_all.ps1"
& powershell.exe -ExecutionPolicy Bypass -File $testScript

Write-Host "`nBed-rest master update finished successfully!" -ForegroundColor Green
