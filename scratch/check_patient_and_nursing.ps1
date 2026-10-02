# check_patient_and_nursing.ps1
$url1 = "https://commons.wikimedia.org/wiki/Special:FilePath/In-_patient.JPG?width=800"
curl.exe -s -L -H "User-Agent: Mozilla/5.0" "$url1" -o "tests\in_patient.jpg"

$urlN = "https://commons.wikimedia.org/w/api.php?action=query&list=categorymembers&cmtitle=Category:Nursing_homes&cmtype=file&cmlimit=20&format=json"
$headers = @{ "User-Agent" = "CarePortalBot/1.0" }
$res = Invoke-RestMethod -Uri $urlN -Headers $headers -Method Get
Write-Host "In-patient downloaded: $((Get-Item tests\in_patient.jpg).Length) bytes"
Write-Host "Nursing home files:"
foreach ($m in $res.query.categorymembers) {
    Write-Host "  " $m.title
}
