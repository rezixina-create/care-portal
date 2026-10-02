# Update Portal Database with September & October 1st Records & Photos
$ErrorActionPreference = "Stop"

$baseDir = Split-Path $PSScriptRoot -Parent
$dbPath = Join-Path $baseDir "data\portal_database.json"

# Load JSON safely
$jsonBytes = [System.IO.File]::ReadAllBytes($dbPath)
$jsonText = [System.Text.Encoding]::UTF8.GetString($jsonBytes).Trim()
if ($jsonText.StartsWith([char]0xFEFF)) { $jsonText = $jsonText.Substring(1) }
$db = $jsonText | ConvertFrom-Json

Write-Host "Updating Care Portal Database..."

# ==========================================
# 1. PHOTOS (8 items total, 2 per resident)
# ==========================================
$db.photos = @(
    # 1. 佐藤 太郎 様 (101号室)
    [PSCustomObject]@{
        id = 1
        resident_id = 1
        category = "documents"
        title = "介護サービス利用同意書 (佐藤太郎様原本)"
        url = "data/photos/documents/consent_sato.jpg"
        uploaded_at = "2026-10-01 19:40"
        uploader = "施設長"
    },
    [PSCustomObject]@{
        id = 2
        resident_id = 1
        category = "personal"
        title = "日常折り紙レクリエーションのご様子"
        url = "data/photos/personal/resident_sato_snap.jpg"
        uploaded_at = "2026-09-28 14:30"
        uploader = "山田"
    },
    # 2. 田中 ハナ 様 (102号室)
    [PSCustomObject]@{
        id = 3
        resident_id = 2
        category = "documents"
        title = "介護サービス利用同意書 (田中ハナ様原本)"
        url = "data/photos/documents/consent_tanaka.jpg"
        uploaded_at = "2026-10-01 19:40"
        uploader = "施設長"
    },
    [PSCustomObject]@{
        id = 4
        resident_id = 2
        category = "personal"
        title = "午前のお茶会・歓談でのご様子"
        url = "data/photos/personal/resident_tanaka_snap.jpg"
        uploaded_at = "2026-09-29 10:15"
        uploader = "佐藤"
    },
    # 3. 鈴木 一郎 様 (103号室)
    [PSCustomObject]@{
        id = 5
        resident_id = 3
        category = "documents"
        title = "介護サービス利用同意書 (鈴木一郎様原本)"
        url = "data/photos/documents/consent_suzuki.jpg"
        uploaded_at = "2026-10-01 19:40"
        uploader = "施設長"
    },
    [PSCustomObject]@{
        id = 6
        resident_id = 3
        category = "personal"
        title = "中庭での車椅子外気浴・日向ぼっこのご様子"
        url = "data/photos/personal/resident_suzuki_snap.jpg"
        uploaded_at = "2026-09-30 11:00"
        uploader = "鈴木"
    },
    # 4. 高橋 トメ 様 (105号室)
    [PSCustomObject]@{
        id = 7
        resident_id = 4
        category = "documents"
        title = "介護サービス利用同意書 (高橋トメ様原本)"
        url = "data/photos/documents/consent_takahashi.jpg"
        uploaded_at = "2026-10-01 19:40"
        uploader = "施設長"
    },
    [PSCustomObject]@{
        id = 8
        resident_id = 4
        category = "personal"
        title = "居室でのご歓談・笑顔のご様子"
        url = "data/photos/personal/resident_takahashi_snap.jpg"
        uploaded_at = "2026-09-25 15:20"
        uploader = "田中"
    }
)

