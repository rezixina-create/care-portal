$f = 'File:ボランティア 2011 (5648904635).jpg'
$url = 'https://commons.wikimedia.org/w/api.php?action=query&titles=' + [System.Uri]::EscapeDataString($f) + '&prop=imageinfo&iiprop=url|size|extmetadata&format=json'
$res = Invoke-RestMethod -Uri $url -Headers @{'User-Agent'='CarePortalBot/1.0'} -Method Get
foreach ($p in $res.query.pages.PSObject.Properties) {
    $ii = $p.Value.imageinfo[0]
    Write-Host 'URL:' $ii.url
    Write-Host 'Desc:' $ii.extmetadata.ImageDescription.value
}