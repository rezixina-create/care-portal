# Fetch Patient Photo from Wikimedia API (Pure ASCII)
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$baseDir = Split-Path -Parent $PSScriptRoot
$candidateDir = Join-Path $baseDir "tests\candidates"
$ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

$files = @(
    "Patient in hospital bed joondalup health campus.jpg",
    "Sepsis treatment.jpg",
    "Patient room with hospital bed.jpg"
)

foreach ($f in $files) {
    try {
        $encoded = [System.Uri]::EscapeDataString("File:$f")
        $apiUrl = "https://commons.wikimedia.org/w/api.php?action=query&titles=$encoded&prop=imageinfo&iiprop=url&format=json"
        
        $wc = New-Object System.Net.WebClient
        $wc.Headers.Add("User-Agent", $ua)
        $jsonStr = $wc.DownloadString($apiUrl)
        
        if ($jsonStr -match '"url":"([^"]+)"') {
            $imgUrl = $matches[1].Replace("\/", "/")
            Write-Host "Found URL for $f -> $imgUrl" -ForegroundColor Cyan
            
            $safeName = $f -replace "[^a-zA-Z0-9_\.]", "_"
            $outPath = Join-Path $candidateDir $safeName
            
            $wc.DownloadFile($imgUrl, $outPath)
            $fi = Get-Item $outPath
            Write-Host "  Downloaded $outPath ($($fi.Length) bytes)" -ForegroundColor Green
        }
    } catch {
        Write-Host "Error fetching $f : $($_.Exception.Message)" -ForegroundColor Red
    }
}
