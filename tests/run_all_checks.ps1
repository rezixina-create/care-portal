# Care Portal Test Runner (Pure ASCII, compatible with PS 5.1)
$ErrorActionPreference = "Continue"
$carePortalDir = (Get-Item "$PSScriptRoot\..").FullName
$appJsPath = Join-Path $carePortalDir "app.js"
$indexHtmlPath = Join-Path $carePortalDir "index.html"
$serverPs1Path = Join-Path $carePortalDir "server.ps1"
$dbJsonPath = Join-Path $carePortalDir "data\portal_database.json"

$totalErrors = 0

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  Care Portal Comprehensive Multi-Level Verification" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# --------------------------------------------------------------
# Test 1: Bracket balance in app.js (State-machine parser)
# --------------------------------------------------------------
Write-Host "`n[Test 1] Bracket Balance Check (app.js)..." -ForegroundColor Yellow
$appJsCode = [System.IO.File]::ReadAllText($appJsPath, [System.Text.Encoding]::UTF8)

# Accurate token scan ignoring comments, single/double quotes, and template literals
$len = $appJsCode.Length
$i = 0
$state = "CODE" # CODE, SINGLE, DOUBLE, TEMPLATE, LINE_COMMENT, BLOCK_COMMENT
$templateStack = @() # stores bracket balance within template interpolations

$curlOpen = 0; $curlClose = 0
$parenOpen = 0; $parenClose = 0
$brackOpen = 0; $brackClose = 0

