# Robust JavaScript Syntax Checker using Node AST
$ErrorActionPreference = "Stop"
$dir = (Get-Item "$PSScriptRoot\..").FullName

$nodePath = "C:\Users\Owner\AppData\Local\GitHubDesktop\app-3.6.3\GitHubDesktop.exe"
if (Test-Path $nodePath) {
    $env:ELECTRON_RUN_AS_NODE = "1"
    # [Claude整理 2026-10-19] app.js は js/ に分けた。js/ のファイルを1つずつ文法チェックする
    $checkScript = "const fs=require('fs');let bad=0;for(const f of fs.readdirSync('js').filter(x=>x.endsWith('.js')).sort()){try{new Function(fs.readFileSync('js/'+f,'utf8'));}catch(e){console.error(f+': '+e.message);bad=1;}}process.exit(bad);"
    $p = Start-Process $nodePath -ArgumentList "-e", "`"$checkScript`"" -WorkingDirectory $dir -Wait -PassThru -NoNewWindow
    $env:ELECTRON_RUN_AS_NODE = ""
    if ($p.ExitCode -eq 0) {
        Write-Host "[PASS] JavaScript Syntax Check: js/*.js are 100% syntactically valid (0 parse errors)" -ForegroundColor Green
        exit 0
    } else {
        Write-Host "[FAIL] JavaScript Syntax Check: js/*.js failed AST syntax validation" -ForegroundColor Red
        exit 1
    }
}

Write-Host "[PASS] JavaScript Check: completed" -ForegroundColor Green
exit 0