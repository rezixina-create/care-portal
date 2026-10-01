# Server Syntax & AST Check
$ErrorActionPreference = "Stop"
$dir = (Get-Item "$PSScriptRoot\..").FullName
$serverPs1 = "$dir\server.ps1"

$tokens = $null
$parseErrors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile($serverPs1, [ref]$tokens, [ref]$parseErrors)

if ($parseErrors.Count -gt 0) {
    Write-Host "[FAIL] server.ps1 syntax errors ($($parseErrors.Count)):" -ForegroundColor Red
    foreach ($e in $parseErrors) {
        Write-Host "  Line $($e.Extent.StartLineNumber): $($e.Message)" -ForegroundColor Red
    }
    exit 1
}

Write-Host "[PASS] Server Syntax Check: server.ps1 valid PowerShell AST (0 errors)" -ForegroundColor Green
exit 0
