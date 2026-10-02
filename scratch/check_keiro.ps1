$headers = @{ "User-Agent" = "CarePortalBot/1.0 (test@example.com)" }

$terms = @("敬老の日", "老人ホーム", "介護施設", "車椅子 高齢者", "シルバー", "福祉施設")

foreach ($t in $terms) {
    Write-Host "=== $t ==="
    $url = "https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrsearch=" + [System.Uri]::EscapeDataString($t) + "&gsrlimit=10&prop=imageinfo&iiprop=url|size|extmetadata&format=json"
    $res = Invoke-RestMethod -Uri $url -Headers $headers -Method Get
    if ($res.query -and $res.query.pages) {
        foreach ($p in $res.query.pages.PSObject.Properties) {
            $page = $p.Value
            if ($page.imageinfo) {
                $ii = $page.imageinfo[0]
                Write-Host "Title: $($page.title)"
                Write-Host "URL: $($ii.url)"
            }
        }
    }
}