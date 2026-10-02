$headers = @{ "User-Agent" = "CarePortalBot/1.0 (test@example.com)" }

$terms = @("wheelchair nursing indoor", "wheelchair room window", "elderly armchair window", "elderly sitting armchair", "wheelchair dayroom")

foreach ($t in $terms) {
    Write-Host "=== $t ==="
    $url = "https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrsearch=" + [System.Uri]::EscapeDataString($t) + "&gsrlimit=8&prop=imageinfo&iiprop=url|size|comment&format=json"
    $res = Invoke-RestMethod -Uri $url -Headers $headers -Method Get
    if ($res.query -and $res.query.pages) {
        foreach ($p in $res.query.pages.PSObject.Properties) {
            $page = $p.Value
            if ($page.imageinfo) {
                $ii = $page.imageinfo[0]
                if ($ii.url -like "*.jpg" -or $ii.url -like "*.jpeg" -or $ii.url -like "*.png") {
                    Write-Host "Title: $($page.title)"
                    Write-Host "URL: $($ii.url)"
                    Write-Host "Comment: $($ii.comment)"
                    Write-Host "---"
                }
            }
        }
    }
}