$headers = @{ "User-Agent" = "CarePortalBot/1.0 (test@example.com)" }

$f = 'File:Mario Finotti - Anziano - Istituto De Pagave - Novara.jpg'
$url = 'https://commons.wikimedia.org/w/api.php?action=query&titles=' + [System.Uri]::EscapeDataString($f) + '&prop=imageinfo&iiprop=url|size|extmetadata&format=json'
$res = Invoke-RestMethod -Uri $url -Headers $headers -Method Get
foreach ($p in $res.query.pages.PSObject.Properties) {
    $ii = $p.Value.imageinfo[0]
    Write-Host 'URL:' $ii.url
    if ($ii.extmetadata -and $ii.extmetadata.ImageDescription) {
        Write-Host 'Desc:' $ii.extmetadata.ImageDescription.value
    }
}