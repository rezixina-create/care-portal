$headers = @{ "User-Agent" = "CarePortalBot/1.0 (test@example.com)" }

$url = "https://commons.wikimedia.org/w/api.php?action=query&list=categorymembers&cmtitle=Category:Elderly_day_care_centers_in_Taiwan&cmlimit=30&format=json"
$res = Invoke-RestMethod -Uri $url -Headers $headers -Method Get
foreach ($m in $res.query.categorymembers) {
    Write-Host "  $($m.title)"
}