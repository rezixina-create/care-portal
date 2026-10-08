$path = "C:\Users\s25153\.gemini\antigravity\brain\0ff4785c-e7ff-42b2-ac71-b50bdbb59dfc\care_portal\server.ps1"
$bytes = [System.IO.File]::ReadAllBytes($path)
$text = [System.Text.Encoding]::UTF8.GetString($bytes)
$utf8Bom = New-Object System.Text.UTF8Encoding $true
[System.IO.File]::WriteAllText($path, $text, $utf8Bom)
Write-Host "server.ps1 re-saved with UTF-8 BOM!"
