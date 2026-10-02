$url = "https://ja.wikipedia.org/w/api.php?action=parse&page=%E8%BB%8A%E6%A4%85%E5%AD%90&prop=images&format=json"
$res = Invoke-RestMethod -Uri $url -Headers @{'User-Agent'='CarePortalBot/1.0'} -Method Get
$res.parse.images | ForEach-Object { Write-Host $_ }