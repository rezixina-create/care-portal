$headers = @{ "User-Agent" = "CarePortalBot/1.0 (test@example.com)" }

$cats = @("Category:Retirement homes in Japan", "Category:Services for old people in Japan", "Category:Centenarians from Japan")

foreach ($c in $cats) {
    Write-Host "=== $c ==="
    $url = "https://commons.wikimedia.org/w/api.php?action=query&list=categorymembers&cmtitle=" + [System.Uri]::EscapeDataString($c) + "&cmlimit=50&format=json"
    $res = Invoke-RestMethod -Uri $url -Headers $headers -Method Get
    foreach ($m in $res.query.categorymembers) {
        Write-Host "  $($m.title)"
    }
}