# ==========================================
# 2. WEIGHT RECORDS (Aug, Sep 1, Sep 15, Oct 1)
# ==========================================
$db.weight_records = @(
    # 10月1日 (本日)
    [PSCustomObject]@{ id = 201; date = "2026-10-01"; month = "2026-10"; resident_id = 1; weight = 52.4; diff_prev = "-0.1kg"; staff_name = "山田" },
    [PSCustomObject]@{ id = 202; date = "2026-10-01"; month = "2026-10"; resident_id = 2; weight = 46.0; diff_prev = "+0.1kg"; staff_name = "佐藤" },
    [PSCustomObject]@{ id = 203; date = "2026-10-01"; month = "2026-10"; resident_id = 3; weight = 58.1; diff_prev = "-0.1kg"; staff_name = "鈴木" },
    [PSCustomObject]@{ id = 204; date = "2026-10-01"; month = "2026-10"; resident_id = 4; weight = 43.7; diff_prev = "+0.2kg"; staff_name = "田中" },
    # 9月15日
    [PSCustomObject]@{ id = 151; date = "2026-09-15"; month = "2026-09"; resident_id = 1; weight = 52.5; diff_prev = "+0.2kg"; staff_name = "山田" },
    [PSCustomObject]@{ id = 152; date = "2026-09-15"; month = "2026-09"; resident_id = 2; weight = 45.9; diff_prev = "+0.1kg"; staff_name = "佐藤" },
    [PSCustomObject]@{ id = 153; date = "2026-09-15"; month = "2026-09"; resident_id = 3; weight = 58.2; diff_prev = "-0.2kg"; staff_name = "鈴木" },
    [PSCustomObject]@{ id = 154; date = "2026-09-15"; month = "2026-09"; resident_id = 4; weight = 43.5; diff_prev = "-0.1kg"; staff_name = "田中" },
    # 9月1日
    [PSCustomObject]@{ id = 141; date = "2026-09-01"; month = "2026-09"; resident_id = 1; weight = 52.3; diff_prev = "+0.1kg"; staff_name = "山田" },
    [PSCustomObject]@{ id = 142; date = "2026-09-01"; month = "2026-09"; resident_id = 2; weight = 45.8; diff_prev = "-0.2kg"; staff_name = "佐藤" },
    [PSCustomObject]@{ id = 143; date = "2026-09-01"; month = "2026-09"; resident_id = 3; weight = 58.4; diff_prev = "-0.1kg"; staff_name = "鈴木" },
    [PSCustomObject]@{ id = 144; date = "2026-09-01"; month = "2026-09"; resident_id = 4; weight = 43.6; diff_prev = "-0.2kg"; staff_name = "田中" },
    # 8月15日 (過去実績)
    [PSCustomObject]@{ id = 101; date = "2026-08-15"; month = "2026-08"; resident_id = 1; weight = 52.2; diff_prev = "+0.1kg"; staff_name = "山田" },
    [PSCustomObject]@{ id = 102; date = "2026-08-15"; month = "2026-08"; resident_id = 2; weight = 46.0; diff_prev = "-0.2kg"; staff_name = "佐藤" },
    [PSCustomObject]@{ id = 103; date = "2026-08-15"; month = "2026-08"; resident_id = 3; weight = 58.5; diff_prev = "±0.0kg"; staff_name = "鈴木" },
    [PSCustomObject]@{ id = 104; date = "2026-08-15"; month = "2026-08"; resident_id = 4; weight = 43.8; diff_prev = "-0.4kg"; staff_name = "山田" }
)

# ==========================================
# 3. GROOMINGS (September & Today Oct 1)
# ==========================================
$db.groomings = @(
    # 10月1日 (本日)
    [PSCustomObject]@{ id = 301; date = "2026-10-01"; resident_id = 1; nail_done = 0; shave_done = 1; ear_done = 0; notes = "電気シェーバーにて髭剃り実施。肌トラブルなし。サッパリしたと笑顔。"; staff_name = "山田" },
    [PSCustomObject]@{ id = 302; date = "2026-10-01"; resident_id = 2; nail_done = 1; shave_done = 0; ear_done = 1; notes = "手足の爪切り・やすり掛け実施。右耳垢清拭。穏やかに応じられる。"; staff_name = "佐藤" },
    [PSCustomObject]@{ id = 303; date = "2026-10-01"; resident_id = 3; nail_done = 0; shave_done = 1; ear_done = 0; notes = "蒸しタオル後シェービング実施。保湿剤塗布。気持ちよさそうに目を細められる。"; staff_name = "鈴木" },
    [PSCustomObject]@{ id = 304; date = "2026-10-01"; resident_id = 4; nail_done = 1; shave_done = 0; ear_done = 0; notes = "手指爪切り実施。整髪ブロー。手鏡を見られ満足そうにされる。"; staff_name = "田中" },
    # 9月25日
    [PSCustomObject]@{ id = 281; date = "2026-09-25"; resident_id = 1; nail_done = 1; shave_done = 1; ear_done = 0; notes = "爪切り、髭剃り実施。出血等なし。"; staff_name = "山田" },
    [PSCustomObject]@{ id = 282; date = "2026-09-25"; resident_id = 2; nail_done = 1; shave_done = 0; ear_done = 0; notes = "足爪切り実施。巻き爪なし。"; staff_name = "佐藤" },
    [PSCustomObject]@{ id = 283; date = "2026-09-25"; resident_id = 3; nail_done = 0; shave_done = 1; ear_done = 1; notes = "髭剃り、耳掃除実施。皮膚乾燥あり保湿クリーム塗布。"; staff_name = "鈴木" },
    [PSCustomObject]@{ id = 284; date = "2026-09-25"; resident_id = 4; nail_done = 1; shave_done = 0; ear_done = 0; notes = "爪切り、整髪実施。良好。"; staff_name = "田中" },
    # 9月18日
    [PSCustomObject]@{ id = 271; date = "2026-09-18"; resident_id = 1; nail_done = 0; shave_done = 1; ear_done = 1; notes = "髭剃り・耳掃除実施。"; staff_name = "山田" },
    [PSCustomObject]@{ id = 272; date = "2026-09-18"; resident_id = 2; nail_done = 1; shave_done = 0; ear_done = 1; notes = "爪切り・耳掃除実施。"; staff_name = "佐藤" },
    [PSCustomObject]@{ id = 273; date = "2026-09-18"; resident_id = 3; nail_done = 1; shave_done = 1; ear_done = 0; notes = "手足爪切り・髭剃り実施。"; staff_name = "鈴木" },
    [PSCustomObject]@{ id = 274; date = "2026-09-18"; resident_id = 4; nail_done = 1; shave_done = 0; ear_done = 0; notes = "爪切り実施。"; staff_name = "田中" }
)

