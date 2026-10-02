$headers = @{ "User-Agent" = "CarePortalBot/1.0 (test@example.com)" }

$url = "https://commons.wikimedia.org/w/api.php?action=query&generator=categorymembers&gcmtitle=Category:Old_men_of_Japan&gcmlimit=50&prop=imageinfo&iiprop=url|size|comment&format=json"
$res = Invoke-RestMethod -Uri $url -Headers $headers -Method Get
foreach ($p in $res.query.pages.PSObject.Properties) {
    $page = $p.Value
    if ($page.imageinfo) {
        $ii = $page.imageinfo[0]
        Write-Host "Title: $($page.title)"
        Write-Host "URL: $($ii.url)"
        Write-Host "Comment: $($ii.comment)"
        Write-Host "---"
    }
}