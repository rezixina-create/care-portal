# B5 Care Record Features Verification
$ErrorActionPreference = "Stop"
$dir = (Get-Item "$PSScriptRoot\..").FullName
$html = [System.IO.File]::ReadAllText("$dir\index.html", [System.Text.Encoding]::UTF8)
$js = [System.IO.File]::ReadAllText("$dir\app.js", [System.Text.Encoding]::UTF8)
$css = [System.IO.File]::ReadAllText("$dir\style.css", [System.Text.Encoding]::UTF8)

$errors = @()

# 1. HTML 要素チェック
$reqElements = @(
    "recordTargetResidentBanner", "recordTargetResidentText",
    "recordCharCount", "recordB5Badge", "recordContent",
    "fullscreenRecordModal", "fsResidentBadge", "fsCharCount",
    "fsB5Badge", "fsRecordContent", "fsQuickTemplatesList",
    "printArea", "selectedDateRecordsList"
)
foreach ($el in $reqElements) {
    if ($html -notmatch "id=['`"]$el['`"]") {
        $errors += "Missing HTML element id='$el'"
    }
}

# 2. JS 関数チェック
$reqFunctions = @(
    "updateRecordTargetBanner", "updateRecordCharCount", "insertB5Template",
    "openFullscreenRecord", "closeFullscreenRecord", "syncFromFullscreen",
    "submitCareRecordFromFullscreen", "clearRecordForm", "printSelectedDateRecords",
    "escapeHtml", "renderSelectedDateRecords"
)
foreach ($fn in $reqFunctions) {
    if ($js -notmatch "function\s+$fn\b") {
        $errors += "Missing JS function: $fn"
    }
}

# 3. CSS スタイルチェック
$reqCss = @("#recordContent", "#fsRecordContent", ".care-record-card", ".care-record-body", "@media print", "#printArea")
foreach ($c in $reqCss) {
    if ($css -notmatch [regex]::Escape($c)) {
        $errors += "Missing CSS rule: $c"
    }
}

# 4. 呼び出し連動チェック
if ($js -notmatch "function selectResident\b[\s\S]*?updateRecordTargetBanner\(\)") {
    $errors += "selectResident does not call updateRecordTargetBanner()"
}
if ($js -notmatch "addEventListener\(['`"]DOMContentLoaded['`"][\s\S]*?updateRecordCharCount\(\)") {
    $errors += "DOMContentLoaded does not call updateRecordCharCount()"
}

if ($errors.Count -gt 0) {
    Write-Host "[FAIL] B5 Feature Verification Errors ($($errors.Count)):" -ForegroundColor Red
    foreach ($e in $errors) { Write-Host "  $e" -ForegroundColor Red }
    exit 1
}

Write-Host "[PASS] B5 Features Check: All $($reqElements.Count) UI elements, $($reqFunctions.Count) JS functions, and CSS rules fully integrated" -ForegroundColor Green
exit 0