# ==========================================
# 4. BATHS (September & Today Oct 1)
# ==========================================
$db.baths = @(
    # 10月1日 (本日)
    [PSCustomObject]@{ id = 401; date = "2026-10-01"; resident_id = 1; bath_type = "一般浴"; ointment_notes = "右片麻痺注意し左側から移乗介助。背部発赤なし。ヒルドイドソフト塗布。"; staff_name = "山田" },
    [PSCustomObject]@{ id = 402; date = "2026-10-01"; resident_id = 2; bath_type = "一般浴"; ointment_notes = "膝痛に配慮し浴槽内手すり誘導。下肢浮腫軽度、両踵にプロペト塗布。"; staff_name = "佐藤" },
    [PSCustomObject]@{ id = 403; date = "2026-10-01"; resident_id = 3; bath_type = "特浴"; ointment_notes = "特浴ストレッチャーにて機械浴。安楽な体位保持。全身皮膚状態良好、保湿剤塗布。"; staff_name = "鈴木" },
    [PSCustomObject]@{ id = 404; date = "2026-10-01"; resident_id = 4; bath_type = "一般浴"; ointment_notes = "大腿骨経過観察のため浴槽出入り全見守り。洗髪・洗身はご自身で実施。"; staff_name = "田中" },
    # 9月29日
    [PSCustomObject]@{ id = 381; date = "2026-09-29"; resident_id = 1; bath_type = "一般浴"; ointment_notes = "背中・両下肢にヒルドイドソフト塗布。浴後水分摂取200ml。"; staff_name = "山田" },
    [PSCustomObject]@{ id = 382; date = "2026-09-29"; resident_id = 2; bath_type = "一般浴"; ointment_notes = "両踵プロペト塗布。温まり血行良好。"; staff_name = "佐藤" },
    [PSCustomObject]@{ id = 383; date = "2026-09-29"; resident_id = 3; bath_type = "特浴"; ointment_notes = "機械浴実施。臀部発赤なし。保湿クリーム塗布。"; staff_name = "鈴木" },
    [PSCustomObject]@{ id = 384; date = "2026-09-29"; resident_id = 4; bath_type = "一般浴"; ointment_notes = "入浴見守り。皮膚異常なし。"; staff_name = "田中" },
    # 9月25日
    [PSCustomObject]@{ id = 371; date = "2026-09-25"; resident_id = 1; bath_type = "一般浴"; ointment_notes = "背中ヒルドイド塗布。"; staff_name = "山田" },
    [PSCustomObject]@{ id = 372; date = "2026-09-25"; resident_id = 2; bath_type = "一般浴"; ointment_notes = "踵プロペト塗布。"; staff_name = "佐藤" },
    [PSCustomObject]@{ id = 373; date = "2026-09-25"; resident_id = 3; bath_type = "特浴"; ointment_notes = "機械浴。皮膚良好。"; staff_name = "鈴木" },
    [PSCustomObject]@{ id = 374; date = "2026-09-25"; resident_id = 4; bath_type = "一般浴"; ointment_notes = "見守り入浴。"; staff_name = "田中" }
)

