# Pinpoint line of bracket imbalance
$appJsPath = Join-Path (Resolve-Path "$PSScriptRoot\..") "app.js"
$appJsCode = [System.IO.File]::ReadAllText($appJsPath, [System.Text.Encoding]::UTF8)

$len = $appJsCode.Length
$i = 0
$state = "CODE"
$templateStack = @()

$curlOpen = 0; $curlClose = 0
$parenOpen = 0; $parenClose = 0

$line = 1

while ($i -lt $len) {
    $c = $appJsCode[$i]
    $next = if ($i + 1 -lt $len) { $appJsCode[$i + 1] } else { "" }

    if ($c -eq "`n") { $line++ }

    if ($state -eq "CODE") {
        if ($c -eq "/" -and $next -eq "/") {
            $state = "LINE_COMMENT"
            $i += 2; continue
        } elseif ($c -eq "/" -and $next -eq "*") {
            $state = "BLOCK_COMMENT"
            $i += 2; continue
        } elseif ($c -eq "'") {
            $state = "SINGLE"
            $i++; continue
        } elseif ($c -eq '"') {
            $state = "DOUBLE"
            $i++; continue
        } elseif ($c -eq '`') {
            $state = "TEMPLATE"
            $i++; continue
        } elseif ($c -eq '{') {
            $curlOpen++
        } elseif ($c -eq '}') {
            $curlClose++
            if ($templateStack.Count -gt 0) {
                $top = $templateStack[-1]
                if ($curlOpen - $curlClose -eq $top) {
                    $templateStack = if ($templateStack.Count -gt 1) { $templateStack[0..($templateStack.Count - 2)] } else { @() }
                    $state = "TEMPLATE"
                    $i++; continue
                }
            }
        } elseif ($c -eq '(') {
            $parenOpen++
        } elseif ($c -eq ')') {
            $parenClose++
        }
        $i++
    } elseif ($state -eq "LINE_COMMENT") {
        if ($c -eq "`n") { $state = "CODE" }
        $i++
    } elseif ($state -eq "BLOCK_COMMENT") {
        if ($c -eq "*" -and $next -eq "/") {
            $state = "CODE"
            $i += 2; continue
        }
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
        elseif ($c -eq "$" -and $next -eq "{") {
            $templateStack += ($curlOpen - $curlClose)
            $state = "CODE"
            $i += 2; continue
        } elseif ($c -eq '`') {
            $state = "CODE"
        }
        $i++
    }
}

Write-Host "End of file at line $line"
Write-Host "Final state: $state"
Write-Host "templateStack Count: $($templateStack.Count)"
Write-Host "curlOpen: $curlOpen, curlClose: $curlClose"
Write-Host "parenOpen: $parenOpen, parenClose: $parenClose"
