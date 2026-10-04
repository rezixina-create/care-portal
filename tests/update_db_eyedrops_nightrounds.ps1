# Update Database with Eyedrop Orders and Full Individual Night Rounds
$ErrorActionPreference = "Stop"

$dbFile = "data/portal_database.json"
if (-not (Test-Path $dbFile)) {
    Write-Host "[FAIL] data/portal_database.json not found" -ForegroundColor Red
    exit 1
}

$json = [System.IO.File]::ReadAllText($dbFile, [System.Text.Encoding]::UTF8)
$db = $json | ConvertFrom-Json

# 1. Add / Update eyedrop_orders
$eyedropOrders = @(
    [PSCustomObject]@{
        id = 1
        resident_id = 1
        eye = "右のみ"
        medicine_name = "キサラタン点眼液 0.005%"
        timing_slots = @("眠前")
        dosage = "1回1滴"
        doctor_name = "さくら眼科クリニック"
        notes = "緑内障治療。就寝前に右眼へ1滴点眼。点眼後しばらく目を閉じ涙嚢部を軽く圧迫。"
        status = "継続中"
        updated_at = "2026-10-01"
    },
    [PSCustomObject]@{
        id = 2
        resident_id = 2
        eye = "両眼"
        medicine_name = "ヒアレイン点眼液 0.1%"
        timing_slots = @("朝", "昼", "夕")
        dosage = "1回1滴"
        doctor_name = "中央眼科医院"
        notes = "角結膜上皮障害・ドライアイ。朝食後・昼食後・夕食後に両眼へ各1滴点眼。"
        status = "継続中"
        updated_at = "2026-10-01"
    },
    [PSCustomObject]@{
        id = 3
        resident_id = 3
        eye = "左のみ"
        medicine_name = "サンコバ点眼液 0.02%"
        timing_slots = @("朝", "夕")
        dosage = "1回1滴"
        doctor_name = "さくら眼科クリニック"
        notes = "調節機能改善・眼精疲労。朝食後・夕食後に左眼のみ1滴点眼。"
        status = "継続中"
        updated_at = "2026-10-01"
    },
    [PSCustomObject]@{
        id = 4
        resident_id = 4
        eye = "両眼"
        medicine_name = "クラビット点眼液 1.5%"
        timing_slots = @("朝", "昼", "夕")
        dosage = "1回1滴"
        doctor_name = "総合病院眼科"
        notes = "結膜炎・角膜感染症予防。朝食後・昼食後・夕食後に両眼へ各1滴点眼。容器先端がまつ毛に触れないよう清潔操作。"
        status = "継続中"
        updated_at = "2026-10-01"
    }
)
$db | Add-Member -NotePropertyName "eyedrop_orders" -NotePropertyValue $eyedropOrders -Force

# 2. Update turns for 2026-10-03
if (-not $db.turns) { $db | Add-Member -NotePropertyName "turns" -NotePropertyValue @() -Force }
$existingTurns = @($db.turns | Where-Object { $_.date -ne "2026-10-03" })