# ==========================================
# 5. VITALS (September & Today Oct 1)
# ==========================================
$db.vitals = @(
    # 10月1日 (本日)
    [PSCustomObject]@{ id = 501; date = "2026-10-01"; time = "08:30"; resident_id = 1; temperature = 36.5; bp_high = 128; bp_low = 78; pulse = 72; spo2 = 98; is_unusual = 0; staff_name = "山田" },
    [PSCustomObject]@{ id = 502; date = "2026-10-01"; time = "08:35"; resident_id = 2; temperature = 36.3; bp_high = 132; bp_low = 80; pulse = 68; spo2 = 97; is_unusual = 0; staff_name = "佐藤" },
    [PSCustomObject]@{ id = 503; date = "2026-10-01"; time = "08:40"; resident_id = 3; temperature = 36.6; bp_high = 118; bp_low = 70; pulse = 74; spo2 = 96; is_unusual = 0; staff_name = "鈴木" },
    [PSCustomObject]@{ id = 504; date = "2026-10-01"; time = "08:45"; resident_id = 4; temperature = 36.4; bp_high = 124; bp_low = 76; pulse = 70; spo2 = 99; is_unusual = 0; staff_name = "田中" },
    # 9月30日
    [PSCustomObject]@{ id = 481; date = "2026-09-30"; time = "08:30"; resident_id = 1; temperature = 36.4; bp_high = 126; bp_low = 76; pulse = 70; spo2 = 98; is_unusual = 0; staff_name = "山田" },
    [PSCustomObject]@{ id = 482; date = "2026-09-30"; time = "08:35"; resident_id = 2; temperature = 36.2; bp_high = 130; bp_low = 78; pulse = 66; spo2 = 98; is_unusual = 0; staff_name = "佐藤" },
    [PSCustomObject]@{ id = 483; date = "2026-09-30"; time = "08:40"; resident_id = 3; temperature = 36.5; bp_high = 120; bp_low = 72; pulse = 72; spo2 = 97; is_unusual = 0; staff_name = "鈴木" },
    [PSCustomObject]@{ id = 484; date = "2026-09-30"; time = "08:45"; resident_id = 4; temperature = 36.3; bp_high = 122; bp_low = 74; pulse = 68; spo2 = 99; is_unusual = 0; staff_name = "田中" }
)

# ==========================================
# 6. MEALS (Today Oct 1 Morning & Lunch)
# ==========================================
$db.meals = @(
    # 朝食
    [PSCustomObject]@{ id = 601; date = "2026-10-01"; meal_type = "朝食"; resident_id = 1; main_dish_ratio = 10; side_dish_ratio = 9; water_ml = 200; staff_name = "山田" },
    [PSCustomObject]@{ id = 602; date = "2026-10-01"; meal_type = "朝食"; resident_id = 2; main_dish_ratio = 9; side_dish_ratio = 10; water_ml = 200; staff_name = "佐藤" },
    [PSCustomObject]@{ id = 603; date = "2026-10-01"; meal_type = "朝食"; resident_id = 3; main_dish_ratio = 8; side_dish_ratio = 8; water_ml = 150; staff_name = "鈴木" },
    [PSCustomObject]@{ id = 604; date = "2026-10-01"; meal_type = "朝食"; resident_id = 4; main_dish_ratio = 10; side_dish_ratio = 10; water_ml = 200; staff_name = "田中" },
    # 昼食
    [PSCustomObject]@{ id = 611; date = "2026-10-01"; meal_type = "昼食"; resident_id = 1; main_dish_ratio = 10; side_dish_ratio = 10; water_ml = 250; staff_name = "山田" },
    [PSCustomObject]@{ id = 612; date = "2026-10-01"; meal_type = "昼食"; resident_id = 2; main_dish_ratio = 8; side_dish_ratio = 9; water_ml = 200; staff_name = "佐藤" },
    [PSCustomObject]@{ id = 613; date = "2026-10-01"; meal_type = "昼食"; resident_id = 3; main_dish_ratio = 8; side_dish_ratio = 7; water_ml = 200; staff_name = "鈴木" },
    [PSCustomObject]@{ id = 614; date = "2026-10-01"; meal_type = "昼食"; resident_id = 4; main_dish_ratio = 10; side_dish_ratio = 10; water_ml = 250; staff_name = "田中" },
    # 9月30日 昼食
    [PSCustomObject]@{ id = 591; date = "2026-09-30"; meal_type = "昼食"; resident_id = 1; main_dish_ratio = 10; side_dish_ratio = 10; water_ml = 200; staff_name = "山田" },
    [PSCustomObject]@{ id = 592; date = "2026-09-30"; meal_type = "昼食"; resident_id = 2; main_dish_ratio = 9; side_dish_ratio = 9; water_ml = 200; staff_name = "佐藤" },
    [PSCustomObject]@{ id = 593; date = "2026-09-30"; meal_type = "昼食"; resident_id = 3; main_dish_ratio = 7; side_dish_ratio = 8; water_ml = 150; staff_name = "鈴木" },
    [PSCustomObject]@{ id = 594; date = "2026-09-30"; meal_type = "昼食"; resident_id = 4; main_dish_ratio = 10; side_dish_ratio = 10; water_ml = 200; staff_name = "田中" }
)

