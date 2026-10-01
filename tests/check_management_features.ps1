# Management Features Verification (Staff, Resident, Supplier, Stamp)
$ErrorActionPreference = "Stop"
$dir = (Get-Item "$PSScriptRoot\..").FullName
$html = [System.IO.File]::ReadAllText("$dir\index.html", [System.Text.Encoding]::UTF8)
$js = [System.IO.File]::ReadAllText("$dir\app.js", [System.Text.Encoding]::UTF8)
$css = [System.IO.File]::ReadAllText("$dir\style.css", [System.Text.Encoding]::UTF8)

$errors = @()

# 1. HTML 要素チェック
$reqElements = @(
    "residentModal", "resModalTitle", "resEditId", "resRoomNo", "resName",
    "staffModal", "staffModalList", "newStaffName", "newStaffRole",
    "supplierModal", "suppName", "suppPhone", "suppContact", "suppliersTable",
    "notebookStampBtn", "hankoStampArea"
)
foreach ($el in $reqElements) {
    if ($html -notmatch "id=['`"]$el['`"]") {
        $errors += "Missing HTML element id='$el'"
    }
}

# 2. JS 関数チェック
$reqFunctions = @(
    "openAddResidentModal", "openEditResidentModal", "submitResidentForm",
    "openStaffModal", "renderStaffModalList", "submitNewStaffStamp", "deleteStaffStamp",
    "openSupplierModal", "submitNewSupplier", "deleteSupplier",
    "toggleNotebookStamp", "removeNotebookStamp",
    "getStaffRoleRank", "sortStaffList", "autoSortStaffByRank", "moveStaffOrder"
)
foreach ($fn in $reqFunctions) {
    if ($js -notmatch "function\s+$fn\b") {
        $errors += "Missing JS function: $fn"
    }
}

# 3. CSS チェック (長方形スタンプ ＆ 取り消しホバー効果)
if ($css -notmatch "\.hanko-stamp:hover::after") {
    $errors += "Missing .hanko-stamp:hover::after in style.css"
}
if ($css -notmatch "border-radius:\s*4px") {
    $errors += "Missing border-radius: 4px for rectangular stamp in style.css"
}

if ($errors.Count -gt 0) {
    Write-Host "[FAIL] Management Features Errors ($($errors.Count)):" -ForegroundColor Red
    foreach ($e in $errors) { Write-Host "  $e" -ForegroundColor Red }
    exit 1
}

Write-Host "[PASS] Management Features Check: All $($reqElements.Count) UI elements, $($reqFunctions.Count) JS functions, and CSS styles verified" -ForegroundColor Green
exit 0
