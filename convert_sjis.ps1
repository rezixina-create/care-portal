$path = "C:\Users\s25153\.gemini\antigravity\brain\0ff4785c-e7ff-42b2-ac71-b50bdbb59dfc\care_portal\プライベートネットワークに変更.bat"
$bytes = [System.IO.File]::ReadAllBytes($path)
$text = [System.Text.Encoding]::UTF8.GetString($bytes)
$sjis = [System.Text.Encoding]::GetEncoding(932)
[System.IO.File]::WriteAllText($path, $text, $sjis)
Write-Host "プライベートネットワークに変更.bat converted to Shift-JIS!"
