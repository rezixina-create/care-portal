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

# Also verify C# code inside $ServerSource compiles
$serverContent = [System.IO.File]::ReadAllText($serverPs1, [System.Text.Encoding]::UTF8)
if ($serverContent -match '(?ms)\$ServerSource = @''\r?\n(.*?)\r?\n''@') {
    $cs = $matches[1]
    try {
        Add-Type -TypeDefinition $cs -Language CSharp -ErrorAction Stop
    } catch {
        Write-Host "[FAIL] server.ps1 C# code compilation failed: $_" -ForegroundColor Red
        exit 1
    }
}

Write-Host "[PASS] Server Syntax Check: server.ps1 valid PowerShell AST & C# code (0 errors)" -ForegroundColor Green
exit 0