while ($i -lt $len) {
    $c = $appJsCode[$i]
    $next = if ($i + 1 -lt $len) { $appJsCode[$i + 1] } else { "" }

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
        } elseif ($c -eq '[') {
            $brackOpen++
        } elseif ($c -eq ']') {
            $brackClose++
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

$t1Err = 0
if ($curlOpen -ne $curlClose) {
    Write-Host "  [FAIL] Curly brackets mismatch: { = $curlOpen, } = $curlClose" -ForegroundColor Red
    $t1Err++
}
if ($parenOpen -ne $parenClose) {
    Write-Host "  [FAIL] Parentheses mismatch: ( = $parenOpen, ) = $parenClose" -ForegroundColor Red
    $t1Err++
}
if ($brackOpen -ne $brackClose) {
    Write-Host "  [FAIL] Square brackets mismatch: [ = $brackOpen, ] = $brackClose" -ForegroundColor Red
    $t1Err++
}

if ($t1Err -eq 0) {
    Write-Host "  [PASS] Perfect Bracket Balance: { } = $curlOpen pairs, ( ) = $parenOpen pairs, [ ] = $brackOpen pairs" -ForegroundColor Green
} else {
    $totalErrors += $t1Err
}

# --------------------------------------------------------------
# Test 2: DOM ID Consistency (index.html vs app.js)
# --------------------------------------------------------------
Write-Host "`n[Test 2] DOM ID Consistency Check..." -ForegroundColor Yellow
$indexHtml = [System.IO.File]::ReadAllText($indexHtmlPath, [System.Text.Encoding]::UTF8)

# Extract all IDs from index.html
$htmlIds = @{}
$idMatches = [System.Text.RegularExpressions.Regex]::Matches($indexHtml, 'id=["'']([^"'']+)["'']')
$dupIds = @()
foreach ($m in $idMatches) {
    $id = $m.Groups[1].Value
    if ($htmlIds.ContainsKey($id)) {
        $dupIds += $id
    } else {
        $htmlIds[$id] = $true
    }
}

$t2Err = 0
if ($dupIds.Count -gt 0) {
    Write-Host "  [FAIL] Duplicate DOM IDs found: $($dupIds -join ', ')" -ForegroundColor Red
    $t2Err++
}

# Check getElementById references in app.js
$jsIdMatches = [System.Text.RegularExpressions.Regex]::Matches($appJsCode, 'getElementById\s*\(\s*["'']([^"'']+)["'']\s*\)')
$missingIds = @()
$allowedDynamicIds = @("customPrintArea", "dynamicReport")
foreach ($m in $jsIdMatches) {
    $targetId = $m.Groups[1].Value
    if (-not $htmlIds.ContainsKey($targetId) -and -not $allowedDynamicIds.Contains($targetId)) {
        if (-not $missingIds.Contains($targetId)) {
            $missingIds += $targetId
        }
    }
}

if ($missingIds.Count -gt 0) {
    Write-Host "  [FAIL] Missing DOM ID references in HTML ($($missingIds.Count) items): $($missingIds -join ', ')" -ForegroundColor Red
    $t2Err++
}

if ($t2Err -eq 0) {
    Write-Host "  [PASS] All $($htmlIds.Count) DOM IDs are unique. Zero undefined DOM ID references from JS." -ForegroundColor Green
} else {
    $totalErrors += $t2Err
}

# --------------------------------------------------------------
# Test 3: Static onclick handlers (index.html)
# --------------------------------------------------------------
Write-Host "`n[Test 3] Static onclick Handlers Check (index.html)..." -ForegroundColor Yellow
$onclickMatches = [System.Text.RegularExpressions.Regex]::Matches($indexHtml, 'onclick=["'']\s*([a-zA-Z0-9_]+)\s*\(')
$uniqueOnclicks = @($onclickMatches | ForEach-Object { $_.Groups[1].Value } | Select-Object -Unique)

$missingHandlers = @()
foreach ($fn in $uniqueOnclicks) {
    if ($fn -eq "if" -or $fn -eq "alert" -or $fn -eq "confirm") { continue }
    $regex = "(?:function\s+$fn\b|class\s+$fn\b|const\s+$fn\s*=|let\s+$fn\s*=|var\s+$fn\s*=|window\.$fn\s*=)"
    if (-not [System.Text.RegularExpressions.Regex]::IsMatch($appJsCode, $regex)) {
        $missingHandlers += $fn
    }
}

if ($missingHandlers.Count -gt 0) {
    Write-Host "  [FAIL] Missing static onclick handlers ($($missingHandlers.Count) items): $($missingHandlers -join ', ')" -ForegroundColor Red
    $totalErrors += $missingHandlers.Count
} else {
    Write-Host "  [PASS] All $($uniqueOnclicks.Count) static onclick handlers exist in app.js" -ForegroundColor Green
}

# --------------------------------------------------------------
# Test 4: Dynamic onclick handlers (app.js generated)
# --------------------------------------------------------------
Write-Host "`n[Test 4] Dynamic onclick Handlers Check (app.js generated)..." -ForegroundColor Yellow
$dynamicOnclickMatches = [System.Text.RegularExpressions.Regex]::Matches($appJsCode, 'onclick=["'']\s*([a-zA-Z0-9_]+)\s*\(')
$uniqueDynamicOnclicks = @($dynamicOnclickMatches | ForEach-Object { $_.Groups[1].Value } | Select-Object -Unique)

$missingDynamicHandlers = @()
foreach ($fn in $uniqueDynamicOnclicks) {
    if ($fn -eq "if" -or $fn -eq "alert" -or $fn -eq "confirm") { continue }
    $regex = "(?:function\s+$fn\b|class\s+$fn\b|const\s+$fn\s*=|let\s+$fn\s*=|var\s+$fn\s*=|window\.$fn\s*=)"
    if (-not [System.Text.RegularExpressions.Regex]::IsMatch($appJsCode, $regex)) {
        $missingDynamicHandlers += $fn
    }
}

if ($missingDynamicHandlers.Count -gt 0) {
    Write-Host "  [FAIL] Missing dynamic onclick handlers ($($missingDynamicHandlers.Count) items): $($missingDynamicHandlers -join ', ')" -ForegroundColor Red
    $totalErrors += $missingDynamicHandlers.Count
} else {
    Write-Host "  [PASS] All $($uniqueDynamicOnclicks.Count) dynamic onclick handlers exist in app.js" -ForegroundColor Green
}

# --------------------------------------------------------------
# Test 5: Server PowerShell Syntax Check (server.ps1)
# --------------------------------------------------------------
Write-Host "`n[Test 5] Server Syntax Check (server.ps1)..." -ForegroundColor Yellow
$tokens = $null
$parseErrors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile($serverPs1Path, [ref]$tokens, [ref]$parseErrors)

if ($parseErrors.Count -gt 0) {
    Write-Host "  [FAIL] server.ps1 syntax errors found ($($parseErrors.Count) items):" -ForegroundColor Red
    foreach ($err in $parseErrors) {
        Write-Host "    Line $($err.Extent.StartLineNumber): $($err.Message)" -ForegroundColor Red
    }
    $totalErrors += $parseErrors.Count
} else {
    Write-Host "  [PASS] server.ps1 syntax check: 0 errors (valid PowerShell AST)" -ForegroundColor Green
}

# --------------------------------------------------------------
# Test 6: Database JSON Schema Check (portal_database.json)
# --------------------------------------------------------------
Write-Host "`n[Test 6] Database JSON Schema Check..." -ForegroundColor Yellow
if (Test-Path $dbJsonPath) {
    try {
        $dbRaw = [System.IO.File]::ReadAllText($dbJsonPath, [System.Text.Encoding]::UTF8)
        $dbObj = $dbRaw | ConvertFrom-Json
        $reqKeys = @(
            "residents", "stamps", "templates", "suppliers", "inventory",
            "emergency_supplies", "belongings", "equipments", "recreations",
            "vehicle_logs", "fire_drills", "committees", "care_records",
            "shifts", "notebooks", "notebook_stamps", "vitals", "excretions",
            "meals", "oral_cares", "baths", "meds", "turns", "linens",
            "groomings", "weight_records", "visitations", "inventory_logs",
            "consumptions", "orders", "deposits", "complaints", "incidents"
        )
        $missingKeys = @()
        foreach ($k in $reqKeys) {
            if (-not ($dbObj.PSObject.Properties.Name -contains $k)) {
                $missingKeys += $k
            }
        }
        if ($missingKeys.Count -gt 0) {
            Write-Host "  [FAIL] Missing table keys in database JSON: $($missingKeys -join ', ')" -ForegroundColor Red
            $totalErrors += $missingKeys.Count
        } else {
            Write-Host "  [PASS] Database JSON valid: all $($reqKeys.Count) master table arrays exist" -ForegroundColor Green
        }
    } catch {
        Write-Host "  [FAIL] Database JSON parsing error: $_" -ForegroundColor Red
        $totalErrors++
    }
} else {
    Write-Host "  [INFO] portal_database.json not created yet (will be created automatically on first save)" -ForegroundColor Cyan
}

# --------------------------------------------------------------
# Summary
# --------------------------------------------------------------
Write-Host "`n==========================================================" -ForegroundColor Cyan
if ($totalErrors -eq 0) {
    Write-Host "  [PERFECT PASS] ALL 6 CHECKS PASSED WITH 0 ERRORS!" -ForegroundColor Green
} else {
    Write-Host "  [FAILED] Total $totalErrors errors detected." -ForegroundColor Red
}
Write-Host "==========================================================" -ForegroundColor Cyan

exit $totalErrors
