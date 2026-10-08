# Download Unsplash images (Pure ASCII)
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$baseDir = Split-Path -Parent $PSScriptRoot
$candidateDir = Join-Path $baseDir "tests\candidates"
$ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

$urls = @(
    @{ Name = "bed_window"; Url = "https://images.unsplash.com/photo-1613377512409-59c33c10c821?auto=format&fit=crop&w=1000&q=80" },
    @{ Name = "bed_couch"; Url = "https://images.unsplash.com/photo-1512678080530-7760d81faba6?auto=format&fit=crop&w=1000&q=80" },
    @{ Name = "person_iv"; Url = "https://images.unsplash.com/photo-1563233269-7e86880558a7?auto=format&fit=crop&w=1000&q=80" }
)

$wc = New-Object System.Net.WebClient
$wc.Headers.Add("User-Agent", $ua)

foreach ($u in $urls) {
    $out = Join-Path $candidateDir "$($u.Name).jpg"
    Write-Host "Downloading $($u.Name)..."
    try {
        $wc.DownloadFile($u.Url, $out)
        $fi = Get-Item $out
        Write-Host "  Success: $($u.Name) ($($fi.Length) bytes)" -ForegroundColor Green
    } catch {
        Write-Host "  Error: $($_.Exception.Message)" -ForegroundColor Red
    }
}
