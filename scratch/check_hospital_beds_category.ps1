# check_hospital_beds_category.ps1
$url = "https://commons.wikimedia.org/w/api.php?action=query&list=categorymembers&cmtitle=Category:Hospital_beds&cmtype=file&cmlimit=30&format=json"
$headers = @{ "User-Agent" = "CarePortalBot/1.0" }
$res = Invoke-RestMethod -Uri $url -Headers $headers -Method Get
foreach ($m in $res.query.categorymembers) {
    Write-Host $m.title
}