$nightTurns20261003 = @(
    # Resident 1 (Sato)
    [PSCustomObject]@{ id = 200101; date = "2026-10-03"; time = "22:00"; resident_id = 1; action = "安眠中"; staff_name = "山田 孝之" },
    [PSCustomObject]@{ id = 200102; date = "2026-10-03"; time = "00:00"; resident_id = 1; action = "左側臥位"; staff_name = "山田 孝之" },
    [PSCustomObject]@{ id = 200103; date = "2026-10-03"; time = "02:00"; resident_id = 1; action = "右側臥位"; staff_name = "山田 孝之" },
    [PSCustomObject]@{ id = 200104; date = "2026-10-03"; time = "04:00"; resident_id = 1; action = "仰臥位"; staff_name = "山田 孝之" },
    [PSCustomObject]@{ id = 200105; date = "2026-10-03"; time = "06:00"; resident_id = 1; action = "安眠中"; staff_name = "山田 孝之" },

    # Resident 2 (Tanaka)
    [PSCustomObject]@{ id = 200201; date = "2026-10-03"; time = "22:00"; resident_id = 2; action = "安眠中"; staff_name = "山田 孝之" },
    [PSCustomObject]@{ id = 200202; date = "2026-10-03"; time = "00:00"; resident_id = 2; action = "安眠中"; staff_name = "山田 孝之" },
    [PSCustomObject]@{ id = 200203; date = "2026-10-03"; time = "02:00"; resident_id = 2; action = "安眠中"; staff_name = "山田 孝之" },
    [PSCustomObject]@{ id = 200204; date = "2026-10-03"; time = "04:00"; resident_id = 2; action = "おむつ交換"; staff_name = "山田 孝之" },
    [PSCustomObject]@{ id = 200205; date = "2026-10-03"; time = "06:00"; resident_id = 2; action = "安眠中"; staff_name = "山田 孝之" },

    # Resident 3 (Suzuki)
    [PSCustomObject]@{ id = 200301; date = "2026-10-03"; time = "22:00"; resident_id = 3; action = "安眠中"; staff_name = "山田 孝之" },
    [PSCustomObject]@{ id = 200302; date = "2026-10-03"; time = "00:00"; resident_id = 3; action = "左側臥位"; staff_name = "山田 孝之" },
    [PSCustomObject]@{ id = 200303; date = "2026-10-03"; time = "02:00"; resident_id = 3; action = "右側臥位"; staff_name = "山田 孝之" },
    [PSCustomObject]@{ id = 200304; date = "2026-10-03"; time = "04:00"; resident_id = 3; action = "左側臥位"; staff_name = "山田 孝之" },
    [PSCustomObject]@{ id = 200305; date = "2026-10-03"; time = "06:00"; resident_id = 3; action = "仰臥位"; staff_name = "山田 孝之" },

    # Resident 4 (Takahashi)
    [PSCustomObject]@{ id = 200401; date = "2026-10-03"; time = "22:00"; resident_id = 4; action = "安眠中"; staff_name = "山田 孝之" },
    [PSCustomObject]@{ id = 200402; date = "2026-10-03"; time = "00:00"; resident_id = 4; action = "安眠中"; staff_name = "山田 孝之" },
    [PSCustomObject]@{ id = 200403; date = "2026-10-03"; time = "02:00"; resident_id = 4; action = "安眠中"; staff_name = "山田 孝之" },
    [PSCustomObject]@{ id = 200404; date = "2026-10-03"; time = "04:00"; resident_id = 4; action = "安眠中"; staff_name = "山田 孝之" },
    [PSCustomObject]@{ id = 200405; date = "2026-10-03"; time = "06:00"; resident_id = 4; action = "安眠中"; staff_name = "山田 孝之" }
)
$db.turns = $existingTurns + $nightTurns20261003

# 3. Update meds for 2026-10-03
if (-not $db.meds) { $db | Add-Member -NotePropertyName "meds" -NotePropertyValue @() -Force }
$existingMeds = @($db.meds | Where-Object { -not ($_.date -eq "2026-10-03" -and $_.slot -like "点眼*") })

$eyedropMeds20261003 = @(
    [PSCustomObject]@{ id = 300101; date = "2026-10-03"; slot = "点眼(眠前)"; resident_id = 1; status = "済"; staff_name = "山田 孝之"; eye = "右のみ"; medicine_name = "キサラタン点眼液 0.005%" },
    [PSCustomObject]@{ id = 300201; date = "2026-10-03"; slot = "点眼(朝)"; resident_id = 2; status = "済"; staff_name = "松田 健二"; eye = "両眼"; medicine_name = "ヒアレイン点眼液 0.1%" },
    [PSCustomObject]@{ id = 300202; date = "2026-10-03"; slot = "点眼(昼)"; resident_id = 2; status = "済"; staff_name = "中村 大輔"; eye = "両眼"; medicine_name = "ヒアレイン点眼液 0.1%" },
    [PSCustomObject]@{ id = 300203; date = "2026-10-03"; slot = "点眼(夕)"; resident_id = 2; status = "済"; staff_name = "山田 孝之"; eye = "両眼"; medicine_name = "ヒアレイン点眼液 0.1%" },
    [PSCustomObject]@{ id = 300301; date = "2026-10-03"; slot = "点眼(朝)"; resident_id = 3; status = "済"; staff_name = "松田 健二"; eye = "左のみ"; medicine_name = "サンコバ点眼液 0.02%" },
    [PSCustomObject]@{ id = 300302; date = "2026-10-03"; slot = "点眼(夕)"; resident_id = 3; status = "済"; staff_name = "山田 孝之"; eye = "左のみ"; medicine_name = "サンコバ点眼液 0.02%" },
    [PSCustomObject]@{ id = 300401; date = "2026-10-03"; slot = "点眼(朝)"; resident_id = 4; status = "済"; staff_name = "松田 健二"; eye = "両眼"; medicine_name = "クラビット点眼液 1.5%" },
    [PSCustomObject]@{ id = 300402; date = "2026-10-03"; slot = "点眼(昼)"; resident_id = 4; status = "済"; staff_name = "中村 大輔"; eye = "両眼"; medicine_name = "クラビット点眼液 1.5%" },
    [PSCustomObject]@{ id = 300403; date = "2026-10-03"; slot = "点眼(夕)"; resident_id = 4; status = "済"; staff_name = "山田 孝之"; eye = "両眼"; medicine_name = "クラビット点眼液 1.5%" }
)
$db.meds = $existingMeds + $eyedropMeds20261003

