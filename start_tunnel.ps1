# Cloudflare Tunnel Auto Launcher for Care Portal
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = "Continue"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

$cloudflared = Join-Path $ScriptDir "cloudflared.exe"
if (-not (Test-Path $cloudflared)) {
    Write-Host "[ERROR] cloudflared.exe not found!" -ForegroundColor Red
    exit 1
}

$logFile = Join-Path $ScriptDir "tunnel.log"
if (Test-Path $logFile) { Remove-Item $logFile -Force -ErrorAction SilentlyContinue }

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "   Cloudflare Tunnel 外部アクセス通信トンネルを起動しています..." -ForegroundColor Yellow
Write-Host "======================================================================" -ForegroundColor Cyan

$proc = Start-Process -FilePath $cloudflared -ArgumentList "tunnel --url http://localhost:8888" -RedirectStandardError $logFile -PassThru -NoNewWindow

$tunnelUrl = $null
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Milliseconds 500
    if (Test-Path $logFile) {
        $logContent = Get-Content $logFile -Raw -ErrorAction SilentlyContinue
        if ($logContent -match "https://[a-zA-Z0-9-]+\.trycloudflare\.com") {
            $tunnelUrl = $matches[0]
            break
        }
    }
}

if ($tunnelUrl) {
    Set-Content -Path (Join-Path $ScriptDir "tunnel_url.txt") -Value $tunnelUrl -Encoding UTF8
    Clear-Host
    Write-Host "======================================================================" -ForegroundColor Green
    Write-Host "   【外部接続・スマホ用】Cloudflare Tunnel 接続準備完了！" -ForegroundColor Cyan
    Write-Host "======================================================================" -ForegroundColor Green
    Write-Host ""
    Write-Host " 外部アクセス・スマホ用 公開URL:" -ForegroundColor White
    Write-Host "    $tunnelUrl" -ForegroundColor Yellow -BackgroundColor Black
    Write-Host ""
    Write-Host " ※ スマホの4G/5G回線や外出先、学校Wi-Fiからでもそのまま接続できます！" -ForegroundColor Gray
    Write-Host " ※ この画面を開いている間、外部からアクセスが可能です。" -ForegroundColor Magenta
    Write-Host "======================================================================" -ForegroundColor Green
    Write-Host ""

    # ブラウザのポータル画面へトンネルURLを連携通知（クリップボードにもコピー）
    try { Set-Clipboard -Value $tunnelUrl } catch { }
} else {
    Write-Host "[WARNING] トンネルURLの自動取得に時間がかかっています。tunnel.log を確認してください。" -ForegroundColor Yellow
}

# プロセス監視待機
$proc.WaitForExit()
