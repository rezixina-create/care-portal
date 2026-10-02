$headers = @{ "User-Agent" = "CarePortalBot/1.0 (test@example.com)" }

$f = 'File:Prime Minister Abe met to Patients(2019).jpg'
$url = 'https://commons.wikimedia.org/w/api.php?action=query&titles=' + [System.Uri]::EscapeDataString($f) + '&prop=imageinfo&iiprop=url|size|comment&format=json'
$res = Invoke-RestMethod -Uri $url -Headers $headers -Method Get
foreach ($p in $res.query.pages.PSObject.Properties) {
    $ii = $p.Value.imageinfo[0]
    Write-Host 'URL:' $ii.url
    Write-Host 'Comment:' $ii.comment
}