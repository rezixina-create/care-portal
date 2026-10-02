$headers = @{ "User-Agent" = "CarePortalBot/1.0 (test@example.com)" }

$queries = @(
    "Japanese elderly wheelchair",
    "Japanese nursing home",
    "Japanese senior wheelchair",
    "reclining wheelchair",
    "elderly recliner",
    "高齢者 車椅子",
    "介護 車椅子",
    "特養",
    "デイサービス"
)

foreach ($q in $queries) {
    Write-Host "=== Query: $q ==="
    $url = "https://commons.wikimedia.org/w/api.php?action=query&list=search&srsearch=" + [System.Uri]::EscapeDataString($q) + "&srnamespace=6&srlimit=8&format=json"
    try {
        $res = Invoke-RestMethod -Uri $url -Headers $headers -Method Get
        if ($res.query -and $res.query.search) {
            foreach ($s in $res.query.search) {
                Write-Host "  Title: $($s.title)"
            }
        }
    } catch {
        Write-Host "  Err: $_"
    }
}