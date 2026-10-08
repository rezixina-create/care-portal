$desktop = [Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path $desktop "Care Portal.lnk"
$wshShell = New-Object -ComObject WScript.Shell
$shortcut = $wshShell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = "C:\Users\s25153\.gemini\antigravity\brain\0ff4785c-e7ff-42b2-ac71-b50bdbb59dfc\care_portal\run_portal.bat"
$shortcut.WorkingDirectory = "C:\Users\s25153\.gemini\antigravity\brain\0ff4785c-e7ff-42b2-ac71-b50bdbb59dfc\care_portal"
$shortcut.IconLocation = "shell32.dll, 14"
$shortcut.Save()
Write-Host "Care Portal.lnk desktop shortcut updated!"
