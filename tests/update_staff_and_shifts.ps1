$ErrorActionPreference = "Stop"
$dbPath = "$PSScriptRoot\..\data\portal_database.json"
$content = Get-Content -Raw -Encoding UTF8 $dbPath
$db = $content | ConvertFrom-Json

$cEarly = [string][char]0x65e9
$cLate  = [string][char]0x9045
$cNight = [string][char]0x591c
$cAke   = [string][char]0x660e
$cOff   = [string][char]0x4f11
$cDay   = [string][char]0x65e5

$nameNomura = (-join [char[]]@(0x91ce, 0x6751, 0x0020, 0x62d3, 0x6d77)) # 野村 拓海
$nameMatsuda = (-join [char[]]@(0x677e, 0x7530, 0x0020, 0x5065, 0x4e8c)) # 松田 健二
$roleCare = (-join [char[]]@(0x4ecb, 0x8b77, 0x8077, 0x54e1)) # 介護職員
$nameSato = (-join [char[]]@(0x4f50, 0x85e4, 0x0020, 0x5065, 0x592a)) # 佐藤 健太
$nameTakahashi = (-join [char[]]@(0x9ad8, 0x6a4b, 0x0020, 0x76f4, 0x6a39)) # 高橋 直樹

# 1. Staff setup
$staffNames = @($db.stamps | ForEach-Object { $_.name })

$newStaff = @(
    [PSCustomObject]@{ name = $nameNomura; role = $roleCare },
    [PSCustomObject]@{ name = $nameMatsuda; role = $roleCare }
)

foreach ($ns in $newStaff) {
    if ($staffNames -notcontains $ns.name) {
        $db.stamps += $ns
        Write-Host "Added new staff: $($ns.name)"
    }
}

Write-Host "Total staff count: $($db.stamps.Count)"

$year = 2026
$month = 10
$daysInMonth = 31

$directors = @()
$office = @()
$nurses = @()
$care = @()

foreach ($s in $db.stamps) {
    $n = $s.name
    $r = $s.role
    # Strict matching based on role
    if ($r -match [char]0x7ba1 -or $r -match [char]0x65bd) { # 管理者 or 施設長
        $directors += $n
    } elseif ($r -match [char]0x4e8b) { # 事務
        $office += $n
    } elseif ($r -match [char]0x770b) { # 看護
        $nurses += $n
    } else {
        $care += $n
    }
}

Write-Host "Director count: $($directors.Count)"
Write-Host "Office staff count: $($office.Count)"
Write-Host "Nurse count: $($nurses.Count)"
Write-Host "Care staff count: $($care.Count)"

$shifts202610 = [ordered]@{}

# Director: 土日祝は休、平日は日
foreach ($dName in $directors) {
    $obj = [ordered]@{}
    for ($d = 1; $d -le $daysInMonth; $d++) {
        $dt = Get-Date -Year $year -Month $month -Day $d
        $dow = [int]$dt.DayOfWeek
        if ($dow -eq 0 -or $dow -eq 6 -or $d -eq 12) {
            $obj["$d"] = $cOff
        } else {
            $obj["$d"] = $cDay
        }
    }
    $shifts202610[$dName] = $obj
}

# Office: 土日祝は休、平日は日
foreach ($oName in $office) {
    $obj = [ordered]@{}
    for ($d = 1; $d -le $daysInMonth; $d++) {
        $dt = Get-Date -Year $year -Month $month -Day $d
        $dow = [int]$dt.DayOfWeek
        if ($dow -eq 0 -or $dow -eq 6 -or $d -eq 12) {
            $obj["$d"] = $cOff
        } else {
            $obj["$d"] = $cDay
        }
    }
    $shifts202610[$oName] = $obj
}

# Nurses: 相互カバーで週休2日
for ($i = 0; $i -lt $nurses.Count; $i++) {
    $nName = $nurses[$i]
    $obj = [ordered]@{}
    for ($d = 1; $d -le $daysInMonth; $d++) {
        $dt = Get-Date -Year $year -Month $month -Day $d
        $dow = [int]$dt.DayOfWeek
        if ($i -eq 0) {
            if ($dow -eq 0 -or $dow -eq 3) { $obj["$d"] = $cOff } else { $obj["$d"] = $cDay }
        } else {
            if ($dow -eq 4 -or $dow -eq 6) { $obj["$d"] = $cOff } else { $obj["$d"] = $cDay }
        }
    }
    $shifts202610[$nName] = $obj
}