# 4. Update care_records: replace sparse 2026-10-03 rounds with individual records for all 4 residents
$filteredCareRecords = @($db.care_records | Where-Object {
    -not ($_.category -eq "巡視" -and $_.recorded_at -like "2026-10-03*")
})

$newRoundsRecords = @(
    # Sato 1
    [PSCustomObject]@{ id = 400101; recorded_at = "2026-10-03 22:00"; resident_id = 1; category = "巡視"; content = "【22:00 定時巡視】訪室確認。静かに安眠中、呼吸状態安定。掛物の乱れを整え、ナースコールを手元に確認。異常なし。"; staff_name = "山田 孝之" },
    [PSCustomObject]@{ id = 400102; recorded_at = "2026-10-03 00:00"; resident_id = 1; category = "巡視"; content = "【00:00 定時巡視・体位変換】訪室確認。仰臥位から左側臥位へ体位変換実施。仙骨部除圧クッションを背部・膝間に挿入。良肢位保持、寝具を整える。"; staff_name = "山田 孝之" },
    [PSCustomObject]@{ id = 400103; recorded_at = "2026-10-03 02:00"; resident_id = 1; category = "巡視"; content = "【02:00 定時巡視・体位変換】訪室確認。左側臥位から右側臥位へ体位変換実施。右片麻痺側の負担を軽減し安楽な姿勢を保持。呼吸落ち着き安眠継続。"; staff_name = "山田 孝之" },
    [PSCustomObject]@{ id = 400104; recorded_at = "2026-10-03 04:00"; resident_id = 1; category = "巡視"; content = "【04:00 定時巡視・体位変換】訪室確認。右側臥位から仰臥位へ体位変換実施。背部・仙骨部の皮膚状態確認（発赤悪化なし）。膝下クッション配置。"; staff_name = "山田 孝之" },
    [PSCustomObject]@{ id = 400105; recorded_at = "2026-10-03 06:00"; resident_id = 1; category = "巡視"; content = "【06:00 定時巡視】起床前訪室。覚醒傾向あり。バイタル異常なし。挨拶を交わす。"; staff_name = "山田 孝之" },

    # Tanaka 2
    [PSCustomObject]@{ id = 400201; recorded_at = "2026-10-03 22:00"; resident_id = 2; category = "巡視"; content = "【22:00 定時巡視】訪室確認。入眠良好、呼吸穏やか。室温・換気状態確認。"; staff_name = "山田 孝之" },
    [PSCustomObject]@{ id = 400202; recorded_at = "2026-10-03 00:00"; resident_id = 2; category = "巡視"; content = "【00:00 定時巡視】訪室確認。静かに安眠中。ナースコール配置よし。"; staff_name = "山田 孝之" },
    [PSCustomObject]@{ id = 400203; recorded_at = "2026-10-03 02:00"; resident_id = 2; category = "巡視"; content = "【02:00 定時巡視】訪室確認。良眠継続。足元の冷え訴えなく毛布調整。"; staff_name = "山田 孝之" },
    [PSCustomObject]@{ id = 400204; recorded_at = "2026-10-03 04:00"; resident_id = 2; category = "巡視"; content = "【04:00 定時巡視・おむつ交換】訪室確認。おむつ汚染（排尿中量）確認しパッド交換実施。陰部清拭、皮膚保護処置。再入眠促す。"; staff_name = "山田 孝之" },
    [PSCustomObject]@{ id = 400205; recorded_at = "2026-10-03 06:00"; resident_id = 2; category = "巡視"; content = "【06:00 定時巡視】起床時巡視。穏やかに覚醒される。朝の体調伺い、異常なし。"; staff_name = "山田 孝之" },

    # Suzuki 3
    [PSCustomObject]@{ id = 400301; recorded_at = "2026-10-03 22:00"; resident_id = 3; category = "巡視"; content = "【22:00 定時巡視】訪室確認。安眠中。エアマット作動良好、左片麻痺側の拘縮・圧迫なし。"; staff_name = "山田 孝之" },
    [PSCustomObject]@{ id = 400302; recorded_at = "2026-10-03 00:00"; resident_id = 3; category = "巡視"; content = "【00:00 定時巡視・体位変換】訪室確認。仰臥位から左側臥位へ体位変換実施。除圧クッション配置。仙骨部発赤なし。"; staff_name = "山田 孝之" },
    [PSCustomObject]@{ id = 400303; recorded_at = "2026-10-03 02:00"; resident_id = 3; category = "巡視"; content = "【02:00 定時巡視・体位変換】訪室確認。左側臥位から右側臥位へ体位変換実施。体位保持クッション調整。寝息整い安眠。"; staff_name = "山田 孝之" },
    [PSCustomObject]@{ id = 400304; recorded_at = "2026-10-03 04:00"; resident_id = 3; category = "巡視"; content = "【04:00 定時巡視・体位変換】訪室確認。右側臥位から左側臥位へ体位変換実施。オムツ汚染なし。皮膚乾燥部確認。"; staff_name = "山田 孝之" },
    [PSCustomObject]@{ id = 400305; recorded_at = "2026-10-03 06:00"; resident_id = 3; category = "巡視"; content = "【06:00 定時巡視・体位変換】訪室確認。左側臥位から仰臥位へ体位変換。覚醒傾向。小声での挨拶あり、全身状態安定。"; staff_name = "山田 孝之" },

    # Takahashi 4
    [PSCustomObject]@{ id = 400401; recorded_at = "2026-10-03 22:00"; resident_id = 4; category = "巡視"; content = "【22:00 定時巡視】訪室確認。静かに熟眠中。手元のコールボタン位置確認。"; staff_name = "山田 孝之" },
    [PSCustomObject]@{ id = 400402; recorded_at = "2026-10-03 00:00"; resident_id = 4; category = "巡視"; content = "【00:00 定時巡視】訪室確認。安眠継続。寝相の乱れなく安定。"; staff_name = "山田 孝之" },
    [PSCustomObject]@{ id = 400403; recorded_at = "2026-10-03 02:00"; resident_id = 4; category = "巡視"; content = "【02:00 定時巡視】訪室確認。良眠中。呼吸リズム整い異常なし。"; staff_name = "山田 孝之" },
    [PSCustomObject]@{ id = 400404; recorded_at = "2026-10-03 04:00"; resident_id = 4; category = "巡視"; content = "【04:00 定時巡視】訪室確認。安眠中。掛物を整え保温を図る。"; staff_name = "山田 孝之" },
    [PSCustomObject]@{ id = 400405; recorded_at = "2026-10-03 06:00"; resident_id = 4; category = "巡視"; content = "【06:00 定時巡視】起床前巡視。覚醒良好、笑顔で挨拶を返される。"; staff_name = "山田 孝之" }
)

$db.care_records = $newRoundsRecords + $filteredCareRecords

$newJson = $db | ConvertTo-Json -Depth 10
[System.IO.File]::WriteAllText($dbFile, $newJson, [System.Text.Encoding]::UTF8)

Write-Host "[PASS] Successfully updated portal_database.json with eyedrop orders and individual night rounds" -ForegroundColor Green
