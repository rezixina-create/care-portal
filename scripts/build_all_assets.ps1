# Care Portal All Assets & Records Generator
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$baseDir = Split-Path $PSScriptRoot -Parent
$photoDirPersonal = Join-Path $baseDir "data\photos\personal"
$photoDirDocs = Join-Path $baseDir "data\photos\documents"

if (-not (Test-Path $photoDirPersonal)) { New-Item -ItemType Directory -Path $photoDirPersonal -Force }
if (-not (Test-Path $photoDirDocs)) { New-Item -ItemType Directory -Path $photoDirDocs -Force }

Write-Host "=========================================="
Write-Host "1. Deploying Dignified Natural Photos (No Nameplates)"
Write-Host "=========================================="

# 1. 佐藤様 (男性): 折り紙の鶴を折る穏やかな日常スナップ
$satoSrc = "C:\Users\Owner\.gemini\antigravity\brain\4b265d6d-9c8d-442b-afe5-5771244cf85d\resident_photo_sample_1790851205654.jpg"
$satoDst = Join-Path $photoDirPersonal "resident_sato_snap.jpg"
Copy-Item $satoSrc $satoDst -Force
Write-Host "Deployed: resident_sato_snap.jpg (Sato)"

# 2. 田中様 (女性): 上品なシニア女性の自然な日常ポートレート
$tanakaSrc = Join-Path $baseDir "tests\sample_wm_tanaka.jpg"
$tanakaDst = Join-Path $photoDirPersonal "resident_tanaka_snap.jpg"
Copy-Item $tanakaSrc $tanakaDst -Force
Write-Host "Deployed: resident_tanaka_snap.jpg (Tanaka)"

# 3. 鈴木様 (男性): 中庭散歩・リハビリの自然な日常スナップ
$suzukiSrc = Join-Path $baseDir "tests\sample_wm_suzuki.jpg"
$suzukiDst = Join-Path $photoDirPersonal "resident_suzuki_snap.jpg"
Copy-Item $suzukiSrc $suzukiDst -Force
Write-Host "Deployed: resident_suzuki_snap.jpg (Suzuki)"

# 4. 高橋様 (女性): 杖歩行訓練の元気な自然スナップ
$takahashiSrc = Join-Path $baseDir "tests\sample_wm_takahashi.jpg"
$takahashiDst = Join-Path $photoDirPersonal "resident_takahashi_snap.jpg"
Copy-Item $takahashiSrc $takahashiDst -Force
Write-Host "Deployed: resident_takahashi_snap.jpg (Takahashi)"


Write-Host "`n=========================================="
Write-Host "2. Generating 4 Personalized Official Consent Documents"
Write-Host "=========================================="

$fontTitle = [System.Drawing.Font]::new("Meiryo", [float]17, [System.Drawing.FontStyle]::Bold)
$fontSub = [System.Drawing.Font]::new("Meiryo", [float]10, [System.Drawing.FontStyle]::Bold)
$fontBody = [System.Drawing.Font]::new("Meiryo", [float]9.5, [System.Drawing.FontStyle]::Regular)
$fontSmall = [System.Drawing.Font]::new("Meiryo", [float]8.5, [System.Drawing.FontStyle]::Regular)
$fontStamp = [System.Drawing.Font]::new("Meiryo", [float]8, [System.Drawing.FontStyle]::Bold)

$brushBlack = [System.Drawing.Brushes]::Black
$brushDark = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(40, 40, 40))
$brushRed = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(210, 40, 40))
$penBorder = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(60, 60, 60), 2)
$penThin = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(180, 180, 180), 1)
$penRed = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(210, 40, 40), 2)