# Care staff (12名)
foreach ($cName in $care) {
    $shifts202610[$cName] = [ordered]@{}
}

$nightCounts = @{}
$earlyCounts = @{}
$lateCounts = @{}
$holidayCounts = @{}
foreach ($cName in $care) {
    $nightCounts[$cName] = 0
    $earlyCounts[$cName] = 0
    $lateCounts[$cName] = 0
    $holidayCounts[$cName] = 0
}

# Step A: 毎日夜勤2名 (連夜勤なし、NGペア回避)
for ($d = 1; $d -le $daysInMonth; $d++) {
    $candidates = @($care | Where-Object {
        if ($d -gt 1 -and $shifts202610[$_]["$($d-1)"] -eq $cNight) { return $false }
        return $true
    })
    
    $sortedCand = @($candidates | Sort-Object { $nightCounts[$_] })
    
    $c1 = $sortedCand[0]
    $c2 = $null
    for ($k = 1; $k -lt $sortedCand.Count; $k++) {
        $cand = $sortedCand[$k]
        if (($c1 -eq $nameSato -and $cand -eq $nameTakahashi) -or ($c1 -eq $nameTakahashi -and $cand -eq $nameSato)) {
            continue
        }
        $c2 = $cand
        break
    }
    if (-not $c2) { $c2 = $sortedCand[1] }
    
    $shifts202610[$c1]["$d"] = $cNight
    $shifts202610[$c2]["$d"] = $cNight
    $nightCounts[$c1]++
    $nightCounts[$c2]++
    
    if ($d + 1 -le $daysInMonth) {
        $shifts202610[$c1]["$($d+1)"] = $cAke
        $shifts202610[$c2]["$($d+1)"] = $cAke
    }
}

# Step B: 公休配分 (月9日目標、1日最大3〜4名)
$targetHolidays = 9
for ($d = 1; $d -le $daysInMonth; $d++) {
    $dailyHols = 0
    # 優先: 明けの翌日
    foreach ($cName in $care) {
        if (-not $shifts202610[$cName]["$d"]) {
            if ($d -gt 1 -and $shifts202610[$cName]["$($d-1)"] -eq $cAke -and $holidayCounts[$cName] -lt $targetHolidays -and $dailyHols -lt 4) {
                $shifts202610[$cName]["$d"] = $cOff
                $holidayCounts[$cName]++
                $dailyHols++
            }
        }
    }
    
    # バランス配分
    $sortedHols = @($care | Sort-Object { $holidayCounts[$_] })
    foreach ($cName in $sortedHols) {
        if (-not $shifts202610[$cName]["$d"] -and $holidayCounts[$cName] -lt $targetHolidays -and $dailyHols -lt 4) {
            $remAvail = @($care | Where-Object { -not $shifts202610[$_]["$d"] -and $_ -ne $cName }).Count
            if ($remAvail -ge 3) {
                $shifts202610[$cName]["$d"] = $cOff
                $holidayCounts[$cName]++
                $dailyHols++
            }
        }
    }
}

# 未達者に公休充当
foreach ($cName in $care) {
    while ($holidayCounts[$cName] -lt $targetHolidays) {
        $found = $false
        for ($d = 1; $d -le $daysInMonth; $d++) {
            if (-not $shifts202610[$cName]["$d"]) {
                $remAvail = @($care | Where-Object { -not $shifts202610[$_]["$d"] -and $_ -ne $cName }).Count
                if ($remAvail -ge 3) {
                    $shifts202610[$cName]["$d"] = $cOff
                    $holidayCounts[$cName]++
                    $found = $true
                    break
                }
            }
        }
        if (-not $found) { break }
    }
}

