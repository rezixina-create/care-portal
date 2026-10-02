# UTF-8 BOM script for consent documents
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$baseDir = Split-Path $PSScriptRoot -Parent
$dbPath = Join-Path $baseDir "data\portal_database.json"
$jsonText = (Get-Content -Path $dbPath -Raw -Encoding UTF8).Trim()
if ($jsonText.StartsWith([char]0xFEFF)) { $jsonText = $jsonText.Substring(1) }
$db = $jsonText | ConvertFrom-Json

$fontTitle = New-Object System.Drawing.Font "Meiryo", 17, [System.Drawing.FontStyle]::Bold
$fontSub = New-Object System.Drawing.Font "Meiryo", 10, [System.Drawing.FontStyle]::Bold
$fontBody = New-Object System.Drawing.Font "Meiryo", 9.5, [System.Drawing.FontStyle]::Regular
$fontSmall = New-Object System.Drawing.Font "Meiryo", 8.5, [System.Drawing.FontStyle]::Regular
$fontStamp = New-Object System.Drawing.Font "Meiryo", 8, [System.Drawing.FontStyle]::Bold

$brushBlack = [System.Drawing.Brushes]::Black
$brushDark = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(40, 40, 40))
$brushRed = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(210, 40, 40))
$penBorder = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(60, 60, 60), 2)
$penThin = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(180, 180, 180), 1)
$penRed = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(210, 40, 40), 2)

$guarantors = @{
    "1" = @{ name = "佐藤 一郎"; rel = "長男"; addr = "東京都世田谷区桜丘2-15-4" }
    "2" = @{ name = "田中 美咲"; rel = "長女"; addr = "東京都杉並区荻窪4-8-12" }
    "3" = @{ name = "鈴木 和子"; rel = "妻";   addr = "東京都練馬区石神井町3-21-9" }
    "4" = @{ name = "高橋 健";   rel = "長男"; addr = "東京都中野区本町5-3-1" }
}

foreach ($r in $db.residents) {
    $bmp = New-Object System.Drawing.Bitmap 800, 1130
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit

    $g.Clear([System.Drawing.Color]::FromArgb(252, 252, 250))

    $g.DrawRectangle($penBorder, 35, 35, 730, 1060)
    $g.DrawRectangle($penThin, 39, 39, 722, 1052)

    $docNo = "DOC-2026-0401-0" + $r.id
    $g.DrawString("管理番号: " + $docNo, $fontSmall, [System.Drawing.Brushes]::Gray, 560, 48)

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
    $g.DrawString($r.name + " 様", $fontSub, $brushDark, 190, 320)

    $g.DrawString("生年月日", $fontBody, $brushDark, 55, 358)
    $g.DrawString($r.birth_date, $fontBody, $brushDark, 190, 358)
    $g.DrawString("居室番号", $fontBody, $brushDark, 470, 358)
    $g.DrawString($r.room_no + "号室", $fontSub, $brushDark, 570, 358)

    $g.DrawString("介護度区分", $fontBody, $brushDark, 55, 393)
    $g.DrawString($r.care_level, $fontSub, $brushDark, 190, 393)
    $g.DrawString("基本方針", $fontBody, $brushDark, 470, 393)
    $g.DrawString($r.policy_stamp, $fontSub, $brushDark, 570, 393)

    $g.FillRectangle((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(248, 250, 252))), 50, 440, 700, 28)
    $g.DrawRectangle($penThin, 50, 440, 700, 310)
    $g.DrawString("【同意確認事項】（各項目について十分な説明を受け、同意いたしました）", $fontSub, $brushDark, 55, 445)

    $items = @(
        "1. 施設サービス計画（ケアプラン）の作成・変更及び計画に基づく介護・看護提供への同意",
        "2. 個人情報の利用目的（協力医療機関・行政機関・ご家族との情報共有等）に関する同意",
        "3. 身体拘束等の原則廃止および適正化に関する取組方針への理解と同意",
        "4. 往診医・嘱託医との定期医療連携および処方薬管理、緊急搬送時体制に関する同意",
        "5. ご意向に基づく対応方針の確認: ［" + $r.policy_stamp + "方針］",
        "6. 私物・預かり金管理規程および施設利用に関する遵守事項への同意"
    )

    $yItem = 480
    foreach ($it in $items) {
        $g.DrawRectangle($penThin, 65, $yItem + 2, 14, 14)
        $g.DrawString("✔", $fontSub, $brushDark, 64, $yItem - 1)
        $g.DrawString($it, $fontBody, $brushDark, 88, $yItem)
        $yItem += 42
    }

    $g.FillRectangle((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(240, 244, 248))), 50, 770, 700, 28)
    $g.DrawRectangle($penThin, 50, 770, 700, 290)
    $g.DrawString("【ご本人様・身元引受人（代理人）署名押印欄】", $fontSub, $brushDark, 55, 775)

    $g.DrawString("■ ご本人様署名", $fontSub, $brushDark, 60, 815)
    $g.DrawString("住　所:  施設住所（東京都桜区桜丘1-10 桜花苑 " + $r.room_no + "号室）", $fontBody, $brushDark, 80, 842)
    $g.DrawString("氏　名:  " + $r.name, $fontTitle, $brushDark, 80, 870)

    $sur = $r.name.Split(' ')[0]
    $g.DrawEllipse($penRed, 340, 868, 38, 38)
    $g.DrawString($sur, $fontStamp, $brushRed, (New-Object System.Drawing.RectangleF 340, 868, 38, 38), $stampSf)

    $g.DrawLine($penThin, 50, 920, 750, 920)

    $gInfo = $guarantors[$r.id.ToString()]
    $g.DrawString("■ 身元引受人（ご家族・代理人）署名", $fontSub, $brushDark, 60, 935)
    $g.DrawString("住　所:  " + $gInfo.addr, $fontBody, $brushDark, 80, 960)
    $g.DrawString("続　柄:  " + $gInfo.rel, $fontBody, $brushDark, 80, 988)
    $g.DrawString("氏　名:  " + $gInfo.name, $fontTitle, $brushDark, 80, 1012)

    $gSur = $gInfo.name.Split(' ')[0]
    $g.DrawEllipse($penRed, 340, 1010, 38, 38)
    $g.DrawString($gSur, $fontStamp, $brushRed, (New-Object System.Drawing.RectangleF 340, 1010, 38, 38), $stampSf)

    $outFileName = "consent_resident_" + $r.id + ".jpg"
    $outPath = Join-Path $baseDir ("data\photos\documents\" + $outFileName)
    $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Jpeg)

    $g.Dispose()
    $bmp.Dispose()
    Write-Host "Generated: $outFileName"
}
Write-Host "SUCCESS: Generated all 4 personalized consent documents!"