$docDefs = @(
    @{
        id = 1
        name = "佐藤 太郎"
        sur = "佐藤"
        birth = "昭和15年10月15日生"
        room = "101号室"
        care = "要介護 3"
        policy = "看取り介護（自然な尊厳の保持）"
        guarName = "佐藤 一郎"
        guarSur = "佐藤"
        guarRel = "長男"
        guarAddr = "東京都世田谷区桜丘2-15-4"
        file = "consent_sato.jpg"
    },
    @{
        id = 2
        name = "田中 ハナ"
        sur = "田中"
        birth = "昭和13年11月20日生"
        room = "102号室"
        care = "要介護 2"
        policy = "緊急時医療搬送（救急指定病院連携）"
        guarName = "田中 美咲"
        guarSur = "田中"
        guarRel = "長女"
        guarAddr = "東京都杉並区荻窪4-8-12"
        file = "consent_tanaka.jpg"
    },
    @{
        id = 3
        name = "鈴木 一郎"
        sur = "鈴木"
        birth = "昭和10年2月15日生"
        room = "103号室"
        care = "要介護 4"
        policy = "看取り介護（安らかな療養支援）"
        guarName = "鈴木 和子"
        guarSur = "鈴木"
        guarRel = "妻"
        guarAddr = "東京都練馬区石神井町3-21-9"
        file = "consent_suzuki.jpg"
    },
    @{
        id = 4
        name = "高橋 トメ"
        sur = "高橋"
        birth = "昭和17年8月1日生"
        room = "105号室"
        care = "要介護 1"
        policy = "緊急時医療搬送（速やかな救急連携）"
        guarName = "高橋 健"
        guarSur = "高橋"
        guarRel = "長男"
        guarAddr = "東京都中野区本町5-3-1"
        file = "consent_takahashi.jpg"
    }
)

