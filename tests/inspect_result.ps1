$c = [System.IO.File]::ReadAllText("$PSScriptRoot\e2e_result.html", [System.Text.Encoding]::UTF8)
if ($c -match '<div id="testLog">([\s\S]*?)</div>') {
    Write-Host "testLog content:"
    Write-Host $Matches[1]
} else {
    Write-Host "testLog not found in e2e_result.html"
}
if ($c -match '<div id="testSummary"[^>]*>([\s\S]*?)</div>') {
    Write-Host "testSummary content:"
    Write-Host $Matches[1]
}
