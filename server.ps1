# Care Portal Server Script (Windows Standard PowerShell + .NET)
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$port = 8888

# 0. タブレット・他端末接続用ファイアウォール自動確認 (初回のみ設定確認)
try {
    $fwRule = Get-NetFirewallRule -DisplayName "CarePortal_Port8888" -ErrorAction SilentlyContinue
    if (-not $fwRule) {
        Write-Host "======================================================================" -ForegroundColor Cyan
        Write-Host "  【初回セットアップ】タブレット・他端末接続の設定" -ForegroundColor Yellow
        Write-Host "======================================================================" -ForegroundColor Cyan
        Write-Host "  タブレットやスマホから接続できるようにするため、" -ForegroundColor White
        Write-Host "  Windowsファイアウォールに通信許可を登録します（初回のみ）。" -ForegroundColor White
        Write-Host "  画面に許可ダイアログが表示されたら「はい」を押してください..." -ForegroundColor Green
        Write-Host ""
        try {
            $p = Start-Process "netsh" -ArgumentList 'advfirewall firewall add rule name="CarePortal_Port8888" dir=in action=allow protocol=TCP localport=8888 profile=any' -Verb RunAs -Wait -PassThru -ErrorAction Stop
        } catch {
            Write-Host "  ※ファイアウォール設定はスキップされました（このPC単体での利用は可能です）。" -ForegroundColor Gray
        }
    }
} catch { }

# 1. すでにポート8888が稼働中か確認 (二重起動の防止)
$isPortInUse = $false
try {
    $tcpConn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if ($tcpConn) { $isPortInUse = $true }
} catch { }

if ($isPortInUse) {
    Write-Host "======================================================================" -ForegroundColor Green
    Write-Host "  Care Portal Server is ALREADY RUNNING!" -ForegroundColor Cyan
    Write-Host "  サーバーはすでに稼働中です。ブラウザを起動します..." -ForegroundColor Yellow
    Write-Host "======================================================================" -ForegroundColor Green
    Start-Process "http://localhost:$port"
    Start-Sleep -Seconds 2
    exit 0
}

# 2. C# サーバーコード定義 (インメモリコンパイル・ディスクexe不使用)
$ServerSource = @'
using System;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using System.Collections.Generic;
using System.Net.NetworkInformation;

namespace CarePortal
{
    public class SimpleServer
    {
        private int _port;
        private string _baseDir;
        private string _dataDir;
        private string _dbFile;
        private string _backupDir;
        private TcpListener _listener;
        private readonly object _fileLock = new object();

        public SimpleServer(string baseDir, int port)
        {
            _baseDir = baseDir;
            _port = port;
            _dataDir = Path.Combine(_baseDir, "data");
            _dbFile = Path.Combine(_dataDir, "portal_database.json");
            _backupDir = Path.Combine(_dataDir, "backup");

            if (!Directory.Exists(_dataDir)) Directory.CreateDirectory(_dataDir);
            if (!Directory.Exists(_backupDir)) Directory.CreateDirectory(_backupDir);
        }

        public void Start()
        {
            _listener = new TcpListener(IPAddress.Any, _port);
            _listener.Start();

            while (true)
            {
                try
                {
                    TcpClient client = _listener.AcceptTcpClient();
                    ThreadPool.QueueUserWorkItem(HandleClient, client);
                }
                catch
                {
                    break;
                }
            }
        }

