$appJsPath = Join-Path (Resolve-Path "$PSScriptRoot\..") "app.js"
$lines = [System.IO.File]::ReadAllLines($appJsPath, [System.Text.Encoding]::UTF8)

for ($idx = 3044; $idx -lt $lines.Length; $idx++) {
    $lineNum = $idx + 1
    $line = $lines[$idx]
    Write-Host "Line $lineNum : $line"
    $chars = $line.ToCharArray()
    for ($j = 0; $j -lt $chars.Length; $j++) {
        $c = $chars[$j]
        if ($c -eq '"' -or $c -eq "'" -or $c -eq '`') {
            Write-Host "   Char $j : $c (ASCII $([int]$c))"
        }
    }
}
