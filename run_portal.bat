@echo off
cd /d "%~dp0"
title Care Portal Server
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1"
