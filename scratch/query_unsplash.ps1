$url = "https://unsplash.com/napi/search/photos?query=elderly+wheelchair&per_page=10"
$headers = @{ "User-Agent" = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }
try {
    $res = Invoke-RestMethod -Uri $url -Headers $headers -Method Get
    foreach ($r in $res.results) {
        Write-Host "ID: $($r.id)"
        Write-Host "Desc: $($r.description)"
        Write-Host "Alt: $($r.alt_description)"
        Write-Host "Small: $($r.urls.small)"
        Write-Host "---"
    }
} catch {
    Write-Host "Error: $_"
}