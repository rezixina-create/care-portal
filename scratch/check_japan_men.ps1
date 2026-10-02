$headers = @{ "User-Agent" = "CarePortalBot/1.0 (test@example.com)" }

$files = @("File:Japanese old man.jpg", "File:Harutakah.JPG", "File:Wrinkles15.jpg", "File:ハジィ.JPG")

foreach ($f in $files) {
    $url = "https://commons.wikimedia.org/w/api.php?action=query&titles=" + [System.Uri]::EscapeDataString($f) + "&prop=imageinfo&iiprop=url|size|comment&format=json"
    $res = Invoke-RestMethod -Uri $url -Headers $headers -Method Get
    foreach ($p in $res.query.pages.PSObject.Properties) {
        $page = $p.Value
        $ii = $page.imageinfo[0]
        Write-Host "Title: $($page.title)"
        Write-Host "URL: $($ii.url)"
        Write-Host "Comment: $($ii.comment)"
        Write-Host "---"
    }
}