# ==========================================
# 7. EXCRETIONS (Today Oct 1)
# ==========================================
$db.excretions = @(
    [PSCustomObject]@{ id = 701; date = "2026-10-01"; time = "07:30"; resident_id = 1; urine_flag = 1; stool_amount = "中等量"; stool_condition = "普通便"; notes = "トイレ誘導にて排泄成功。"; staff_name = "山田" },
    [PSCustomObject]@{ id = 702; date = "2026-10-01"; time = "07:45"; resident_id = 2; urine_flag = 1; stool_amount = "中等量"; stool_condition = "普通便"; notes = "自立歩行にてトイレ排泄。スッキリされたご様子。"; staff_name = "佐藤" },
    [PSCustomObject]@{ id = 703; date = "2026-10-01"; time = "08:00"; resident_id = 3; urine_flag = 1; stool_amount = "少量"; stool_condition = "軟便"; notes = "オムツ交換時。皮膚清拭・撥水クリーム塗布。"; staff_name = "鈴木" },
    [PSCustomObject]@{ id = 704; date = "2026-10-01"; time = "08:15"; resident_id = 4; urine_flag = 1; stool_amount = "中等量"; stool_condition = "普通便"; notes = "ポータブルトイレ使用。排便あり。"; staff_name = "田中" },
    [PSCustomObject]@{ id = 711; date = "2026-10-01"; time = "13:30"; resident_id = 1; urine_flag = 1; stool_amount = "なし"; stool_condition = "普通便"; notes = "排尿あり(250ml程度)。"; staff_name = "山田" },
    [PSCustomObject]@{ id = 712; date = "2026-10-01"; time = "14:00"; resident_id = 2; urine_flag = 1; stool_amount = "なし"; stool_condition = "普通便"; notes = "排尿あり。"; staff_name = "佐藤" }
)

# ==========================================
# 8. ORAL CARES (Today Oct 1)
# ==========================================
$db.oral_cares = @(
    [PSCustomObject]@{ id = 801; date = "2026-10-01"; timing = "朝食後"; resident_id = 1; oral_done = 1; denture_done = 1; notes = "上部義歯洗浄、下残歯ブラッシング。うがい良好。"; staff_name = "山田" },
    [PSCustomObject]@{ id = 802; date = "2026-10-01"; timing = "朝食後"; resident_id = 2; oral_done = 1; denture_done = 1; notes = "総義歯洗浄。うがい・ブクブク含嗽促す。"; staff_name = "佐藤" },
    [PSCustomObject]@{ id = 803; date = "2026-10-01"; timing = "朝食後"; resident_id = 3; oral_done = 1; denture_done = 0; notes = "残歯スポンジブラシ清掃、口腔保湿ジェル塗布。"; staff_name = "鈴木" },
    [PSCustomObject]@{ id = 804; date = "2026-10-01"; timing = "朝食後"; resident_id = 4; oral_done = 1; denture_done = 1; notes = "総義歯ご自身で洗浄、仕上げ確認。"; staff_name = "田中" },
    [PSCustomObject]@{ id = 811; date = "2026-10-01"; timing = "昼食後"; resident_id = 1; oral_done = 1; denture_done = 1; notes = "食後ブラッシング実施。"; staff_name = "山田" },
    [PSCustomObject]@{ id = 812; date = "2026-10-01"; timing = "昼食後"; resident_id = 2; oral_done = 1; denture_done = 1; notes = "含嗽・義歯清掃。"; staff_name = "佐藤" }
)

