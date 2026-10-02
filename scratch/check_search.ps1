$headers = @{ "User-Agent" = "CarePortalBot/1.0 (test@example.com)" }

$url = "https://commons.wikimedia.org/w/api.php?action=query&list=search&srsearch=wheelchair+indoor&srnamespace=6&srlimit=10&format=json"
$res = Invoke-RestMethod -Uri $url -Headers $headers -Method Get
foreach ($s in $res.query.search) {
    Write-Host "Title: $($s.title)"
}