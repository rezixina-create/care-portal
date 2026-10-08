$appJsPath = Join-Path (Resolve-Path "$PSScriptRoot\..") "app.js"
$appJsCode = [System.IO.File]::ReadAllText($appJsPath, [System.Text.Encoding]::UTF8)

$len = $appJsCode.Length
$i = 0
$state = "CODE"
$line = 1
$doubleStartLine = 0

while ($i -lt $len) {
    $c = $appJsCode[$i]
    $next = if ($i + 1 -lt $len) { $appJsCode[$i + 1] } else { "" }
    if ($c -eq "`n") { $line++ }

    if ($state -eq "CODE") {
        if ($c -eq "/" -and $next -eq "/") { $state = "LINE_COMMENT"; $i += 2; continue }
        elseif ($c -eq "/" -and $next -eq "*") { $state = "BLOCK_COMMENT"; $i += 2; continue }
        elseif ($c -eq "'") { $state = "SINGLE"; $i++; continue }
        elseif ($c -eq '"') { $state = "DOUBLE"; $doubleStartLine = $line; $i++; continue }
        elseif ($c -eq '`') { $state = "TEMPLATE"; $i++; continue }
        $i++
    } elseif ($state -eq "LINE_COMMENT") {
        if ($c -eq "`n") { $state = "CODE" }
        $i++
    } elseif ($state -eq "BLOCK_COMMENT") {
        if ($c -eq "*" -and $next -eq "/") { $state = "CODE"; $i += 2; continue }
        $i++
    } elseif ($state -eq "SINGLE") {
        if ($c -eq "\") { $i += 2; continue }
        elseif ($c -eq "'") { $state = "CODE" }
        $i++
    } elseif ($state -eq "DOUBLE") {
        if ($c -eq "\") { $i += 2; continue }
        elseif ($c -eq '"') { $state = "CODE" }
        $i++
    } elseif ($state -eq "TEMPLATE") {
        if ($c -eq "\") { $i += 2; continue }
        elseif ($c -eq "$" -and $next -eq "{") { $state = "CODE"; $i += 2; continue }
        elseif ($c -eq '`') { $state = "CODE" }
        $i++
    }
}

Write-Host "Unclosed double quote started at line: $doubleStartLine"
