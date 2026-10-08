# Precise Bracket Lexer in PowerShell
param([string]$FilePath = "app.js")

$code = [System.IO.File]::ReadAllText($FilePath, [System.Text.Encoding]::UTF8)
$len = $code.Length

$curlyStack = 0
$parenStack = 0
$brackStack = 0

$curlyPairs = 0
$parenPairs = 0
$brackPairs = 0

$errors = @()

$i = 0
$mode = "CODE" # CODE, SINGLE_QUOTE, DOUBLE_QUOTE, TEMPLATE, REGEX, LINE_COMMENT, BLOCK_COMMENT
$templateCurlyStack = @()

$line = 1
$col = 1

while ($i -lt $len) {
    $c = $code[$i]
    $next = if ($i + 1 -lt $len) { $code[$i + 1] } else { "" }

    if ($c -eq "`n") {
        $line++
        $col = 1
    } else {
        $col++
    }

    if ($mode -eq "CODE") {
        if ($c -eq "/" -and $next -eq "/") {
            $mode = "LINE_COMMENT"
            $i += 2; continue
        } elseif ($c -eq "/" -and $next -eq "*") {
            $mode = "BLOCK_COMMENT"
            $i += 2; continue
        } elseif ($c -eq "'") {
            $mode = "SINGLE_QUOTE"
            $i++; continue
        } elseif ($c -eq '"') {
            $mode = "DOUBLE_QUOTE"
            $i++; continue
        } elseif ($c -eq '`') {
            $mode = "TEMPLATE"
            $i++; continue
        } elseif ($c -eq '{') {
            $curlyStack++
            $curlyPairs++
        } elseif ($c -eq '}') {
            $curlyStack--
            if ($curlyStack -lt 0) {
                $errors += "Extra closing brace '}' at line $line, col $col"
                $curlyStack = 0
            }
        } elseif ($c -eq '(') {
            $parenStack++
            $parenPairs++
        } elseif ($c -eq ')') {
            $parenStack--
            if ($parenStack -lt 0) {
                $errors += "Extra closing paren ')' at line $line, col $col"
                $parenStack = 0
            }
        } elseif ($c -eq '[') {
            $brackStack++
            $brackPairs++
        } elseif ($c -eq ']') {
            $brackStack--
            if ($brackStack -lt 0) {
                $errors += "Extra closing bracket ']' at line $line, col $col"
                $brackStack = 0
            }
        }
        $i++
    } elseif ($mode -eq "LINE_COMMENT") {
        if ($c -eq "`n") {
            $mode = "CODE"
        }
        $i++
    } elseif ($mode -eq "BLOCK_COMMENT") {
        if ($c -eq "*" -and $next -eq "/") {
            $mode = "CODE"
            $i += 2; continue
        }
        $i++
    } elseif ($mode -eq "SINGLE_QUOTE") {
        if ($c -eq "\") {
            $i += 2; continue
        } elseif ($c -eq "'") {
            $mode = "CODE"
        }
        $i++
    } elseif ($mode -eq "DOUBLE_QUOTE") {
        if ($c -eq "\") {
            $i += 2; continue
        } elseif ($c -eq '"') {
            $mode = "CODE"
        }
        $i++
    } elseif ($mode -eq "TEMPLATE") {
        if ($c -eq "\") {
            $i += 2; continue
        } elseif ($c -eq "$" -and $next -eq "{") {
            $templateCurlyStack += $curlyStack
            $curlyStack = 0
            $mode = "CODE"
            $i += 2; continue
        } elseif ($c -eq '`') {
            $mode = "CODE"
        }
        $i++
    }
}

if ($curlyStack -ne 0) {
    $errors += "Unclosed curly brace '{' count: $curlyStack"
}
if ($parenStack -ne 0) {
    $errors += "Unclosed paren '(' count: $parenStack"
}
if ($brackStack -ne 0) {
    $errors += "Unclosed square bracket '[' count: $brackStack"
}

if ($errors.Count -eq 0) {
    Write-Host "[PASS] Perfect Bracket Balance: { } = $curlyPairs pairs, ( ) = $parenPairs pairs, [ ] = $brackPairs pairs" -ForegroundColor Green
    exit 0
} else {
    Write-Host "[FAIL] Bracket balance errors ($($errors.Count) errors):" -ForegroundColor Red
    foreach ($e in $errors) {
        Write-Host "  $e" -ForegroundColor Red
    }
    exit $errors.Count
}
