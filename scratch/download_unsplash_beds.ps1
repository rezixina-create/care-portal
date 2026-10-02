# download_unsplash_beds.ps1
$urls = @(
    @{ name = "bed_cand1.jpg"; url = "https://images.unsplash.com/photo-1580869318757-a6c605b061ed?w=800&auto=format&fit=crop&q=80" },
    @{ name = "bed_cand2.jpg"; url = "https://images.unsplash.com/photo-1617952986600-802f965dcdbc?w=800&auto=format&fit=crop&q=80" }
)

foreach ($u in $urls) {
    $out = "tests\" + $u.name
    Write-Host "Downloading $($u.name)..."
    curl.exe -s -L -H "User-Agent: Mozilla/5.0" "$($u.url)" -o "$out"
    if (Test-Path $out) {
        $len = (Get-Item $out).Length
        Write-Host "Saved $($u.name) - $len bytes"
    }
}
