param([string]$target)
$bytes = [System.IO.File]::ReadAllBytes($target)
$bom = [byte[]]@(0xEF, 0xBB, 0xBF)
if ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
    Write-Host "Already has BOM: $target"
} else {
    $all = New-Object byte[] ($bom.Length + $bytes.Length)
    [System.Buffer]::BlockCopy($bom, 0, $all, 0, $bom.Length)
    [System.Buffer]::BlockCopy($bytes, 0, $all, $bom.Length, $bytes.Length)
    [System.IO.File]::WriteAllBytes($target, $all)
    Write-Host "Added BOM to: $target"
}
