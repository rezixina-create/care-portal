@echo off
chcp 65001 > nul
title Wi-Fi Network Profile Switcher

echo ======================================================================
echo  Wi-Fi ネットワーク設定変更 (パブリック -^> プライベート)
echo ======================================================================
echo.
echo 他端末(スマホ・タブレット・他PC)から接続できるようにするため、
echo Wi-Fiネットワークの種類を「プライベート(信頼済み)」に変更します。
echo.

powershell -Command "Set-NetConnectionProfile -InterfaceAlias 'Wi-Fi' -NetworkCategory Private"

if %errorLevel% equ 0 (
    echo.
    echo [成功] Wi-Fiの設定を「プライベート」に変更しました！
    echo これで他端末(スマホ・他PC)から接続可能になります。
) else (
    echo.
    echo ※変更には管理者権限が必要です。
    echo このファイルを右クリックして「管理者として実行」を押してください。
)

echo.
pause
