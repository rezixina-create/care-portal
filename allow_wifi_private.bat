@echo off
title Switch Wi-Fi to Private Network

echo ======================================================================
echo  Wi-Fi Network Profile Switcher
echo ======================================================================
echo.
echo Changing Wi-Fi Network Category to Private (Trusted)...
echo.

powershell -Command "Set-NetConnectionProfile -InterfaceAlias 'Wi-Fi' -NetworkCategory Private"

if %errorLevel% equ 0 (
    echo [SUCCESS] Wi-Fi network category changed to Private!
) else (
    echo [NOTE] Please right-click this batch file and select "Run as Administrator".
)

pause
