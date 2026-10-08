# Database JSON Structure & Array Keys Check
$ErrorActionPreference = "Stop"
$dir = (Get-Item "$PSScriptRoot\..").FullName
$dbPath = "$dir\data\portal_database.json"

if (-not (Test-Path $dbPath)) {
    Write-Host "[INFO] portal_database.json not created yet (standalone seed data will initialize on first load)" -ForegroundColor Cyan
    exit 0
}

$raw = [System.IO.File]::ReadAllText($dbPath, [System.Text.Encoding]::UTF8)
$db = $raw | ConvertFrom-Json

$reqKeys = @(
    "residents", "stamps", "templates", "suppliers", "inventory",
    "emergency_supplies", "belongings", "equipments", "recreations",
    "vehicle_logs", "fire_drills", "committees", "care_records",
    "shifts", "notebooks", "notebook_stamps", "vitals", "excretions",
    "meals", "oral_cares", "baths", "meds", "turns", "linens",
    "groomings", "weight_records", "visitations", "inventory_logs",
    "consumptions", "orders", "deposits", "complaints", "incidents", "photos"
)

$missing = @()
foreach ($k in $reqKeys) {
    if (-not ($db.PSObject.Properties.Name -contains $k)) {
        $missing += $k
    }
}

if ($missing.Count -gt 0) {
    Write-Host "[FAIL] Missing keys in database JSON: $($missing -join ', ')" -ForegroundColor Red
    exit 1
}

Write-Host "[PASS] Database JSON Check: Valid JSON with all $($reqKeys.Count) master table arrays" -ForegroundColor Green
exit 0
