$headers = @{ "User-Agent" = "CarePortalBot/1.0 (test@example.com)" }

$cats = @("Category:Palliative care", "Category:Hospices", "Category:Long-term care", "Category:Day care centers")

foreach ($c in $cats) {
    Write-Host "=== $c ==="
    $url = "https://commons.wikimedia.org/w/api.php?action=query&list=categorymembers&cmtitle=" + [System.Uri]::EscapeDataString($c) + "&cmlimit=25&format=json"
    $res = Invoke-RestMethod -Uri $url -Headers $headers -Method Get
    if ($res.query -and $res.query.categorymembers) {
        foreach ($m in $res.query.categorymembers) {
            Write-Host "  $($m.title)"
        }
    }
}