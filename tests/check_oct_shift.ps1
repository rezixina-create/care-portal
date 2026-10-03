$json = Get-Content -Raw -Encoding UTF8 "$PSScriptRoot\..\data\portal_database.json" | ConvertFrom-Json
$shiftOct = $json.monthly_shifts.'2026-10'
if (-not $shiftOct) {
    Write-Host "No 2026-10 shift data in portal_database.json"
    exit 0
}

$cEarly = [string][char]0x65e9
$cLate  = [string][char]0x9045
$cNight = [string][char]0x591c
$cAke   = [string][char]0x660e
$cOff   = [string][char]0x4f11
$cDay   = [string][char]0x65e5

Write-Host "Daily counts in 2026-10:"
for ($d = 1; $d -le 31; $d++) {
    $early = 0
    $late = 0
    $night = 0
    $dayShift = 0
    $dayCare = 0
    $off = 0
    $ake = 0
    
    foreach ($p in $shiftOct.PSObject.Properties) {
        $val = $p.Value."$d"
        $name = $p.Name
        $role = "care"
        foreach ($st in $json.stamps) {
            if ($st.name -eq $name) {
                if ($st.role -notmatch "介護") { $role = "other" }
                break
            }
        }
        
        if ($val -eq $cEarly) { $early++ }
        elseif ($val -eq $cLate) { $late++ }
        elseif ($val -eq $cNight) { $night++ }
        elseif ($val -eq $cAke) { $ake++ }
        elseif ($val -eq $cOff) { $off++ }
        elseif ($val -eq $cDay) {
            $dayShift++
            if ($role -eq "care") { $dayCare++ }
        }
    }
    Write-Host "Day $d : 早=$early, 遅=$late, 夜=$night, 介護日=$dayCare, 総日=$dayShift, 明=$ake, 休=$off"
}
