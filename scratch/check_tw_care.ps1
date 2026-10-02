$headers = @{ "User-Agent" = "CarePortalBot/1.0 (test@example.com)" }

$files = @(
    "File:08.11 總統訪視「田園老人養護中心」 (30107671138).jpg",
    "File:08.11 總統訪視「田園老人養護中心」 (43070868015).jpg",
    "File:06.16 總統探訪「板橋頤安托老中心」 (35297887786).jpg"
)

foreach ($f in $files) {
    $url = "https://commons.wikimedia.org/w/api.php?action=query&titles=" + [System.Uri]::EscapeDataString($f) + "&prop=imageinfo&iiprop=url|size|comment&format=json"
    $res = Invoke-RestMethod -Uri $url -Headers $headers -Method Get
    foreach ($p in $res.query.pages.PSObject.Properties) {
        $ii = $p.Value.imageinfo[0]
        Write-Host "Title: $($p.Value.title)"
        Write-Host "URL: $($ii.url)"
        Write-Host "---"
    }
}