# Download Wikimedia Candidates via Direct MD5 Calculation (Pure ASCII)
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$baseDir = Split-Path -Parent $PSScriptRoot
$candidateDir = Join-Path $baseDir "tests\candidates"
if (-not (Test-Path $candidateDir)) {
    New-Item -ItemType Directory -Path $candidateDir -Force | Out-Null
}

$ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

function Get-WikimediaUrl($filename) {
    $cleanName = $filename -replace " ", "_"
    $cleanName = $cleanName.Substring(0,1).ToUpper() + $cleanName.Substring(1)
    $md5 = [System.Security.Cryptography.MD5]::Create()
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($cleanName)
    $hash = ($md5.ComputeHash($bytes) | ForEach-Object { $_.ToString("x2") }) -join ""
    $a = $hash.Substring(0,1)
    $ab = $hash.Substring(0,2)
    $escaped = [System.Uri]::EscapeDataString($cleanName)
    return "https://upload.wikimedia.org/wikipedia/commons/$a/$ab/$escaped"
}

$files = @(
    "Patient in hospital bed joondalup health campus.jpg",
    "Oncology doctor consults with patient.jpg",
    "Doctor's discussing a patient.jpg",
    "Clinicians in Intensive Care Unit.jpg",
    "Patient room with hospital bed.jpg",
    "Hill-Rom hospital bed.JPG"
)

$wc = New-Object System.Net.WebClient
$wc.Headers.Add("User-Agent", $ua)

foreach ($f in $files) {
    $url = Get-WikimediaUrl $f
    $safeName = $f -replace "[^a-zA-Z0-9_\.]", "_"
    $outPath = Join-Path $candidateDir $safeName
    
    Write-Host "Downloading $f from $url..." -ForegroundColor Cyan
    try {
        $wc.DownloadFile($url, $outPath)
        $fi = Get-Item $outPath
        if ($fi.Length -gt 15000) {
            Write-Host "  -> Success ($($fi.Length) bytes)" -ForegroundColor Green
        } else {
            Write-Host "  -> Failed: too small ($($fi.Length) bytes)" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "  -> Error: $($_.Exception.Message)" -ForegroundColor Red
    }
}
