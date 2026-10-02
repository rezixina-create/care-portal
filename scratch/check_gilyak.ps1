$f = "File:2025-01-18 Gilyak Amagasaki,Mikura-suisen-park ギリヤーク尼ケ崎（みくらすいせん公園）神戸市長田区 DSCF6044.jpg"
$url = "https://commons.wikimedia.org/w/api.php?action=query&titles=" + [System.Uri]::EscapeDataString($f) + "&prop=imageinfo&iiprop=url|size|comment&format=json"
$res = Invoke-RestMethod -Uri $url -Headers @{'User-Agent'='CarePortalBot/1.0'} -Method Get
foreach ($p in $res.query.pages.PSObject.Properties) {
    Write-Host "URL:" $p.Value.imageinfo[0].url
}

$f2 = "File:2025-01-18 Gilyak Amagasaki,Mikura-suisen-park ギリヤーク尼ケ崎（みくらすいせん公園）神戸市長田区 DSCF6026.jpg"
$url2 = "https://commons.wikimedia.org/w/api.php?action=query&titles=" + [System.Uri]::EscapeDataString($f2) + "&prop=imageinfo&iiprop=url|size|comment&format=json"
$res2 = Invoke-RestMethod -Uri $url2 -Headers @{'User-Agent'='CarePortalBot/1.0'} -Method Get
foreach ($p in $res2.query.pages.PSObject.Properties) {
    Write-Host "URL2:" $p.Value.imageinfo[0].url
}