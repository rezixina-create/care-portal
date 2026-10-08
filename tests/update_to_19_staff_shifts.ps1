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

$nameNomura = (-join [char[]]@(0x91ce, 0x6751, 0x0020, 0x62d3, 0x6d77)) # Nomura Takumi
$nameMatsuda = (-join [char[]]@(0x677e, 0x7530, 0x0020, 0x5065, 0x4e8c)) # Matsuda Kenji
$nameIshikawa = (-join [char[]]@(0x77f3, 0x5ddd, 0x0020, 0x592a, 0x967d)) # Ishikawa Taiyo
$nameInoue = (-join [char[]]@(0x4e95, 0x4e0a, 0x0020, 0x84ee)) # Inoue Ren
$roleCare = (-join [char[]]@(0x4ecb, 0x8b77, 0x8077, 0x54e1)) # Kaigo Shokuin
$nameSato = (-join [char[]]@(0x4f50, 0x85e4, 0x0020, 0x5065, 0x592a)) # Sato Kenta
$nameTakahashi = (-join [char[]]@(0x9ad8, 0x6a4b, 0x0020, 0x76f4, 0x6a39)) # Takahashi Naoki

# 1. Staff setup (19 staff total: 1 director, 2 nurses, 2 office, 14 care)
$staffNames = @($db.stamps | ForEach-Object { $_.name })

