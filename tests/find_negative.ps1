$dir = (Get-Item "$PSScriptRoot\..").FullName
$lines = [System.IO.File]::ReadAllLines("$dir\app.js", [System.Text.Encoding]::UTF8)

$cleanLines = @()
foreach ($l in $lines) {
    $cl = [System.Text.RegularExpressions.Regex]::Replace($l, '//.*$', '')
    $cl = [System.Text.RegularExpressions.Regex]::Replace($cl, '\"(\\.|[^\"])*\"', '""')
    $cl = [System.Text.RegularExpressions.Regex]::Replace($cl, "\'(\\.|[^\'])*\'", "''")
    $cleanLines += $cl
}

# 全体を結合してバッククォートを除去
$full = $cleanLines -join "`n"
for ($depth = 0; $depth -lt 5; $depth++) {
    $full = [System.Text.RegularExpressions.Regex]::Replace($full, '\`[^`]*\`', '``')
}

$processedLines = $full -split "`n"
$curlDiff = 0
$parenDiff = 0

for ($i = 0; $i -lt $processedLines.Length; $i++) {
    $l = $processedLines[$i]
    $cO = ($l.ToCharArray() | ?{ $_ -eq '{' }).Count
    $cC = ($l.ToCharArray() | ?{ $_ -eq '}' }).Count
    $pO = ($l.ToCharArray() | ?{ $_ -eq '(' }).Count
    $pC = ($l.ToCharArray() | ?{ $_ -eq ')' }).Count

    $curlDiff += ($cO - $cC)
    $parenDiff += ($pO - $pC)

    if ($curlDiff -lt 0) {
        Write-Host "Curly negative at line $($i + 1): curlDiff=$curlDiff => $l"
        $curlDiff = 0
    }
    if ($parenDiff -lt 0) {
        Write-Host "Paren negative at line $($i + 1): parenDiff=$parenDiff => $l"
        $parenDiff = 0
    }
}
Write-Host "Final: curlDiff=$curlDiff, parenDiff=$parenDiff"