# ==========================================
# 9. MEDS (Today Oct 1)
# ==========================================
$db.meds = @(
    [PSCustomObject]@{ id = 901; date = "2026-10-01"; slot = "朝"; resident_id = 1; status = "済"; staff_name = "山田" },
    [PSCustomObject]@{ id = 902; date = "2026-10-01"; slot = "朝"; resident_id = 2; status = "済"; staff_name = "佐藤" },
    [PSCustomObject]@{ id = 903; date = "2026-10-01"; slot = "朝"; resident_id = 3; status = "済"; staff_name = "鈴木" },
    [PSCustomObject]@{ id = 904; date = "2026-10-01"; slot = "朝"; resident_id = 4; status = "済"; staff_name = "田中" },
    [PSCustomObject]@{ id = 911; date = "2026-10-01"; slot = "昼"; resident_id = 1; status = "済"; staff_name = "山田" },
    [PSCustomObject]@{ id = 912; date = "2026-10-01"; slot = "昼"; resident_id = 2; status = "済"; staff_name = "佐藤" },
    [PSCustomObject]@{ id = 913; date = "2026-10-01"; slot = "昼"; resident_id = 3; status = "済"; staff_name = "鈴木" },
    [PSCustomObject]@{ id = 914; date = "2026-10-01"; slot = "昼"; resident_id = 4; status = "済"; staff_name = "田中" }
)

# ==========================================
# 10. CARE RECORDS (September & Today Oct 1)
# ==========================================
$db.care_records = @(
    [PSCustomObject]@{ id = 1001; recorded_at = "2026-10-01 10:15"; resident_id = 1; category = "日常"; content = "中庭の花壇に秋桜が咲いているのを眺め、『いい秋晴れだな』と穏やかに話される。"; staff_name = "山田" },
    [PSCustomObject]@{ id = 1002; recorded_at = "2026-10-01 10:30"; resident_id = 2; category = "日常"; content = "居室にて手芸の小物を整理。娘様からの差し入れ靴下を嬉しそうに箪笥へしまわれる。"; staff_name = "佐藤" },
    [PSCustomObject]@{ id = 1003; recorded_at = "2026-10-01 11:15"; resident_id = 3; category = "日常"; content = "車椅子にて中庭へ散歩介助。秋風にあたり穏やかな表情をされる。体位変換・クッション調整実施。"; staff_name = "鈴木" },
    [PSCustomObject]@{ id = 1004; recorded_at = "2026-10-01 11:45"; resident_id = 4; category = "日常"; content = "デイルームにて他の入居者様と談笑。『今日のお昼は何かしら』と楽しみにされる。"; staff_name = "田中" },
    [PSCustomObject]@{ id = 1005; recorded_at = "2026-10-01 14:15"; resident_id = 1; category = "入浴"; content = "一般浴にて温まり良好。右肩の可動域良好、洗髪介助時も気持ち良さそうにされる。"; staff_name = "山田" },
    [PSCustomObject]@{ id = 1006; recorded_at = "2026-10-01 14:40"; resident_id = 2; category = "入浴"; content = "一般浴実施。膝痛の増悪なし。下肢のマッサージを行い浮腫軽減。"; staff_name = "佐藤" },
    [PSCustomObject]@{ id = 981; recorded_at = "2026-09-29 15:30"; resident_id = 1; category = "レク"; content = "秋の音楽療法に参加。鈴を手にリズムに合わせて笑顔で合唱される。"; staff_name = "山田" },
    [PSCustomObject]@{ id = 982; recorded_at = "2026-09-28 14:00"; resident_id = 2; category = "レク"; content = "風船バレー参加。積極的に手を伸ばし笑顔多く見られる。"; staff_name = "佐藤" },
    [PSCustomObject]@{ id = 983; recorded_at = "2026-09-27 11:00"; resident_id = 3; category = "受診"; content = "往診医による定期診察。血圧・心音ともに安定。処方薬変更なし。"; staff_name = "施設長" },
    [PSCustomObject]@{ id = 984; recorded_at = "2026-09-25 15:00"; resident_id = 4; category = "日常"; content = "居室にて手鏡を見ながら身だしなみチェック。『きれいにしてもらったわ』と笑顔で過ごされる。"; staff_name = "田中" }
)

# Convert back to JSON with proper depth and formatting
$newJson = $db | ConvertTo-Json -Depth 10

# Save with UTF8 without BOM for clean web/JSON compliance
[System.IO.File]::WriteAllText($dbPath, $newJson, [System.Text.Encoding]::UTF8)

Write-Host "SUCCESS: Updated database with 9月 & 10月1日 care records and 8 personalized photo assets!"
