@echo off
chcp 65001 > nul
echo ===================================================
echo   介護施設ポータル - ファイアウォール許可設定
echo ===================================================
echo.
echo タブレット・スマホからの接続を許可するため、
echo Windowsファイアウォールにポート8000の受信ルールを追加します。
echo.

net session >nul 2>&1
if %errorLevel% neq 0 (
    echo 管理者権限で再起動しています...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

netsh advfirewall firewall delete rule name="CarePortal_Port8000" >nul 2>&1
netsh advfirewall firewall add rule name="CarePortal_Port8000" dir=in action=allow protocol=TCP localport=8000 profile=any

echo.
echo ===================================================
echo [完了] ポート8000の通信が許可されました！
echo.
echo これでタブレットやスマホから以下のURLに接続できます:
echo   http://192.168.11.17:8000
echo ===================================================
echo.
pause
