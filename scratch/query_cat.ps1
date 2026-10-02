$headers = @{ "User-Agent" = "CarePortalBot/1.0 (test@example.com)" }

$url = "https://commons.wikimedia.org/w/api.php?action=query&list=categorymembers&cmtitle=Category:Old_men_of_Japan&cmlimit=50&cmtype=file&prop=imageinfo&iiprop=url|size&format=json"
$res = Invoke-RestMethod -Uri $url -Headers $headers -Method Get
foreach ($m in $res.query.categorymembers) {
    Write-Host "Title: $($m.title)"
}