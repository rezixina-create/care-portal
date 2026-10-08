# Care Portal Server Script (Windows Standard PowerShell + .NET)
param(
    [switch]$NoBrowser,
    [switch]$NoTunnel
)
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
    // [Claude修正] サーバー側でデータ (JSON) を読み書きするための最小限の解析器。
    // Windows 標準の PowerShell 5.1 でもそのまま動くよう、外部ライブラリと新しい C# 構文は使わない。
    public class JNum
    {
        public string Raw;
        public JNum(string raw) { Raw = raw; }
    }

    public class JObj
    {
        public List<string> Keys = new List<string>();
        public Dictionary<string, object> Map = new Dictionary<string, object>();

        public object Get(string key)
        {
            object v;
            if (Map.TryGetValue(key, out v)) return v;
            return null;
        }

        public string GetStr(string key)
        {
            object v = Get(key);
            if (v == null) return null;
            if (v is string) return (string)v;
            if (v is JNum) return ((JNum)v).Raw;
            if (v is bool) return ((bool)v) ? "true" : "false";
            return null;
        }

        public void Set(string key, object value)
        {
            if (!Map.ContainsKey(key)) Keys.Add(key);
            Map[key] = value;
        }
    }

    public static class MiniJson
    {
        public static object Parse(string s)
        {
            int i = 0;
            object v = ParseValue(s, ref i);
            SkipWs(s, ref i);
            return v;
        }

        private static void SkipWs(string s, ref int i)
        {
            while (i < s.Length)
            {
                char c = s[i];
                if (c == ' ' || c == '\t' || c == '\r' || c == '\n' || c == '﻿') i++;
                else break;
            }
        }

        private static object ParseValue(string s, ref int i)
        {
            SkipWs(s, ref i);
            if (i >= s.Length) throw new Exception("JSON: unexpected end");
            char c = s[i];
            if (c == '{') return ParseObject(s, ref i);
            if (c == '[') return ParseArray(s, ref i);
            if (c == '"') return ParseString(s, ref i);
            if (string.CompareOrdinal(s, i, "true", 0, 4) == 0) { i += 4; return true; }
            if (string.CompareOrdinal(s, i, "false", 0, 5) == 0) { i += 5; return false; }
            if (string.CompareOrdinal(s, i, "null", 0, 4) == 0) { i += 4; return null; }
            int start = i;
            while (i < s.Length && "+-0123456789.eE".IndexOf(s[i]) >= 0) i++;
            if (i == start) throw new Exception("JSON: unexpected character at " + i);
            return new JNum(s.Substring(start, i - start));
        }

        private static JObj ParseObject(string s, ref int i)
        {
            JObj obj = new JObj();
            i++;
            SkipWs(s, ref i);
            if (i < s.Length && s[i] == '}') { i++; return obj; }
            while (true)
            {
                SkipWs(s, ref i);
                string key = ParseString(s, ref i);
                SkipWs(s, ref i);
                if (i >= s.Length || s[i] != ':') throw new Exception("JSON: ':' expected at " + i);
                i++;
                object val = ParseValue(s, ref i);
                obj.Set(key, val);
                SkipWs(s, ref i);
                if (i < s.Length && s[i] == ',') { i++; continue; }
                if (i < s.Length && s[i] == '}') { i++; break; }
                throw new Exception("JSON: ',' or '}' expected at " + i);
            }
            return obj;
        }

        private static List<object> ParseArray(string s, ref int i)
        {
            List<object> list = new List<object>();
            i++;
            SkipWs(s, ref i);
            if (i < s.Length && s[i] == ']') { i++; return list; }
            while (true)
            {
                list.Add(ParseValue(s, ref i));
                SkipWs(s, ref i);
                if (i < s.Length && s[i] == ',') { i++; continue; }
                if (i < s.Length && s[i] == ']') { i++; break; }
                throw new Exception("JSON: ',' or ']' expected at " + i);
            }
            return list;
        }

        private static string ParseString(string s, ref int i)
        {
            if (i >= s.Length || s[i] != '"') throw new Exception("JSON: string expected at " + i);
            i++;
            StringBuilder sb = new StringBuilder();
            while (i < s.Length)
            {
                char c = s[i];
                if (c == '"') { i++; return sb.ToString(); }
                if (c == '\\')
                {
                    i++;
                    if (i >= s.Length) break;
                    char e = s[i];
                    switch (e)
                    {
                        case '"': sb.Append('"'); break;
                        case '\\': sb.Append('\\'); break;
                        case '/': sb.Append('/'); break;
                        case 'b': sb.Append('\b'); break;
                        case 'f': sb.Append('\f'); break;
                        case 'n': sb.Append('\n'); break;
                        case 'r': sb.Append('\r'); break;
                        case 't': sb.Append('\t'); break;
                        case 'u':
                            sb.Append((char)Convert.ToInt32(s.Substring(i + 1, 4), 16));
                            i += 4;
                            break;
                        default: sb.Append(e); break;
                    }
                    i++;
                    continue;
                }
                sb.Append(c);
                i++;
            }
            throw new Exception("JSON: unterminated string");
        }

        public static string Serialize(object v)
        {
            StringBuilder sb = new StringBuilder();
            Write(sb, v);
            return sb.ToString();
        }

        public static string Quote(string s)
        {
            StringBuilder sb = new StringBuilder();
            WriteString(sb, s);
            return sb.ToString();
        }

        private static void Write(StringBuilder sb, object v)
        {
            if (v == null) { sb.Append("null"); return; }
            if (v is string) { WriteString(sb, (string)v); return; }
            if (v is bool) { sb.Append(((bool)v) ? "true" : "false"); return; }
            if (v is JNum) { sb.Append(((JNum)v).Raw); return; }
            if (v is int || v is long) { sb.Append(Convert.ToString(v, System.Globalization.CultureInfo.InvariantCulture)); return; }
            if (v is JObj)
            {
                JObj o = (JObj)v;
                sb.Append('{');
                bool first = true;
                foreach (string k in o.Keys)
                {
                    if (!first) sb.Append(',');
                    first = false;
                    WriteString(sb, k);
                    sb.Append(':');
                    Write(sb, o.Map[k]);
                }
                sb.Append('}');
                return;
            }
            if (v is List<object>)
            {
                List<object> list = (List<object>)v;
                sb.Append('[');
                for (int i = 0; i < list.Count; i++)
                {
                    if (i > 0) sb.Append(',');
                    Write(sb, list[i]);
                }
                sb.Append(']');
                return;
            }
            WriteString(sb, v.ToString());
        }

        private static void WriteString(StringBuilder sb, string s)
        {
            sb.Append('"');
            foreach (char c in s)
            {
                switch (c)
                {
                    case '"': sb.Append("\\\""); break;
                    case '\\': sb.Append("\\\\"); break;
                    case '\n': sb.Append("\\n"); break;
                    case '\r': sb.Append("\\r"); break;
                    case '\t': sb.Append("\\t"); break;
                    case '\b': sb.Append("\\b"); break;
                    case '\f': sb.Append("\\f"); break;
                    default:
                        if (c < 0x20) sb.Append("\\u" + ((int)c).ToString("x4"));
                        else sb.Append(c);
                        break;
                }
            }
            sb.Append('"');
        }
    }

    public class SimpleServer
    {
        private int _port;
        private string _baseDir;
        private string _dataDir;
        private string _dbFile;
        private string _backupDir;
        private TcpListener _listener;
        private readonly object _fileLock = new object();

        // [Claude修正] ログインの照合とセッション管理 (サーバー側)。
        // 旧実装はログイン画面を画面側で表示するだけで、サーバーは誰にでもデータを渡していた。
        private class SessionInfo
        {
            public string Staff;
            public DateTime LastSeen;
        }
        private readonly Dictionary<string, SessionInfo> _sessions = new Dictionary<string, SessionInfo>();
        private readonly Dictionary<string, int> _failCount = new Dictionary<string, int>();
        private readonly Dictionary<string, DateTime> _lockUntil = new Dictionary<string, DateTime>();
        private readonly object _authLock = new object();
        private static readonly TimeSpan SessionIdle = TimeSpan.FromMinutes(60);
        private const int MaxFails = 5;
        private const int LockMinutes = 5;

        private static string GetHeader(string[] lines, string name)
        {
            for (int i = 1; i < lines.Length; i++)
            {
                string l = lines[i];
                if (l.Length == 0) break;
                int c = l.IndexOf(':');
                if (c > 0 && string.Equals(l.Substring(0, c).Trim(), name, StringComparison.OrdinalIgnoreCase))
                {
                    return l.Substring(c + 1).Trim();
                }
            }
            return "";
        }

        private static string GetRequestToken(string[] lines)
        {
            string t = GetHeader(lines, "X-Session-Token");
            if (!string.IsNullOrEmpty(t)) return t;
            string cookie = GetHeader(lines, "Cookie");
            foreach (string part in cookie.Split(';'))
            {
                string p = part.Trim();
                if (p.StartsWith("cp_session=")) return p.Substring("cp_session=".Length);
            }
            return "";
        }

        private static string NewToken()
        {
            byte[] b = new byte[32];
            using (System.Security.Cryptography.RandomNumberGenerator rng = System.Security.Cryptography.RandomNumberGenerator.Create())
            {
                rng.GetBytes(b);
            }
            return BitConverter.ToString(b).Replace("-", "").ToLowerInvariant();
        }

        private string CheckSession(string[] lines)
        {
            string t = GetRequestToken(lines);
            if (string.IsNullOrEmpty(t)) return null;
            lock (_authLock)
            {
                SessionInfo si;
                if (!_sessions.TryGetValue(t, out si)) return null;
                if (DateTime.Now - si.LastSeen > SessionIdle)
                {
                    _sessions.Remove(t);
                    return null;
                }
                si.LastSeen = DateTime.Now;
                return si.Staff;
            }
        }

        private JObj LoadDb()
        {
            string txt = null;
            lock (_fileLock)
            {
                if (File.Exists(_dbFile)) txt = File.ReadAllText(_dbFile, Encoding.UTF8);
            }
            if (string.IsNullOrEmpty(txt)) return null;
            return MiniJson.Parse(txt) as JObj;
        }

        private static List<object> GetList(JObj o, string key)
        {
            if (o == null) return new List<object>();
            List<object> l = o.Get(key) as List<object>;
            return l ?? new List<object>();
        }

        private static JObj FindByField(List<object> list, string field, string value)
        {
            if (list == null) return null;
            foreach (object x in list)
            {
                JObj j = x as JObj;
                if (j != null && j.GetStr(field) == value) return j;
            }
            return null;
        }

        private static string StaffName(object x)
        {
            JObj j = x as JObj;
            if (j != null) return j.GetStr("name");
            return x as string;
        }

        private static JObj FindStamp(List<object> stamps, string name)
        {
            foreach (object st in stamps)
            {
                if (StaffName(st) == name) return st as JObj;
            }
            return null;
        }

        private static bool IsTrue(object v)
        {
            return (v is bool) && (bool)v;
        }

        // [0]=ID, [1]=パスワード, [2]=個別設定済み。職員マスタに居ない (退職等) 職員は null
        private static string[] GetCredentials(JObj db, string name)
        {
            if (string.IsNullOrEmpty(name)) return null;
            if (db == null) return new string[] { "aaaa", "0000", "false" };
            bool inStamps = false;
            foreach (object st in GetList(db, "stamps"))
            {
                if (StaffName(st) == name) { inStamps = true; break; }
            }
            if (!inStamps) return null;
            JObj acc = FindByField(GetList(db, "staff_accounts"), "staff_name", name);
            if (acc == null) return new string[] { "aaaa", "0000", "false" };
            return new string[] { acc.GetStr("staff_id") ?? "aaaa", acc.GetStr("password") ?? "0000", IsTrue(acc.Get("is_custom")) ? "true" : "false" };
        }

        private int LockRemaining(string key)
        {
            lock (_authLock)
            {
                DateTime until;
                if (_lockUntil.TryGetValue(key, out until))
                {
                    double s = (until - DateTime.Now).TotalSeconds;
                    if (s > 0) return (int)Math.Ceiling(s);
                    _lockUntil.Remove(key);
                    _failCount.Remove(key);
                }
                return 0;
            }
        }

        // 失敗を記録し、ロックまでの残り回数を返す (0 = ロックした)
        private int RegisterFail(string key)
        {
            lock (_authLock)
            {
                int n;
                _failCount.TryGetValue(key, out n);
                n++;
                if (n >= MaxFails)
                {
                    _lockUntil[key] = DateTime.Now.AddMinutes(LockMinutes);
                    _failCount[key] = 0;
                    return 0;
                }
                _failCount[key] = n;
                return MaxFails - n;
            }
        }

        private void ClearFail(string key)
        {
            lock (_authLock)
            {
                _failCount.Remove(key);
                _lockUntil.Remove(key);
            }
        }

        // [Claude修正] アカウントが休止中か。画面のロックボタンは職員マスタ (stamps) に書くため、両方を見る
        private bool IsSuspended(JObj db, string name)
        {
            if (db == null || string.IsNullOrEmpty(name)) return false;
            JObj st = FindStamp(GetList(db, "stamps"), name);
            if (st != null && st.GetStr("status") == "休止中") return true;
            JObj acc = FindByField(GetList(db, "staff_accounts"), "staff_name", name);
            return acc != null && acc.GetStr("status") == "休止中";
        }

        // 保存されたデータで休止中になった職員のログイン中セッションを終了させる
        private void DropSuspendedSessions(string json)
        {
            JObj db = null;
            try { db = MiniJson.Parse(json) as JObj; } catch { db = null; }
            if (db == null) return;
            lock (_authLock)
            {
                List<string> remove = new List<string>();
                foreach (KeyValuePair<string, SessionInfo> kv in _sessions)
                {
                    if (IsSuspended(db, kv.Value.Staff)) remove.Add(kv.Key);
                }
                foreach (string k in remove) _sessions.Remove(k);
            }
        }

        private void HandleLoginInfo(NetworkStream stream)
        {
            JObj db = null;
            try { db = LoadDb(); } catch { db = null; }
            StringBuilder sb = new StringBuilder();
            string fac = db != null ? db.GetStr("facility_name") : null;
            sb.Append("{\"has_data\":" + (db != null ? "true" : "false") + ",\"facility_name\":" + MiniJson.Quote(fac ?? "") + ",\"staff\":[");
            List<object> accs = GetList(db, "staff_accounts");
            List<string> seen = new List<string>();
            bool first = true;
            foreach (object st in GetList(db, "stamps"))
            {
                string nm = StaffName(st);
                if (string.IsNullOrEmpty(nm) || seen.Contains(nm)) continue;
                seen.Add(nm);
                JObj sj = st as JObj;
                string role = sj != null ? (sj.GetStr("role") ?? "") : "";
                JObj acc = FindByField(accs, "staff_name", nm);
                string status = IsSuspended(db, nm) ? "休止中" : "正常";
                if (status == "休止中") continue;
                bool custom = acc != null && IsTrue(acc.Get("is_custom"));
                if (!first) sb.Append(',');
                first = false;
                sb.Append("{\"name\":" + MiniJson.Quote(nm) + ",\"role\":" + MiniJson.Quote(role) + ",\"status\":" + MiniJson.Quote(status) + ",\"is_custom\":" + (custom ? "true" : "false") + "}");
            }
            sb.Append("]}");
            SendJsonResponse(stream, 200, sb.ToString());
        }

        private void HandleLogin(NetworkStream stream, string body)
        {
            JObj req = null;
            try { req = MiniJson.Parse(body) as JObj; } catch { req = null; }
            if (req == null) { SendJsonResponse(stream, 400, "{\"error\":\"bad_request\"}"); return; }
            string name = req.GetStr("staff_name") ?? "";
            string sid = req.GetStr("staff_id") ?? "";
            string pw = req.GetStr("password") ?? "";

            int remain = LockRemaining(name);
            if (remain > 0)
            {
                SendJsonResponse(stream, 423, "{\"error\":\"locked\",\"retry_after\":" + remain + "}");
                return;
            }

            JObj db = null;
            try { db = LoadDb(); } catch { db = null; }
            if (IsSuspended(db, name))
            {
                SendJsonResponse(stream, 403, "{\"error\":\"suspended\"}");
                return;
            }
            string[] cred = GetCredentials(db, name);
            if (cred == null || cred[0] != sid || cred[1] != pw)
            {
                int left = RegisterFail(name);
                SendJsonResponse(stream, 401, "{\"error\":\"invalid\",\"remaining\":" + left + "}");
                return;
            }
            ClearFail(name);

            string token = NewToken();
            lock (_authLock)
            {
                SessionInfo si = new SessionInfo();
                si.Staff = name;
                si.LastSeen = DateTime.Now;
                _sessions[token] = si;
            }
            string json = "{\"token\":\"" + token + "\",\"staff_name\":" + MiniJson.Quote(name) + ",\"is_custom\":" + cred[2] + "}";
            SendJsonResponse(stream, 200, json, "cp_session=" + token + "; Path=/; HttpOnly; SameSite=Strict");
        }

        private void HandleLogout(NetworkStream stream, string[] lines)
        {
            string t = GetRequestToken(lines);
            lock (_authLock)
            {
                if (!string.IsNullOrEmpty(t)) _sessions.Remove(t);
            }
            SendJsonResponse(stream, 200, "{\"success\":true}", "cp_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0");
        }

        // ID・パスワードの初期化 (管理者と事務員の2名承認)。ログイン前の画面から使うため、ここで承認者の暗証番号を照合する
        private void HandleAccountReset(NetworkStream stream, string body)
        {
            JObj req = null;
            try { req = MiniJson.Parse(body) as JObj; } catch { req = null; }
            if (req == null) { SendJsonResponse(stream, 400, "{\"error\":\"bad_request\"}"); return; }
            string target = req.GetStr("target") ?? "";
            string admin = req.GetStr("admin") ?? "";
            string adminPin = req.GetStr("admin_pin") ?? "";
            string office = req.GetStr("office") ?? "";
            string officePin = req.GetStr("office_pin") ?? "";

            string lockKey = "reset:" + admin + "/" + office;
            int remain = LockRemaining(lockKey);
            if (remain > 0)
            {
                SendJsonResponse(stream, 423, "{\"error\":\"locked\",\"retry_after\":" + remain + "}");
                return;
            }
            if (string.IsNullOrEmpty(target) || admin == office)
            {
                SendJsonResponse(stream, 400, "{\"error\":\"bad_request\"}");
                return;
            }

            bool approved = false;
            lock (_fileLock)
            {
                string txt = File.Exists(_dbFile) ? File.ReadAllText(_dbFile, Encoding.UTF8) : null;
                JObj db = null;
                try { db = string.IsNullOrEmpty(txt) ? null : MiniJson.Parse(txt) as JObj; } catch { db = null; }
                if (db != null)
                {
                    List<object> stamps = GetList(db, "stamps");
                    JObj a = FindStamp(stamps, admin);
                    JObj o = FindStamp(stamps, office);
                    bool targetOk = false;
                    foreach (object st in stamps) { if (StaffName(st) == target) { targetOk = true; break; } }
                    string aRole = a != null ? (a.GetStr("role") ?? "") : "";
                    string oRole = o != null ? (o.GetStr("role") ?? "") : "";
                    approved = a != null && o != null && targetOk
                        && (aRole.Contains("管理者") || aRole.Contains("施設長"))
                        && oRole.Contains("事務")
                        && (a.GetStr("pin") ?? "0000") == adminPin
                        && (o.GetStr("pin") ?? "0000") == officePin;
                    if (approved)
                    {
                        List<object> accs = db.Get("staff_accounts") as List<object>;
                        if (accs == null)
                        {
                            accs = new List<object>();
                            db.Set("staff_accounts", accs);
                        }
                        JObj acc = FindByField(accs, "staff_name", target);
                        if (acc == null)
                        {
                            acc = new JObj();
                            acc.Set("id", target);
                            acc.Set("staff_name", target);
                            accs.Add(acc);
                        }
                        acc.Set("staff_id", "aaaa");
                        acc.Set("password", "0000");
                        acc.Set("is_custom", false);
                        acc.Set("updated_at", DateTime.Now.ToString("yyyy-MM-dd HH:mm", System.Globalization.CultureInfo.InvariantCulture));
                        long rev = 0;
                        JNum rn = db.Get("_rev") as JNum;
                        if (rn != null) long.TryParse(rn.Raw, out rev);
                        db.Set("_rev", new JNum((rev + 1).ToString(System.Globalization.CultureInfo.InvariantCulture)));
                        string outTxt = MiniJson.Serialize(db);
                        File.WriteAllText(_dbFile, outTxt, Encoding.UTF8);
                        try
                        {
                            string ts = DateTime.Now.ToString("yyyyMMdd_HHmm");
                            File.WriteAllText(Path.Combine(_backupDir, "backup_" + ts + ".json"), outTxt, Encoding.UTF8);
                            File.WriteAllText(Path.Combine(_backupDir, "backup_latest.json"), outTxt, Encoding.UTF8);
                        }
                        catch { }
                    }
                }
            }

            if (!approved)
            {
                RegisterFail(lockKey);
                SendJsonResponse(stream, 403, "{\"error\":\"approval_failed\"}");
                return;
            }
            ClearFail(lockKey);
            ClearFail(target);
            lock (_authLock)
            {
                List<string> remove = new List<string>();
                foreach (KeyValuePair<string, SessionInfo> kv in _sessions)
                {
                    if (kv.Value.Staff == target) remove.Add(kv.Key);
                }
                foreach (string k in remove) _sessions.Remove(k);
            }
            SendJsonResponse(stream, 200, "{\"success\":true}");
        }

        // [Claude修正] 暗証番号 (職員マスタ stamps の pin) はサーバーの中だけで管理する。
        // 端末には伏せ字で渡し、照合・変更・初期化はここで行う。施設名の変更 (2名承認) も同様。
        private delegate bool DbMutator(JObj db);

        // データを読み込み、変更を加えて版番号を進めて保存する。mutate が false を返した場合は保存しない
        private bool UpdateDb(DbMutator mutate)
        {
            lock (_fileLock)
            {
                if (!File.Exists(_dbFile)) return false;
                string txt = File.ReadAllText(_dbFile, Encoding.UTF8);
                JObj db = null;
                try { db = MiniJson.Parse(txt) as JObj; } catch { db = null; }
                if (db == null) return false;
                if (!mutate(db)) return false;
                long rev = 0;
                JNum rn = db.Get("_rev") as JNum;
                if (rn != null) long.TryParse(rn.Raw, out rev);
                db.Set("_rev", new JNum((rev + 1).ToString(System.Globalization.CultureInfo.InvariantCulture)));
                string outTxt = MiniJson.Serialize(db);
                File.WriteAllText(_dbFile, outTxt, Encoding.UTF8);
                try
                {
                    string ts = DateTime.Now.ToString("yyyyMMdd_HHmm");
                    File.WriteAllText(Path.Combine(_backupDir, "backup_" + ts + ".json"), outTxt, Encoding.UTF8);
                    File.WriteAllText(Path.Combine(_backupDir, "backup_latest.json"), outTxt, Encoding.UTF8);
                }
                catch { }
                return true;
            }
        }

        private static string PinOf(JObj stamp)
        {
            if (stamp == null) return "0000";
            string p = stamp.GetStr("pin");
            return string.IsNullOrEmpty(p) ? "0000" : p;
        }

        private static bool IsAdminRole(JObj stamp)
        {
            string r = stamp != null ? (stamp.GetStr("role") ?? "") : "";
            return r.Contains("管理者") || r.Contains("施設長");
        }

        private static bool IsClerkRole(JObj stamp)
        {
            string r = stamp != null ? (stamp.GetStr("role") ?? "") : "";
            return r.Contains("事務");
        }

        // 暗証番号の照合 (連続失敗でロック)。true = 一致
        private bool CheckPinWithLock(JObj db, string name, string pin, out bool locked)
        {
            locked = false;
            string key = "pin:" + name;
            if (LockRemaining(key) > 0) { locked = true; return false; }
            JObj st = FindStamp(GetList(db, "stamps"), name);
            if (st == null || PinOf(st) != pin)
            {
                RegisterFail(key);
                return false;
            }
            ClearFail(key);
            return true;
        }

        private void SendPinResult(NetworkStream stream, bool ok, bool locked, string okJson)
        {
            if (locked) { SendJsonResponse(stream, 423, "{\"error\":\"locked\"}"); return; }
            if (!ok) { SendJsonResponse(stream, 403, "{\"error\":\"pin_mismatch\"}"); return; }
            SendJsonResponse(stream, 200, okJson);
        }

        private JObj ParseBody(string body)
        {
            try { return MiniJson.Parse(body) as JObj; } catch { return null; }
        }

        // 職員本人の暗証番号の照合 (職員切り替えなど)
        private void HandleVerifyPin(NetworkStream stream, string body)
        {
            JObj req = ParseBody(body);
            JObj db = null;
            try { db = LoadDb(); } catch { db = null; }
            if (req == null || db == null) { SendJsonResponse(stream, 400, "{\"error\":\"bad_request\"}"); return; }
            if (IsSuspended(db, req.GetStr("name") ?? "")) { SendJsonResponse(stream, 403, "{\"error\":\"suspended\"}"); return; }
            bool locked;
            bool ok = CheckPinWithLock(db, req.GetStr("name") ?? "", req.GetStr("pin") ?? "", out locked);
            SendPinResult(stream, ok, locked, "{\"success\":true}");
        }

        // 暗証番号の変更 (現在の暗証番号の一致で本人確認。連続失敗はロック)
        private void HandlePinChange(NetworkStream stream, string body, string sessionStaff)
        {
            JObj req = ParseBody(body);
            if (req == null) { SendJsonResponse(stream, 400, "{\"error\":\"bad_request\"}"); return; }
            string name = req.GetStr("name") ?? "";
            string cur = req.GetStr("current") ?? "";
            string nw = req.GetStr("new_pin") ?? "";
            if (string.IsNullOrEmpty(sessionStaff) || string.IsNullOrEmpty(name)) { SendJsonResponse(stream, 400, "{\"error\":\"bad_request\"}"); return; }
            if (!System.Text.RegularExpressions.Regex.IsMatch(nw, "^[0-9]{4}$")) { SendJsonResponse(stream, 400, "{\"error\":\"bad_pin\"}"); return; }
            JObj db = null;
            try { db = LoadDb(); } catch { db = null; }
            if (db == null) { SendJsonResponse(stream, 500, "{\"error\":\"no_data\"}"); return; }
            bool locked;
            bool ok = CheckPinWithLock(db, name, cur, out locked);
            if (!ok) { SendPinResult(stream, false, locked, ""); return; }
            bool saved = UpdateDb(delegate(JObj d)
            {
                JObj st = FindStamp(GetList(d, "stamps"), name);
                if (st == null) return false;
                st.Set("pin", nw);
                st.Set("is_initial_pin", false);
                return true;
            });
            SendJsonResponse(stream, saved ? 200 : 500, saved ? "{\"success\":true}" : "{\"error\":\"save_failed\"}");
        }

        // 2名承認 (管理者・事務員) による暗証番号の初期化。2名とも暗証番号で本人確認
        private void HandlePinReset(NetworkStream stream, string body, string sessionStaff)
        {
            JObj req = ParseBody(body);
            if (req == null) { SendJsonResponse(stream, 400, "{\"error\":\"bad_request\"}"); return; }
            string target = req.GetStr("target") ?? "";
            string a1 = req.GetStr("approver1") ?? "";
            string a1pin = req.GetStr("approver1_pin") ?? "";
            string a2 = req.GetStr("approver2") ?? "";
            string a2pin = req.GetStr("approver2_pin") ?? "";
            if (string.IsNullOrEmpty(sessionStaff) || string.IsNullOrEmpty(a1) || a1 == a2 || string.IsNullOrEmpty(target)) { SendJsonResponse(stream, 400, "{\"error\":\"bad_request\"}"); return; }
            JObj db = null;
            try { db = LoadDb(); } catch { db = null; }
            if (db == null) { SendJsonResponse(stream, 500, "{\"error\":\"no_data\"}"); return; }
            List<object> stamps = GetList(db, "stamps");
            JObj s1 = FindStamp(stamps, a1);
            JObj s2 = FindStamp(stamps, a2);
            if (!(IsAdminRole(s1) || IsClerkRole(s1)) || !(IsAdminRole(s2) || IsClerkRole(s2)) || FindStamp(stamps, target) == null)
            {
                SendJsonResponse(stream, 403, "{\"error\":\"role\"}");
                return;
            }
            bool locked1, locked2;
            bool ok1 = CheckPinWithLock(db, a1, a1pin, out locked1);
            bool ok2 = ok1 && CheckPinWithLock(db, a2, a2pin, out locked2);
            if (!ok1) { SendPinResult(stream, false, locked1, ""); return; }
            if (!ok2) { SendJsonResponse(stream, 403, "{\"error\":\"pin_mismatch_2\"}"); return; }
            bool saved = UpdateDb(delegate(JObj d)
            {
                JObj st = FindStamp(GetList(d, "stamps"), target);
                if (st == null) return false;
                st.Set("pin", "0000");
                st.Set("is_initial_pin", true);
                return true;
            });
            ClearFail("pin:" + target);
            SendJsonResponse(stream, saved ? 200 : 500, saved ? "{\"success\":true}" : "{\"error\":\"save_failed\"}");
        }

        // 施設名の変更 (管理者・事務員の2名承認)
        private void HandleFacilityName(NetworkStream stream, string body)
        {
            JObj req = ParseBody(body);
            if (req == null) { SendJsonResponse(stream, 400, "{\"error\":\"bad_request\"}"); return; }
            string newName = (req.GetStr("name") ?? "").Trim();
            string admin = req.GetStr("admin") ?? "";
            string adminPin = req.GetStr("admin_pin") ?? "";
            string office = req.GetStr("office") ?? "";
            string officePin = req.GetStr("office_pin") ?? "";
            if (newName.Length == 0 || newName.Length > 100 || admin == office) { SendJsonResponse(stream, 400, "{\"error\":\"bad_request\"}"); return; }
            JObj db = null;
            try { db = LoadDb(); } catch { db = null; }
            if (db == null) { SendJsonResponse(stream, 500, "{\"error\":\"no_data\"}"); return; }
            List<object> stamps = GetList(db, "stamps");
            if (!IsAdminRole(FindStamp(stamps, admin)) || !IsClerkRole(FindStamp(stamps, office)))
            {
                SendJsonResponse(stream, 403, "{\"error\":\"role\"}");
                return;
            }
            bool l1, l2;
            bool ok1 = CheckPinWithLock(db, admin, adminPin, out l1);
            bool ok2 = ok1 && CheckPinWithLock(db, office, officePin, out l2);
            if (!ok1 || !ok2) { SendPinResult(stream, false, l1, ""); return; }
            bool saved = UpdateDb(delegate(JObj d)
            {
                d.Set("facility_name", newName);
                return true;
            });
            SendJsonResponse(stream, saved ? 200 : 500, saved ? "{\"success\":true}" : "{\"error\":\"save_failed\"}");
        }

        // 端末から届いたデータの暗証番号・施設名は使わず、サーバーの値を保つ (新しく追加された職員は初期値)
        private static void MergeServerOwnedFields(JObj posted, JObj cur)
        {
            List<object> pSt = posted.Get("stamps") as List<object>;
            List<object> cSt = cur != null ? (cur.Get("stamps") as List<object>) : null;
            if (pSt != null)
            {
                foreach (object x in pSt)
                {
                    JObj ps = x as JObj;
                    if (ps == null) continue;
                    JObj cs = cSt != null ? FindStamp(cSt, ps.GetStr("name")) : null;
                    if (cs != null)
                    {
                        ps.Set("pin", PinOf(cs));
                        object ini = cs.Get("is_initial_pin");
                        ps.Set("is_initial_pin", ini is bool ? ini : (object)(PinOf(cs) == "0000"));
                    }
                    else
                    {
                        ps.Set("pin", "0000");
                        ps.Set("is_initial_pin", true);
                    }
                }
            }
            if (cur != null && cur.Get("facility_name") is string)
            {
                posted.Set("facility_name", cur.Get("facility_name"));
            }
        }

        // 端末から届いたデータでは、パスワードは伏せ字 (空) になっている。
        // サーバーのファイルにある本物のID・パスワードを保ち、本人が変更した (更新日時が新しい) 場合だけ受け入れる。
        private static string MergeAccountSecrets(string postData, string currentJson)
        {
            JObj posted = MiniJson.Parse(postData) as JObj;
            if (posted == null) return postData;
            List<object> pAcc = posted.Get("staff_accounts") as List<object>;
            JObj cur = null;
            if (!string.IsNullOrEmpty(currentJson))
            {
                try { cur = MiniJson.Parse(currentJson) as JObj; } catch { cur = null; }
            }
            List<object> cAcc = cur != null ? (cur.Get("staff_accounts") as List<object>) : null;
            MergeServerOwnedFields(posted, cur);
            if (pAcc == null)
            {
                if (cAcc == null) return MiniJson.Serialize(posted);
                pAcc = new List<object>();
                posted.Set("staff_accounts", pAcc);
            }
            foreach (object x in pAcc)
            {
                JObj pa = x as JObj;
                if (pa == null) continue;
                string nm = pa.GetStr("staff_name");
                JObj ca = cAcc != null ? FindByField(cAcc, "staff_name", nm) : null;
                string pPw = pa.GetStr("password") ?? "";
                if (ca == null)
                {
                    if (pPw == "") pa.Set("password", "0000");
                    continue;
                }
                string pUpd = pa.GetStr("updated_at") ?? "";
                string cUpd = ca.GetStr("updated_at") ?? "";
                bool acceptPosted = pPw != "" && string.CompareOrdinal(pUpd, cUpd) > 0;
                if (!acceptPosted)
                {
                    pa.Set("staff_id", ca.Get("staff_id"));
                    pa.Set("password", ca.Get("password"));
                    pa.Set("is_custom", ca.Get("is_custom"));
                    pa.Set("updated_at", ca.Get("updated_at"));
                }
            }
            if (cAcc != null)
            {
                foreach (object x in cAcc)
                {
                    JObj ca = x as JObj;
                    if (ca == null) continue;
                    if (FindByField(pAcc, "staff_name", ca.GetStr("staff_name")) == null) pAcc.Add(ca);
                }
            }
            return MiniJson.Serialize(posted);
        }

        private static string MaskPasswords(string json)
        {
            string masked = System.Text.RegularExpressions.Regex.Replace(json, "\"password\":\"(?:[^\"\\\\]|\\\\.)*\"", "\"password\":\"\"");
            // [Claude修正] 職員マスタの暗証番号も端末に渡さない
            return System.Text.RegularExpressions.Regex.Replace(masked, "\"pin\":\"(?:[^\"\\\\]|\\\\.)*\"", "\"pin\":\"\"");
        }


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

                    // [Claude修正] ログイン関連 (ログイン前でも使える入口)
                    if (urlPath == "/api/login-info")
                    {
                        HandleLoginInfo(stream);
                        return;
                    }
                    if (urlPath == "/api/login" && method == "POST")
                    {
                        HandleLogin(stream, Encoding.UTF8.GetString(bodyBytes));
                        return;
                    }
                    if (urlPath == "/api/logout" && method == "POST")
                    {
                        HandleLogout(stream, lines);
                        return;
                    }
                    if (urlPath == "/api/account-reset" && method == "POST")
                    {
                        HandleAccountReset(stream, Encoding.UTF8.GetString(bodyBytes));
                        return;
                    }

                    // [Claude修正] これより下の API と写真は、ログイン済み (有効なセッション) の場合だけ応答する
                    bool needsAuth = urlPath.StartsWith("/api/") || urlPath.StartsWith("/data/photos/");
                    string sessStaff = needsAuth ? CheckSession(lines) : null;
                    if (needsAuth && sessStaff == null)
                    {
                        SendJsonResponse(stream, 401, "{\"error\":\"unauthorized\"}");
                        return;
                    }

                    // [Claude修正] 暗証番号・施設名はサーバーで照合・変更する
                    if (urlPath == "/api/verify-pin" && method == "POST")
                    {
                        HandleVerifyPin(stream, Encoding.UTF8.GetString(bodyBytes));
                        return;
                    }
                    if (urlPath == "/api/pin-change" && method == "POST")
                    {
                        HandlePinChange(stream, Encoding.UTF8.GetString(bodyBytes), sessStaff);
                        return;
                    }
                    if (urlPath == "/api/pin-reset" && method == "POST")
                    {
                        HandlePinReset(stream, Encoding.UTF8.GetString(bodyBytes), sessStaff);
                        return;
                    }
                    if (urlPath == "/api/facility-name" && method == "POST")
                    {
                        HandleFacilityName(stream, Encoding.UTF8.GetString(bodyBytes));
                        return;
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
                        string tPath = Path.Combine(_baseDir, "tunnel_url.txt");
                        if (method == "POST")
                        {
                            string newTUrl = Encoding.UTF8.GetString(bodyBytes).Trim();
                            if (!string.IsNullOrEmpty(newTUrl))
                            {
                                try { File.WriteAllText(tPath, newTUrl, Encoding.UTF8); } catch { }
                            }
                            SendJsonResponse(stream, 200, "{\"success\":true}");
                            return;
                        }

                        List<string> ips = GetIPs();
                        string tUrl = "";
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
                            // [Claude修正] パスワードは端末に渡さない (伏せ字にする)
                            SendJsonResponse(stream, 200, MaskPasswords(dataJson));
                        }
                        return;
                    }

                    if (urlPath == "/api/save" && method == "POST")
                    {
                        string postData = Encoding.UTF8.GetString(bodyBytes);
                        if (!string.IsNullOrEmpty(postData))
                        {
                            bool revConflict = false;
                            lock (_fileLock)
                            {
                                // [Claude修正] 版番号 (_rev) の照合。保存データの _rev は「取得時の版 + 1」でなければならない。
                                // 取得後に他端末が保存して版が進んでいれば 409 を返し、端末側で合流をやり直させる。
                                long currentRev = -1;
                                string currentJson = null;
                                if (File.Exists(_dbFile))
                                {
                                    currentJson = File.ReadAllText(_dbFile, Encoding.UTF8);
                                    var mc = System.Text.RegularExpressions.Regex.Match(currentJson, "\"_rev\":(\\d+)");
                                    if (mc.Success) currentRev = long.Parse(mc.Groups[1].Value);
                                }
                                var mp = System.Text.RegularExpressions.Regex.Match(postData, "\"_rev\":(\\d+)");
                                if (currentRev >= 0 && mp.Success && long.Parse(mp.Groups[1].Value) != currentRev + 1)
                                {
                                    revConflict = true;
                                }
                                if (!revConflict)
                                {
                                // [Claude修正] 伏せ字で届いたパスワードを、サーバー側の本物で補う
                                try { postData = MergeAccountSecrets(postData, currentJson); } catch { }
                                File.WriteAllText(_dbFile, postData, Encoding.UTF8);
                                try { DropSuspendedSessions(postData); } catch { }
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
                            }
                            if (revConflict)
                            {
                                SendJsonResponse(stream, 409, "{\"error\":\"conflict\"}");
                                return;
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

            // [Claude修正] 配信してよいファイルだけを返す。データ・設定・.git・スクリプト等は配信しない。
            // 旧実装はフォルダ内の全ファイル (全利用者のデータを含む) と、「..」でフォルダ外のファイルまで返していた。
            string lowerPath = urlPath.ToLowerInvariant();
            bool allowedPath = lowerPath == "/index.html" || lowerPath == "/app.js" || lowerPath == "/style.css"
                || lowerPath == "/favicon.ico" || lowerPath.StartsWith("/assets/") || lowerPath.StartsWith("/data/photos/");
            if (!allowedPath || urlPath.Contains("..") || urlPath.Contains("\\") || urlPath.Contains(":"))
            {
                byte[] deniedBytes = Encoding.UTF8.GetBytes("404 Not Found");
                SendResponse(stream, 404, "Not Found", "text/plain", deniedBytes);
                return;
            }

            string relativePath = urlPath.TrimStart('/').Replace('/', Path.DirectorySeparatorChar);
            string filePath = Path.GetFullPath(Path.Combine(_baseDir, relativePath));
            string baseFull = Path.GetFullPath(_baseDir).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
            if (!filePath.StartsWith(baseFull, StringComparison.OrdinalIgnoreCase))
            {
                byte[] deniedBytes2 = Encoding.UTF8.GetBytes("404 Not Found");
                SendResponse(stream, 404, "Not Found", "text/plain", deniedBytes2);
                return;
            }

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
            SendJsonResponse(stream, statusCode, json, null);
        }

        private static void SendJsonResponse(NetworkStream stream, int statusCode, string json, string setCookie)
        {
            byte[] bytes = Encoding.UTF8.GetBytes(json);
            string msg = "Bad Request";
            if (statusCode == 200) msg = "OK";
            else if (statusCode == 401) msg = "Unauthorized";
            else if (statusCode == 403) msg = "Forbidden";
            else if (statusCode == 409) msg = "Conflict";
            else if (statusCode == 423) msg = "Locked";
            else if (statusCode == 500) msg = "Internal Server Error";
            SendCorsResponse(stream, statusCode, msg, "application/json; charset=utf-8", bytes, setCookie);
        }

        private static void SendCorsResponse(NetworkStream stream, int statusCode, string statusMsg, string contentType, byte[] body)
        {
            SendCorsResponse(stream, statusCode, statusMsg, contentType, body, null);
        }

        private static void SendCorsResponse(NetworkStream stream, int statusCode, string statusMsg, string contentType, byte[] body, string setCookie)
        {
            string headers = "HTTP/1.1 " + statusCode + " " + statusMsg + "\r\n" +
                             (string.IsNullOrEmpty(setCookie) ? "" : "Set-Cookie: " + setCookie + "\r\n") +
                             "Content-Type: " + contentType + "\r\n" +
                             "Content-Length: " + body.Length + "\r\n" +
                             "Cache-Control: no-cache, no-store, must-revalidate\r\n" +
                             "Pragma: no-cache\r\n" +
                             "Expires: 0\r\n" +
                             "Connection: close\r\n" +
                             "Access-Control-Allow-Origin: *\r\n" +
                             "Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n" +
                             "Access-Control-Allow-Headers: Content-Type, X-Session-Token\r\n\r\n";
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
                             "Cache-Control: no-cache, no-store, must-revalidate\r\n" +
                             "Pragma: no-cache\r\n" +
                             "Expires: 0\r\n" +
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

# 3. 外部接続トンネル (Cloudflare Tunnel) の自動同時起動
$tunnelProc = $null
$cloudflared = Join-Path $ScriptDir "cloudflared.exe"
$tunnelLog = Join-Path $ScriptDir "tunnel.log"
$tunnelUrlFile = Join-Path $ScriptDir "tunnel_url.txt"

if (-not $NoTunnel -and (Test-Path $cloudflared)) {
    # 既存の古いトンネルプロセスを念のため整理
    Get-Process -Name "cloudflared" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    if (Test-Path $tunnelLog) { Remove-Item $tunnelLog -Force -ErrorAction SilentlyContinue }

    try {
        # WindowStyle Hidden で起動（パイプハンドルを継承させず独立プロセスとして起動）
        $tunnelProc = Start-Process -FilePath $cloudflared -ArgumentList "tunnel --url http://localhost:$port" -RedirectStandardError $tunnelLog -PassThru -WindowStyle Hidden
        
        # トンネルURLの自動取得（最大5秒待機）
        for ($i = 0; $i -lt 10; $i++) {
            Start-Sleep -Milliseconds 500
            if (Test-Path $tunnelLog) {
                $content = Get-Content $tunnelLog -Raw -ErrorAction SilentlyContinue
                if ($content -match "https://[a-zA-Z0-9-]+\.trycloudflare\.com") {
                    Set-Content -Path $tunnelUrlFile -Value $matches[0] -Encoding UTF8
                    break
                }
            }
        }
    } catch {
        Write-Host "※トンネルの自動起動に失敗しました（ローカルサーバーとして継続します）" -ForegroundColor Gray
    }
}

# 画面コンソール表示
Clear-Host
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "   Care Portal Server (サーバー ＆ 外部トンネル統合モード)" -ForegroundColor Green
Write-Host "   介護施設 統合業務ポータル [ローカル ＆ 外部接続トンネル同時稼働中]" -ForegroundColor Yellow
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host " [PC (Host)]:" -ForegroundColor White
Write-Host "   http://localhost:$port" -ForegroundColor Cyan
Write-Host ""

$latestTunnelUrl = $null
if (Test-Path $tunnelUrlFile) {
    try { $latestTunnelUrl = (Get-Content $tunnelUrlFile -Raw -ErrorAction SilentlyContinue).Trim() } catch { }
}
if ($latestTunnelUrl) {
    Write-Host " [スマホ・他端末 外部接続用 (統一案内URL)]:" -ForegroundColor Green
    Write-Host "   $latestTunnelUrl" -ForegroundColor Yellow -BackgroundColor Black
    Write-Host "   ※ 自宅Wi-Fi・学校・外出先スマホ(4G/5G)どこからでもこのURLで繋がります。" -ForegroundColor Gray
} else {
    Write-Host " [外部接続トンネル (Cloudflare Tunnel)]:" -ForegroundColor Yellow
    Write-Host "   バックグラウンドで接続準備中... (画面右上の「接続案内」に自動反映されます)" -ForegroundColor Gray
}
Write-Host ""
Write-Host " [Tablet (同一Wi-Fi / LAN直接アクセス用)]:" -ForegroundColor White
foreach ($ip in $ipList) {
    Write-Host "   http://${ip}:${port}" -ForegroundColor Yellow
}
Write-Host ""
Write-Host " * Please keep this window open while using the portal." -ForegroundColor Gray
Write-Host " * この黒い画面を閉じるとサーバーとトンネルが停止します。最小化してお使いください。" -ForegroundColor Magenta
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host ""

# クリーンアップ処理（終了時にトンネルも確実に停止）
$cleanup = {
    if ($tunnelProc -and -not $tunnelProc.HasExited) {
        try { Stop-Process -Id $tunnelProc.Id -Force -ErrorAction SilentlyContinue } catch { }
    }
    Get-Process -Name "cloudflared" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
}

# 4. ブラウザ自動起動
if (-not $NoBrowser -and -not [Environment]::GetEnvironmentVariable("CI")) {
    Write-Host "ブラウザを起動しています (http://localhost:$port)..." -ForegroundColor Green
    try {
        Start-Process "http://localhost:$port"
    } catch {
        cmd.exe /c start "" "http://localhost:$port"
    }
}

# 5. サーバー待機
try {
    $server = New-Object CarePortal.SimpleServer ($ScriptDir, $port)
    $server.Start()
} finally {
    & $cleanup
}