$url = "https://www.flickr.com/services/rest/?method=flickr.photos.search&api_key=72157605481748283&text=" + [System.Uri]::EscapeDataString("japanese elderly wheelchair OR nursing OR recliner") + "&license=1,2,3,4,5,6,7&format=json&nojsoncallback=1&per_page=10"
try {
    $res = Invoke-RestMethod -Uri $url -Method Get
    Write-Host "Stat: $($res.stat)"
    if ($res.photos -and $res.photos.photo) {
        foreach ($p in $res.photos.photo) {
            Write-Host "Title: $($p.title)"
            Write-Host "Photo URL: https://live.staticflickr.com/$($p.server)/$($p.id)_$($p.secret)_b.jpg"
        }
    }
} catch {
    Write-Host "Error: $_"
}