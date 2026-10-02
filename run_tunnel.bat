@echo off
cd /d "%~dp0"
title Care Portal Cloudflare Tunnel (外部アクセス用)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start_tunnel.ps1"
if errorlevel 1 (
    echo.
    echo Tunnel stopped with error.
    pause
)
