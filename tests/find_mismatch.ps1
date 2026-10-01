param([string]$FilePath = "app.js")

$lines = [System.IO.File]::ReadAllLines($FilePath, [System.Text.Encoding]::UTF8)
$curl = 0; $paren = 0; $brack = 0

for ($idx = 0; $idx -lt $lines.Length; $idx++) {
    $line = $lines[$idx]
    # Check if line contains regex with bracket
    if ($line -match '/.*[{}()[\]].*/') {
        Write-Host "Regex line at $($idx + 1): $line"
    }
}
