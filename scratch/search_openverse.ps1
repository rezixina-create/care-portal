$headers = @{ "User-Agent" = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }
$queries = @(
    "elderly recliner nursing home",
    "elderly wheelchair indoor window",
    "senior wheelchair indoor dayroom",
    "geriatric chair nursing home"
)

foreach ($q in $queries) {
    Write-Host "=== Query: $q ==="
    $url = "https://api.openverse.org/v1/images/?q=" + [System.Uri]::EscapeDataString($q) + "&page_size=5"
    try {
        $res = Invoke-RestMethod -Uri $url -Headers $headers -Method Get
        foreach ($item in $res.results) {
            Write-Host "Title: $($item.title)"
            Write-Host "URL: $($item.url)"
            Write-Host "Detail: $($item.foreign_landing_url)"
            Write-Host "---"
        }
    } catch {
        Write-Host "Error: $_"
    }
}