foreach ($d in $docDefs) {
    $bmp = New-Object System.Drawing.Bitmap 800, 1130
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit

    $g.Clear([System.Drawing.Color]::FromArgb(252, 252, 250))

    $g.DrawRectangle($penBorder, 35, 35, 730, 1060)
    $g.DrawRectangle($penThin, 39, 39, 722, 1052)

    $g.DrawString("様式第１号（介護保険関係書類）", $fontSmall, [System.Drawing.Brushes]::Gray, 50, 48)
    $g.DrawString("管理番号: DOC-2026-0401-0$($d.id)", $fontSmall, [System.Drawing.Brushes]::Gray, 560, 48)

    $sf = New-Object System.Drawing.StringFormat
    $sf.Alignment = [System.Drawing.StringAlignment]::Center
    $g.DrawString("介護保険施設サービス 利用同意書", $fontTitle, $brushBlack, (New-Object System.Drawing.RectangleF 50, 75, 700, 40), $sf)
    $g.DrawLine($penBorder, 220, 115, 580, 115)

    $g.DrawString("同意年月日:  令和 8 年 4 月 1 日", $fontBody, $brushDark, 50, 135)
    $g.DrawString("事業所名: 特別養護老人ホーム 桜花苑", $fontSub, $brushDark, 440, 130)
    $g.DrawString("事業者: 社会福祉法人 桜花福祉会", $fontSmall, $brushDark, 440, 150)
    $g.DrawString("管理者: 施設長  桜井 誠一", $fontSmall, $brushDark, 440, 168)

    $g.DrawRectangle($penRed, 650, 140, 46, 46)
    $stampSf = New-Object System.Drawing.StringFormat
    $stampSf.Alignment = [System.Drawing.StringAlignment]::Center
    $stampSf.LineAlignment = [System.Drawing.StringAlignment]::Center
    $g.DrawString("桜花苑`n之印", $fontStamp, $brushRed, (New-Object System.Drawing.RectangleF 650, 140, 46, 46), $stampSf)

    $preamble = "私は、特別養護老人ホーム桜花苑の利用にあたり、重要事項説明書に基づき運営規程、利用料金、サービス内容及び緊急時等の対応方針について十分な説明を受け、内容を了解いたしましたので、下記のとおりサービスの利用に同意いたします。"
    $g.DrawString($preamble, $fontBody, $brushDark, (New-Object System.Drawing.RectangleF 50, 205, 700, 70))

    $g.FillRectangle((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(240, 244, 248))), 50, 280, 700, 30)
    $g.DrawRectangle($penThin, 50, 280, 700, 140)
    $g.DrawLine($penThin, 50, 310, 750, 310)
    $g.DrawLine($penThin, 50, 350, 750, 350)
    $g.DrawLine($penThin, 50, 385, 750, 385)
    $g.DrawLine($penThin, 180, 280, 180, 420)
    $g.DrawLine($penThin, 460, 310, 460, 385)
    $g.DrawLine($penThin, 560, 310, 560, 385)

    $g.DrawString("【ご利用者様情報】", $fontSub, $brushDark, 55, 286)
    $g.DrawString("氏名", $fontBody, $brushDark, 55, 320)
    $g.DrawString($d.name + " 様", $fontSub, $brushDark, 190, 320)

    $g.DrawString("生年月日", $fontBody, $brushDark, 55, 358)
    $g.DrawString($d.birth, $fontBody, $brushDark, 190, 358)
    $g.DrawString("居室番号", $fontBody, $brushDark, 470, 358)
    $g.DrawString($d.room, $fontSub, $brushDark, 570, 358)

    $g.DrawString("介護度区分", $fontBody, $brushDark, 55, 393)
    $g.DrawString($d.care, $fontSub, $brushDark, 190, 393)
    $g.DrawString("基本方針", $fontBody, $brushDark, 470, 393)
    $policyShort = $d.policy.Split('（')[0]
    $g.DrawString($policyShort, $fontSub, $brushDark, 570, 393)

    $g.FillRectangle((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(248, 250, 252))), 50, 435, 700, 28)
    $g.DrawRectangle($penThin, 50, 435, 700, 260)
    $g.DrawString("【同意確認事項】（各項目について十分な説明を受け、同意いたしました）", $fontSub, $brushDark, 55, 440)

    $items = @(
        "1. 施設サービス計画（ケアプラン）の作成・変更及び計画に基づく介護提供への同意",
        "2. 個人情報の利用目的（協力医療機関・行政機関・ご家族との共有等）に関する同意",
        "3. 身体拘束等の原則廃止および適正化に関する取組方針への理解と同意",
        "4. 往診医との定期医療連携および処方薬管理、緊急時体制に関する同意",
        "5. 緊急時対応体制及び看取り等の個別基本方針に関する同意",
        "6. 私物・預かり金管理規程および施設利用に関する遵守事項への同意"
    )

    $yItem = 472
    foreach ($it in $items) {
        $g.DrawRectangle($penThin, 65, $yItem + 2, 14, 14)
        $g.DrawString("✔", $fontSub, $brushDark, 64, $yItem - 1)
        $g.DrawString($it, $fontBody, $brushDark, (New-Object System.Drawing.RectangleF 88, $yItem, 640, 32))
        $yItem += 36
    }

    $g.FillRectangle((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(240, 244, 248))), 50, 715, 700, 28)
    $g.DrawRectangle($penThin, 50, 715, 700, 345)
    $g.DrawString("【ご本人様・身元引受人（代理人）署名押印欄】", $fontSub, $brushDark, 55, 720)

    $g.DrawString("■ ご本人様署名", $fontSub, $brushDark, 60, 755)
    $g.DrawString("住　所:  施設住所（東京都桜区桜丘1-10 桜花苑 " + $d.room + "）", $fontBody, $brushDark, 80, 782)
    $g.DrawString("氏　名:  " + $d.name, $fontTitle, $brushDark, 80, 810)

    $g.DrawEllipse($penRed, 340, 808, 38, 38)
    $g.DrawString($d.sur, $fontStamp, $brushRed, (New-Object System.Drawing.RectangleF 340, 808, 38, 38), $stampSf)

    $g.DrawLine($penThin, 50, 870, 750, 870)

    $g.DrawString("■ 身元引受人（ご家族・代理人）署名", $fontSub, $brushDark, 60, 890)
    $g.DrawString("住　所:  " + $d.guarAddr, $fontBody, $brushDark, 80, 920)
    $g.DrawString("続　柄:  " + $d.guarRel, $fontBody, $brushDark, 80, 950)
    $g.DrawString("氏　名:  " + $d.guarName, $fontTitle, $brushDark, 80, 980)

    $g.DrawEllipse($penRed, 340, 978, 38, 38)
    $g.DrawString($d.guarSur, $fontStamp, $brushRed, (New-Object System.Drawing.RectangleF 340, 978, 38, 38), $stampSf)

    $dstPath = Join-Path $photoDirDocs $d.file
    $bmp.Save($dstPath, [System.Drawing.Imaging.ImageFormat]::Jpeg)

    $g.Dispose()
    $bmp.Dispose()
    Write-Host "Generated: $($d.file) ($($d.name))"
}

Write-Host "All 4 consent documents successfully created."
