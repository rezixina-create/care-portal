@echo off
chcp 65001 > nul
echo ===================================================
echo   施設ポータル - ファイアウォール設定
echo ===================================================
echo.
echo タブレット・スマホの接続を許可するため、
echo Windowsファイアウォールにポート8888の受信ルールを追加します。
echo.

net session >nul 2>&1
if %errorLevel% neq 0 (
    echo 管理者権限で再起動しています...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

netsh advfirewall firewall delete rule name="CarePortal_Port8888" >nul 2>&1
netsh advfirewall firewall add rule name="CarePortal_Port8888" dir=in action=allow protocol=TCP localport=8888 profile=any

echo.
echo ===================================================
echo [完了] ポート8888の通信が許可されました！
echo.
echo これでタブレット・スマホから以下のURLに接続できます:
echo   http://192.168.11.17:8888
echo ===================================================
echo.
pause
