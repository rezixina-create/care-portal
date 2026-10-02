$headers = @{ "User-Agent" = "CarePortalBot/1.0 (test@example.com)" }

$queries = @(
    "Japanese grandfather",
    "Japanese old man indoor",
    "Japanese elderly room",
    "elderly recliner",
    "reclining wheelchair",
    "デイケア 利用者",
    "老健 室内",
    "特養 室内",
    "老人ホーム 日常",
    "車椅子 高齢者 室内"
)

foreach ($q in $queries) {
    Write-Host "=== Query: $q ==="
    $url = "https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrsearch=" + [System.Uri]::EscapeDataString($q) + "&gsrlimit=5&prop=imageinfo&iiprop=url|size|extmetadata&format=json"
    try {
        $res = Invoke-RestMethod -Uri $url -Headers $headers -Method Get
        if ($res.query -and $res.query.pages) {
            foreach ($p in $res.query.pages.PSObject.Properties) {
                $page = $p.Value
                if ($page.imageinfo) {
                    $ii = $page.imageinfo[0]
                    Write-Host "Title: $($page.title)"
                    Write-Host "URL: $($ii.url)"
                    if ($ii.extmetadata -and $ii.extmetadata.ImageDescription) {
                        Write-Host "Desc: $($ii.extmetadata.ImageDescription.value.Substring(0, [Math]::Min(100, $ii.extmetadata.ImageDescription.value.Length)))"
                    }
                }
            }
        }
    } catch {
        Write-Host "Err: $_"
    }
}