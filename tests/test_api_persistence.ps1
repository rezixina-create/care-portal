$ErrorActionPreference = "Stop"

$baseDir = Resolve-Path .
$serverScript = Join-Path $baseDir "server.ps1"
$serverProc = Start-Process powershell -ArgumentList "-ExecutionPolicy Bypass -File `"$serverScript`" -NoBrowser -NoTunnel" -PassThru -WindowStyle Hidden
Start-Sleep -Seconds 2

try {
  $data = Invoke-RestMethod -Uri "http://127.0.0.1:8888/api/data" -Method Get
  Write-Host "Initial Resident 1 name:" $data.residents[0].name
  Write-Host "Initial Resident 1 clinic notes:" $data.residents[0].clinic_special_notes

  $origNote = $data.residents[0].clinic_special_notes
  $origDr = $data.residents[0].dr_instructions
  $origDate = $data.residents[0].next_clinic_date

  $newNote = "TEST_CLINIC_NOTE_PERSISTENCE_2026"
  $newDr = "TEST_DR_INSTRUCTIONS_PERSISTENCE_2026"
  $newDate = "2026-11-01"

  $data.residents[0].clinic_special_notes = $newNote
  $data.residents[0].dr_instructions = $newDr
  $data.residents[0].next_clinic_date = $newDate

  $jsonBody = $data | ConvertTo-Json -Depth 10 -Compress
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($jsonBody)

  $req = [System.Net.HttpWebRequest]::Create("http://127.0.0.1:8888/api/save")
  $req.Method = "POST"
  $req.ContentType = "application/json; charset=utf-8"
  $req.ContentLength = $bytes.Length
  $stream = $req.GetRequestStream()
  $stream.Write($bytes, 0, $bytes.Length)
  $stream.Close()
  $resp = $req.GetResponse()
  $resp.Close()

  Write-Host "[PASS] Save request sent successfully"

  # Reload: simulate opening page fresh / F5
  $verifyData = Invoke-RestMethod -Uri "http://127.0.0.1:8888/api/data" -Method Get
  Write-Host "Reloaded Resident 1 clinic notes:" $verifyData.residents[0].clinic_special_notes
  Write-Host "Reloaded Resident 1 dr instructions:" $verifyData.residents[0].dr_instructions
  Write-Host "Reloaded Resident 1 next date:" $verifyData.residents[0].next_clinic_date

  if ($verifyData.residents[0].clinic_special_notes -eq $newNote -and $verifyData.residents[0].dr_instructions -eq $newDr -and $verifyData.residents[0].next_clinic_date -eq $newDate) {
    Write-Host "[SUCCESS] Data is 100% PERSISTENT and retained after reload!" -ForegroundColor Green
  } else {
    Write-Host "[FAIL] Data was NOT retained!" -ForegroundColor Red
    exit 1
  }

  # Restore original so DB remains pristine
  $data.residents[0].clinic_special_notes = $origNote
  $data.residents[0].dr_instructions = $origDr
  $data.residents[0].next_clinic_date = $origDate
  $jsonRestore = $data | ConvertTo-Json -Depth 10 -Compress
  $bytesRestore = [System.Text.Encoding]::UTF8.GetBytes($jsonRestore)
  $reqR = [System.Net.HttpWebRequest]::Create("http://127.0.0.1:8888/api/save")
  $reqR.Method = "POST"
  $reqR.ContentType = "application/json; charset=utf-8"
  $reqR.ContentLength = $bytesRestore.Length
  $streamR = $reqR.GetRequestStream()
  $streamR.Write($bytesRestore, 0, $bytesRestore.Length)
  $streamR.Close()
  $respR = $reqR.GetResponse()
  $respR.Close()
  Write-Host "[PASS] Cleaned up and restored initial state."
} finally {
  Stop-Process -Id $serverProc.Id -Force
}