# Step C: 早出1名, 遅出1名, 残り全員「日」
for ($d = 1; $d -le $daysInMonth; $d++) {
    $avail = @($care | Where-Object { -not $shifts202610[$_]["$d"] })
    
    # 早出
    $earlyCand = @($avail | Sort-Object {
        $prevLate = 0
        if ($d -gt 1 -and $shifts202610[$_]["$($d-1)"] -eq $cLate) { $prevLate = 1 }
        "$prevLate-$($earlyCounts[$_])"
    })
    $pickedEarly = $earlyCand[0]
    if ($pickedEarly) {
        $shifts202610[$pickedEarly]["$d"] = $cEarly
        $earlyCounts[$pickedEarly]++
    }
    
    # 遅出
    $lateCand = @($avail | Where-Object { $_ -ne $pickedEarly } | Sort-Object { $lateCounts[$_] })
    $pickedLate = $lateCand[0]
    if ($pickedLate) {
        $shifts202610[$pickedLate]["$d"] = $cLate
        $lateCounts[$pickedLate]++
    }
    
    # 残り全員日勤
    $rem = @($avail | Where-Object { $_ -ne $pickedEarly -and $_ -ne $pickedLate })
    foreach ($rName in $rem) {
        $shifts202610[$rName]["$d"] = $cDay
    }
}

# Step D: 厳格バリデーション & オートリペア
for ($d = 1; $d -le $daysInMonth; $d++) {
    $e = @($care | Where-Object { $shifts202610[$_]["$d"] -eq $cEarly }).Count
    $l = @($care | Where-Object { $shifts202610[$_]["$d"] -eq $cLate }).Count
    $n = @($care | Where-Object { $shifts202610[$_]["$d"] -eq $cNight }).Count
    $dc = @($care | Where-Object { $shifts202610[$_]["$d"] -eq $cDay }).Count
    
    if ($e -eq 0) {
        $dayWorkers = @($care | Where-Object { $shifts202610[$_]["$d"] -eq $cDay })
        $cand = if ($dayWorkers.Count -gt 0) { $dayWorkers[0] } else { ($care | Where-Object { $shifts202610[$_]["$d"] -eq $cOff })[0] }
        if ($cand) { $shifts202610[$cand]["$d"] = $cEarly; $e++ }
    }
    if ($l -eq 0) {
        $dayWorkers = @($care | Where-Object { $shifts202610[$_]["$d"] -eq $cDay })
        $cand = if ($dayWorkers.Count -gt 0) { $dayWorkers[0] } else { ($care | Where-Object { $shifts202610[$_]["$d"] -eq $cOff })[0] }
        if ($cand) { $shifts202610[$cand]["$d"] = $cLate; $l++ }
    }
    if ($dc -eq 0) {
        $offWorkers = @($care | Where-Object { $shifts202610[$_]["$d"] -eq $cOff })
        $cand = if ($offWorkers.Count -gt 0) { $offWorkers[0] } else { $null }
        if ($cand) { $shifts202610[$cand]["$d"] = $cDay; $dc++ }
    }
}

# 検証
Write-Host "`nVerification of generated shifts:"
$allValid = $true
for ($d = 1; $d -le $daysInMonth; $d++) {
    $e = @($care | Where-Object { $shifts202610[$_]["$d"] -eq $cEarly }).Count
    $l = @($care | Where-Object { $shifts202610[$_]["$d"] -eq $cLate }).Count
    $n = @($care | Where-Object { $shifts202610[$_]["$d"] -eq $cNight }).Count
    $dc = @($care | Where-Object { $shifts202610[$_]["$d"] -eq $cDay }).Count
    if ($e -ne 1 -or $l -ne 1 -or $n -ne 2 -or $dc -lt 1) {
        Write-Host "Day $d INVALID: Early=$e, Late=$l, Night=$n, CareDay=$dc"
        $allValid = $false
    }
}

if ($allValid) {
    Write-Host "All 31 days PERFECT! Early=1, Late=1, Night=2, CareDay>=1 on ALL days!"
} else {
    throw "Validation failed!"
}

# Save to DB
if (-not $db.monthly_shifts) {
    $db | Add-Member -MemberType NoteProperty -Name "monthly_shifts" -Value ([PSCustomObject]@{})
}
$db.monthly_shifts.'2026-10' = $shifts202610

$jsonOut = $db | ConvertTo-Json -Depth 10 -Compress
[System.IO.File]::WriteAllText($dbPath, $jsonOut, [System.Text.Encoding]::UTF8)
Write-Host "Saved updated database to $dbPath successfully!"
