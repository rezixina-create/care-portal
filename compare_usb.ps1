$usbPath = "D:\care_portal"
$pcPath = "C:\Users\s25153\.gemini\antigravity\brain\0ff4785c-e7ff-42b2-ac71-b50bdbb59dfc\care_portal"

Write-Host "=== USB Database File ==="
if (Test-Path "$usbPath\data\portal_database.json") {
    $f = Get-Item "$usbPath\data\portal_database.json"
    Write-Host "Path: $($f.FullName)"
    Write-Host "LastWriteTime: $($f.LastWriteTime)"
    Write-Host "Length: $($f.Length) bytes"
} else {
    Write-Host "USB database not found!"
}

Write-Host ""
Write-Host "=== PC Database File ==="
if (Test-Path "$pcPath\data\portal_database.json") {
    $f = Get-Item "$pcPath\data\portal_database.json"
    Write-Host "Path: $($f.FullName)"
    Write-Host "LastWriteTime: $($f.LastWriteTime)"
    Write-Host "Length: $($f.Length) bytes"
} else {
    Write-Host "PC database not found!"
}

Write-Host ""
Write-Host "=== USB Backup Files ==="
if (Test-Path "$usbPath\data\backup") {
    Get-ChildItem "$usbPath\data\backup" | Select-Object Name, Length, LastWriteTime | Format-Table -AutoSize
}

Write-Host ""
Write-Host "=== PC Backup Files ==="
if (Test-Path "$pcPath\data\backup") {
    Get-ChildItem "$pcPath\data\backup" | Select-Object Name, Length, LastWriteTime | Format-Table -AutoSize
}