        private void HandleClient(object obj)
        {
            TcpClient client = (TcpClient)obj;
            client.ReceiveTimeout = 10000;
            client.SendTimeout = 10000;

            try
            {
                using (NetworkStream stream = client.GetStream())
                {
                    byte[] buffer = new byte[16384];
                    int bytesRead = stream.Read(buffer, 0, buffer.Length);
                    if (bytesRead <= 0) return;

                    string reqHeader = Encoding.UTF8.GetString(buffer, 0, bytesRead);
                    string[] lines = reqHeader.Split(new[] { "\r\n" }, StringSplitOptions.None);
                    if (lines.Length == 0) return;

                    string[] requestLineParts = lines[0].Split(' ');
                    if (requestLineParts.Length < 2) return;

                    string method = requestLineParts[0].ToUpper();
                    string rawUrl = requestLineParts[1];
                    string urlPath = rawUrl.Split('?')[0];
                    try { urlPath = Uri.UnescapeDataString(urlPath); } catch { }

                    if (method == "OPTIONS")
                    {
                        SendCorsResponse(stream, 204, "No Content", "text/plain", new byte[0]);
                        return;
                    }

                    int contentLength = 0;
                    foreach (string line in lines)
                    {
                        if (line.StartsWith("Content-Length:", StringComparison.OrdinalIgnoreCase))
                        {
                            int.TryParse(line.Substring(15).Trim(), out contentLength);
                            break;
                        }
                    }

                    byte[] bodyBytes = new byte[contentLength];
                    int headerEndIndex = reqHeader.IndexOf("\r\n\r\n");
                    int initialBodyBytesCount = 0;

                    if (headerEndIndex >= 0)
                    {
                        int headerByteLength = Encoding.UTF8.GetByteCount(reqHeader.Substring(0, headerEndIndex + 4));
                        initialBodyBytesCount = bytesRead - headerByteLength;
                        if (initialBodyBytesCount > 0)
                        {
                            Array.Copy(buffer, headerByteLength, bodyBytes, 0, Math.Min(initialBodyBytesCount, contentLength));
                        }
                    }

                    int totalBodyRead = Math.Min(initialBodyBytesCount, contentLength);
                    while (totalBodyRead < contentLength)
                    {
                        int read = stream.Read(bodyBytes, totalBodyRead, contentLength - totalBodyRead);
                        if (read <= 0) break;
                        totalBodyRead += read;
                    }

                    if (urlPath == "/api/open-folder")
                    {
                        string fType = "documents";
                        if (rawUrl.Contains("type=personal")) fType = "personal";
                        string folder = Path.Combine(_dataDir, "photos", fType);
                        if (!Directory.Exists(folder)) Directory.CreateDirectory(folder);
                        try
                        {
                            System.Diagnostics.Process.Start("explorer.exe", folder);
                            SendJsonResponse(stream, 200, "{\"success\":true}");
                        }
                        catch
                        {
                            SendJsonResponse(stream, 500, "{\"error\":\"Failed to open folder\"}");
                        }
                        return;
                    }

                    if (urlPath == "/api/ip")
                    {
                        List<string> ips = GetIPs();
                        string tUrl = "";
                        string tPath = Path.Combine(_baseDir, "tunnel_url.txt");
                        if (File.Exists(tPath))
                        {
                            try { tUrl = File.ReadAllText(tPath).Trim(); } catch { }
                        }
                        string json = "{\"ips\":[\"" + string.Join("\",\"", ips.ToArray()) + "\"],\"port\":" + _port + ",\"tunnel_url\":\"" + tUrl + "\"}";
                        SendJsonResponse(stream, 200, json);
                        return;
                    }

                    if (urlPath == "/api/data")
                    {
                        string dataJson = "";
                        lock (_fileLock)
                        {
                            if (File.Exists(_dbFile))
                            {
                                dataJson = File.ReadAllText(_dbFile, Encoding.UTF8);
                            }
                        }
                        if (string.IsNullOrEmpty(dataJson))
                        {
                            SendJsonResponse(stream, 200, "{}");
                        }
                        else
                        {
                            SendJsonResponse(stream, 200, dataJson);
                        }
                        return;
                    }

                    if (urlPath == "/api/save" && method == "POST")
                    {
                        string postData = Encoding.UTF8.GetString(bodyBytes);
                        if (!string.IsNullOrEmpty(postData))
                        {
                            lock (_fileLock)
                            {
                                File.WriteAllText(_dbFile, postData, Encoding.UTF8);
                                try
                                {
                                    string ts = DateTime.Now.ToString("yyyyMMdd_HHmm");
                                    string backupPath = Path.Combine(_backupDir, "backup_" + ts + ".json");
                                    File.WriteAllText(backupPath, postData, Encoding.UTF8);
                                    string latestPath = Path.Combine(_backupDir, "backup_latest.json");
                                    File.WriteAllText(latestPath, postData, Encoding.UTF8);
                                }
                                catch { }
                            }
                            string nowTime = DateTime.Now.ToString("HH:mm");
                            SendJsonResponse(stream, 200, "{\"success\":true,\"saved_at\":\"" + nowTime + "\"}");
                        }
                        else
                        {
                            SendJsonResponse(stream, 400, "{\"error\":\"Empty payload\"}");
                        }
                        return;
                    }

                    ServeStaticFile(stream, urlPath);
                }
            }
            catch { }
            finally
            {
                try { client.Close(); } catch { }
            }
        }

        private void ServeStaticFile(NetworkStream stream, string urlPath)
        {
            if (urlPath == "/" || string.IsNullOrEmpty(urlPath))
            {
                urlPath = "/index.html";
            }

            string relativePath = urlPath.TrimStart('/').Replace('/', Path.DirectorySeparatorChar);
            string filePath = Path.Combine(_baseDir, relativePath);

            if (!File.Exists(filePath))
            {
                byte[] notFoundBytes = Encoding.UTF8.GetBytes("404 Not Found");
                SendResponse(stream, 404, "Not Found", "text/plain", notFoundBytes);
                return;
            }

            string ext = Path.GetExtension(filePath).ToLower();
            string contentType = "application/octet-stream";
            switch (ext)
            {
                case ".html": contentType = "text/html; charset=utf-8"; break;
                case ".css": contentType = "text/css; charset=utf-8"; break;
                case ".js": contentType = "application/javascript; charset=utf-8"; break;
                case ".json": contentType = "application/json; charset=utf-8"; break;
                case ".png": contentType = "image/png"; break;
                case ".jpg": case ".jpeg": contentType = "image/jpeg"; break;
                case ".svg": contentType = "image/svg+xml"; break;
                case ".ico": contentType = "image/x-icon"; break;
            }

            byte[] fileBytes = File.ReadAllBytes(filePath);
            SendResponse(stream, 200, "OK", contentType, fileBytes);
        }

