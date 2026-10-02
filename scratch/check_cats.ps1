$headers = @{ "User-Agent" = "CarePortalBot/1.0 (test@example.com)" }

$cats = @("Category:People in wheelchairs in Japan", "Category:Wheelchairs in Japan", "Category:Nursing homes in Japan", "Category:Care of the elderly in Japan")

foreach ($c in $cats) {
    Write-Host "=== Cat: $c ==="
    $url = "https://commons.wikimedia.org/w/api.php?action=query&list=categorymembers&cmtitle=" + [System.Uri]::EscapeDataString($c) + "&cmlimit=30&prop=imageinfo&format=json"
    $res = Invoke-RestMethod -Uri $url -Headers $headers -Method Get
    foreach ($m in $res.query.categorymembers) {
        Write-Host "  $($m.title)"
    }
}