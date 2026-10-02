$headers = @{ "User-Agent" = "CarePortalBot/1.0 (test@example.com)" }

$url = "https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=incategory:\"Old men of Japan\"&gsrlimit=30&prop=imageinfo&iiprop=url|size|extmetadata&format=json"
$res = Invoke-RestMethod -Uri $url -Headers $headers -Method Get
foreach ($p in $res.query.pages.PSObject.Properties) {
    $page = $p.Value
    if ($page.imageinfo) {
        $ii = $page.imageinfo[0]
        Write-Host "Title: $($page.title)"
        Write-Host "URL: $($ii.url)"
    }
}