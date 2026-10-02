$headers = @{ "User-Agent" = "CarePortalBot/1.0 (test@example.com)" }

$files = @(
    "File:US Navy 090302-N-3241S-011 Electrician's Mate 1st Class Kellie Matzen cleans a resident's wheelchair.jpg",
    "File:Marines bring Christmas joy 141219-M-RZ020-001.jpg",
    "File:Marines bring Christmas joy 141219-M-RZ020-005.jpg",
    "File:Marines pound rice, ring in the New Year with local friends 150116-M-GX711-120.jpg"
)

foreach ($f in $files) {
    $url = "https://commons.wikimedia.org/w/api.php?action=query&titles=" + [System.Uri]::EscapeDataString($f) + "&prop=imageinfo&iiprop=url|size|comment&format=json"
    $res = Invoke-RestMethod -Uri $url -Headers $headers -Method Get
    foreach ($p in $res.query.pages.PSObject.Properties) {
        $page = $p.Value
        $ii = $page.imageinfo[0]
        Write-Host "Title: $($page.title)"
        Write-Host "Comment: $($ii.comment)"
        Write-Host "URL: $($ii.url)"
        Write-Host "---"
    }
}