        private static void SendJsonResponse(NetworkStream stream, int statusCode, string json)
        {
            byte[] bytes = Encoding.UTF8.GetBytes(json);
            SendCorsResponse(stream, statusCode, statusCode == 200 ? "OK" : "Bad Request", "application/json; charset=utf-8", bytes);
        }

        private static void SendCorsResponse(NetworkStream stream, int statusCode, string statusMsg, string contentType, byte[] body)
        {
            string headers = "HTTP/1.1 " + statusCode + " " + statusMsg + "\r\n" +
                             "Content-Type: " + contentType + "\r\n" +
                             "Content-Length: " + body.Length + "\r\n" +
                             "Connection: close\r\n" +
                             "Access-Control-Allow-Origin: *\r\n" +
                             "Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n" +
                             "Access-Control-Allow-Headers: Content-Type\r\n\r\n";
            byte[] headerBytes = Encoding.UTF8.GetBytes(headers);
            stream.Write(headerBytes, 0, headerBytes.Length);
            if (body.Length > 0)
            {
                stream.Write(body, 0, body.Length);
            }
            stream.Flush();
        }

        private static void SendResponse(NetworkStream stream, int statusCode, string statusMsg, string contentType, byte[] body)
        {
            string headers = "HTTP/1.1 " + statusCode + " " + statusMsg + "\r\n" +
                             "Content-Type: " + contentType + "\r\n" +
                             "Content-Length: " + body.Length + "\r\n" +
                             "Connection: close\r\n\r\n";
            byte[] headerBytes = Encoding.UTF8.GetBytes(headers);
            stream.Write(headerBytes, 0, headerBytes.Length);
            if (body.Length > 0)
            {
                stream.Write(body, 0, body.Length);
            }
            stream.Flush();
        }

        public static List<string> GetIPs()
        {
            List<string> list = new List<string>();
            try
            {
                foreach (NetworkInterface ni in NetworkInterface.GetAllNetworkInterfaces())
                {
                    if (ni.OperationalStatus != OperationalStatus.Up) continue;
                    if (ni.NetworkInterfaceType == NetworkInterfaceType.Loopback) continue;

                    IPInterfaceProperties props = ni.GetIPProperties();
                    foreach (UnicastIPAddressInformation uni in props.UnicastAddresses)
                    {
                        if (uni.Address.AddressFamily == AddressFamily.InterNetwork)
                        {
                            string ip = uni.Address.ToString();
                            if (!ip.StartsWith("169.254.") && !ip.StartsWith("127."))
                            {
                                list.Add(ip);
                            }
                        }
                    }
                }
            }
            catch { }
            if (list.Count == 0) list.Add("127.0.0.1");
            return list;
        }
    }
}
'@

# コンパイル
Add-Type -TypeDefinition $ServerSource

# IPアドレス取得
$ipList = [CarePortal.SimpleServer]::GetIPs()

# 画面コンソール表示
Clear-Host
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "   Care Portal Server (Local Wi-Fi Shared Mode)" -ForegroundColor Green
Write-Host "   介護施設 統合業務ポータル [施設内Wi-Fi共有サーバー稼働中]" -ForegroundColor Yellow
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host " [PC (Host)]:" -ForegroundColor White
Write-Host "   http://localhost:$port" -ForegroundColor Cyan
Write-Host ""
Write-Host " [Cloudflare Tunnel (学校Wi-Fi・スマホ・他PC用)]:" -ForegroundColor Green
Write-Host "   https://percentage-freelance-unwrap-spatial.trycloudflare.com" -ForegroundColor Cyan
Write-Host ""
Write-Host " [Tablet (Local Wi-Fi / LAN直接用)]:" -ForegroundColor White
foreach ($ip in $ipList) {
    Write-Host "   http://${ip}:${port}" -ForegroundColor Yellow
}
Write-Host ""
Write-Host " * Please keep this window open while using the portal." -ForegroundColor Gray
Write-Host " * この黒い画面を閉じるとサーバーが停止します。最小化してお使いください。" -ForegroundColor Magenta
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host ""

# 3. ブラウザ自動起動（メインスレッドから直接立ち上げ）
Write-Host "ブラウザを起動しています (http://localhost:$port)..." -ForegroundColor Green
try {
    Start-Process "http://localhost:$port"
} catch {
    cmd.exe /c start "" "http://localhost:$port"
}

# 4. サーバー待機
$server = New-Object CarePortal.SimpleServer ($ScriptDir, $port)
$server.Start()
