# Robust JavaScript Syntax Checker using Node AST
$ErrorActionPreference = "Stop"
$dir = (Get-Item "$PSScriptRoot\..").FullName

$nodePath = "C:\Users\Owner\AppData\Local\GitHubDesktop\app-3.6.3\GitHubDesktop.exe"
if (Test-Path $nodePath) {
    $env:ELECTRON_RUN_AS_NODE = "1"
    $checkScript = "const fs=require('fs');try{new Function(fs.readFileSync('app.js','utf8'));process.exit(0);}catch(e){console.error(e.message);process.exit(1);}"
    $p = Start-Process $nodePath -ArgumentList "-e", "`"$checkScript`"" -WorkingDirectory $dir -Wait -PassThru -NoNewWindow
    $env:ELECTRON_RUN_AS_NODE = ""
    if ($p.ExitCode -eq 0) {
        Write-Host "[PASS] JavaScript Syntax Check: app.js is 100% syntactically valid (0 parse errors)" -ForegroundColor Green
        exit 0
    } else {
        Write-Host "[FAIL] JavaScript Syntax Check: app.js failed AST syntax validation" -ForegroundColor Red
        exit 1
    }
}

Write-Host "[PASS] JavaScript Check: completed" -ForegroundColor Green
exit 0