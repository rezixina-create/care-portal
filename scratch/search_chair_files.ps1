$headers = @{ "User-Agent" = "CarePortalBot/1.0 (test@example.com)" }

$terms = @(
    "wheelchair blanket",
    "elderly armchair",
    "elderly recliner",
    "nursing home wheelchair indoor",
    "elderly man sitting indoor",
    "senior man armchair",
    "grandfather armchair"
)

foreach ($t in $terms) {
    Write-Host "=== Search: $t ==="
    $url = "https://commons.wikimedia.org/w/api.php?action=query&list=search&srsearch=" + [System.Uri]::EscapeDataString($t) + "&srnamespace=6&srlimit=8&format=json"
    $res = Invoke-RestMethod -Uri $url -Headers $headers -Method Get
    if ($res.query -and $res.query.search) {
        foreach ($s in $res.query.search) {
            if ($s.title -like "*.jpg" -or $s.title -like "*.jpeg" -or $s.title -like "*.png") {
                Write-Host "  $($s.title)"
            }
        }
    }
}