$newStaff = @(
    [PSCustomObject]@{ name = $nameNomura; role = $roleCare },
    [PSCustomObject]@{ name = $nameMatsuda; role = $roleCare },
    [PSCustomObject]@{ name = $nameIshikawa; role = $roleCare },
    [PSCustomObject]@{ name = $nameInoue; role = $roleCare }
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
    if ($r -match [char]0x7ba1 -or $r -match [char]0x65bd) {
        $directors += $n
    } elseif ($r -match [char]0x4e8b) {
        $office += $n
    } elseif ($r -match [char]0x770b) {
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

# Director
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

# Office
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

# Nurses
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

# Care staff (14)
foreach ($cName in $care) {
    $shifts202610[$cName] = [ordered]@{}
}

$nightCounts = @{}
$earlyCounts = @{}
$lateCounts = @{}
$dayCounts = @{}
$holidayCounts = @{}
foreach ($cName in $care) {
    $nightCounts[$cName] = 0
    $earlyCounts[$cName] = 0
    $lateCounts[$cName] = 0
    $dayCounts[$cName] = 0
    $holidayCounts[$cName] = 0
}

# Initial Day 1 Ake (carried over from previous month night shift: 2 staff)
$prevNightStaff = @($care[$care.Count - 2], $care[$care.Count - 1])
foreach ($pn in $prevNightStaff) {
    $shifts202610[$pn]["1"] = $cAke
}

# Step A: Night shifts (2 daily)
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

# Step B: Holidays (4 daily, 8-9 per staff)
$targetHolidays = @{}
$baseHols = [Math]::Floor(($daysInMonth * 4) / $care.Count)
$extraHols = ($daysInMonth * 4) % $care.Count
for ($idx = 0; $idx -lt $care.Count; $idx++) {
    $cName = $care[$idx]
    $add = 0
    if ($idx -lt $extraHols) { $add = 1 }
    $targetHolidays[$cName] = $baseHols + $add
}

for ($d = 1; $d -le $daysInMonth; $d++) {
    $dailyHols = 0
    foreach ($cName in $care) {
        if (-not $shifts202610[$cName]["$d"]) {
            if ($d -gt 1 -and $shifts202610[$cName]["$($d-1)"] -eq $cAke -and $holidayCounts[$cName] -lt $targetHolidays[$cName] -and $dailyHols -lt 4) {
                $shifts202610[$cName]["$d"] = $cOff
                $holidayCounts[$cName]++
                $dailyHols++
            }
        }
    }
    
    $sortedHols = @($care | Sort-Object { $holidayCounts[$_] })
    foreach ($cName in $sortedHols) {
        if (-not $shifts202610[$cName]["$d"] -and $holidayCounts[$cName] -lt $targetHolidays[$cName] -and $dailyHols -lt 4) {
            $shifts202610[$cName]["$d"] = $cOff
            $holidayCounts[$cName]++
            $dailyHols++
        }
    }
    
    while ($dailyHols -lt 4) {
        $unassigned = @($care | Where-Object { -not $shifts202610[$_]["$d"] } | Sort-Object { $holidayCounts[$_] })
        if ($unassigned.Count -gt 0) {
            $pick = $unassigned[0]
            $shifts202610[$pick]["$d"] = $cOff
            $holidayCounts[$pick]++
            $dailyHols++
        } else {
            break
        }
    }
}

# Step C: Early 2, Late 2, Day 2
for ($d = 1; $d -le $daysInMonth; $d++) {
    $avail = @($care | Where-Object { -not $shifts202610[$_]["$d"] })
    
    # Early 2
    $earlyCand = @($avail | Sort-Object {
        $prevLate = 0
        if ($d -gt 1 -and $shifts202610[$_]["$($d-1)"] -eq $cLate) { $prevLate = 1 }
        "$prevLate-$($earlyCounts[$_])"
    })
    $pickedEarly = @($earlyCand[0], $earlyCand[1])
    foreach ($p in $pickedEarly) {
        $shifts202610[$p]["$d"] = $cEarly
        $earlyCounts[$p]++
    }
    
    # Late 2
    $lateCand = @($avail | Where-Object { $pickedEarly -notcontains $_ } | Sort-Object { $lateCounts[$_] })
    $pickedLate = @($lateCand[0], $lateCand[1])
    foreach ($p in $pickedLate) {
        $shifts202610[$p]["$d"] = $cLate
        $lateCounts[$p]++
    }
    
    # Day 2
    $rem = @($avail | Where-Object { $pickedEarly -notcontains $_ -and $pickedLate -notcontains $_ })
    foreach ($rName in $rem) {
        $shifts202610[$rName]["$d"] = $cDay
        $dayCounts[$rName]++
    }
}

# Step D: Auto repair
for ($d = 1; $d -le $daysInMonth; $d++) {
    $e = @($care | Where-Object { $shifts202610[$_]["$d"] -eq $cEarly }).Count
    $l = @($care | Where-Object { $shifts202610[$_]["$d"] -eq $cLate }).Count
    $dc = @($care | Where-Object { $shifts202610[$_]["$d"] -eq $cDay }).Count
    
    while ($e -lt 2) {
        $cand = ($care | Where-Object { $shifts202610[$_]["$d"] -eq $cDay })[0]
        if ($cand) { $shifts202610[$cand]["$d"] = $cEarly; $e++; $dc-- } else { break }
    }
    while ($l -lt 2) {
        $cand = ($care | Where-Object { $shifts202610[$_]["$d"] -eq $cDay })[0]
        if ($cand) { $shifts202610[$cand]["$d"] = $cLate; $l++; $dc-- } else { break }
    }
    while ($dc -lt 2) {
        $cand = ($care | Where-Object { $shifts202610[$_]["$d"] -eq $cOff })[0]
        if ($cand) { $shifts202610[$cand]["$d"] = $cDay; $dc++ } else { break }
    }
}

# Verification
Write-Host "Verification of generated shifts:"
$allValid = $true
for ($d = 1; $d -le $daysInMonth; $d++) {
    $e = @($care | Where-Object { $shifts202610[$_]["$d"] -eq $cEarly }).Count
    $l = @($care | Where-Object { $shifts202610[$_]["$d"] -eq $cLate }).Count
    $n = @($care | Where-Object { $shifts202610[$_]["$d"] -eq $cNight }).Count
    $a = @($care | Where-Object { $shifts202610[$_]["$d"] -eq $cAke }).Count
    $dc = @($care | Where-Object { $shifts202610[$_]["$d"] -eq $cDay }).Count
    $h = @($care | Where-Object { $shifts202610[$_]["$d"] -eq $cOff }).Count
    
    if ($e -ne 2 -or $l -ne 2 -or $n -ne 2 -or $a -ne 2 -or $dc -ne 2 -or $h -ne 4) {
        Write-Host "Day $d INVALID: Early=$e, Late=$l, Day=$dc, Night=$n, Ake=$a, Off=$h"
        $allValid = $false
    }
}

if ($allValid) {
    Write-Host "ALL 31 DAYS PERFECT! Care Staff: Early=2, Late=2, Day=2, Night=2, Ake=2, Off=4 EVERY DAY!"
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
