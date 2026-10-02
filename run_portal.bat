@echo off
cd /d "%~dp0"
title Care Portal Server (サーバー ＆ 外部トンネル統合)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1"
if errorlevel 1 (
    echo.
    echo Server stopped with error.
    pause
)