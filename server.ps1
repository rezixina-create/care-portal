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
using System.Runtime.InteropServices;

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

    // ======================================================================
    // [Claude追加 2026-10-17] データベース（SQLite）
    // - SQLite はインストールのいらないデータベース。Windows 10/11 に最初から入っている winsqlite3.dll を使う。
    //   ない場合は、SQLite 公式の sqlite3.dll をポータルのフォルダに置けば使える。どちらもなければ今までどおり JSON ファイルで動く。
    // - 保存先は data/portal.db。記録（id のある一覧の1件ずつ）を1行ずつ持ち、保存のときは変わった行だけを書き換える。
    //   書き込みは「全部書けたか、何も書かないか」のどちらか（途中で電源が落ちても、書きかけが残らない）。
    // - data/portal_database.json は、データベースの中身の書き出し（GitHub での受け渡し・見本データ・バックアップ用）。
    //   外から書き換えられたとき（git で取り込んだ・控えから戻した）は、データベースに取り込む。
    // - 値は必ず命令と分けて渡す（入力された文字が命令として動かないように）。
    // ======================================================================
    public abstract class SqApi
    {
        public const int SQ_OK = 0, SQ_ROW = 100, SQ_DONE = 101;
        public string Name;
        public abstract string LibVersion();
        public abstract int Open(string path, out IntPtr db);
        public abstract int Close(IntPtr db);
        public abstract int Prepare(IntPtr db, string sql, out IntPtr stmt);
        public abstract int BindText(IntPtr stmt, int idx, string val);
        public abstract int BindInt64(IntPtr stmt, int idx, long val);
        public abstract int Step(IntPtr stmt);
        public abstract string ColumnText(IntPtr stmt, int col);
        public abstract long ColumnInt64(IntPtr stmt, int col);
        public abstract int Reset(IntPtr stmt);
        public abstract int FinalizeStmt(IntPtr stmt);
        public abstract string ErrMsg(IntPtr db);

        protected static byte[] Utf8z(string s)
        {
            byte[] b = Encoding.UTF8.GetBytes(s ?? "");
            byte[] z = new byte[b.Length + 1];
            Buffer.BlockCopy(b, 0, z, 0, b.Length);
            return z;
        }
        protected static string FromUtf8(IntPtr p, int len)
        {
            if (p == IntPtr.Zero) return null;
            if (len <= 0) return "";
            byte[] b = new byte[len];
            Marshal.Copy(p, b, 0, len);
            return Encoding.UTF8.GetString(b);
        }
        protected static string FromUtf8z(IntPtr p)
        {
            if (p == IntPtr.Zero) return null;
            int n = 0;
            while (Marshal.ReadByte(p, n) != 0) n++;
            return FromUtf8(p, n);
        }
    }

    // Windows 10/11 に最初から入っている SQLite（winsqlite3.dll）。インストール不要
    public class SqWin : SqApi
    {
        private const string L = "winsqlite3.dll";
        [DllImport(L, CallingConvention = CallingConvention.StdCall)] private static extern IntPtr sqlite3_libversion();
        [DllImport(L, CallingConvention = CallingConvention.StdCall)] private static extern int sqlite3_open_v2(byte[] filename, out IntPtr db, int flags, IntPtr vfs);
        [DllImport(L, CallingConvention = CallingConvention.StdCall)] private static extern int sqlite3_close(IntPtr db);
        [DllImport(L, CallingConvention = CallingConvention.StdCall)] private static extern int sqlite3_prepare_v2(IntPtr db, byte[] sql, int nByte, out IntPtr stmt, IntPtr tail);
        [DllImport(L, CallingConvention = CallingConvention.StdCall)] private static extern int sqlite3_bind_text(IntPtr stmt, int idx, byte[] val, int n, IntPtr destructor);
        [DllImport(L, CallingConvention = CallingConvention.StdCall)] private static extern int sqlite3_bind_int64(IntPtr stmt, int idx, long val);
        [DllImport(L, CallingConvention = CallingConvention.StdCall)] private static extern int sqlite3_step(IntPtr stmt);
        [DllImport(L, CallingConvention = CallingConvention.StdCall)] private static extern IntPtr sqlite3_column_text(IntPtr stmt, int col);
        [DllImport(L, CallingConvention = CallingConvention.StdCall)] private static extern int sqlite3_column_bytes(IntPtr stmt, int col);
        [DllImport(L, CallingConvention = CallingConvention.StdCall)] private static extern long sqlite3_column_int64(IntPtr stmt, int col);
        [DllImport(L, CallingConvention = CallingConvention.StdCall)] private static extern int sqlite3_reset(IntPtr stmt);
        [DllImport(L, CallingConvention = CallingConvention.StdCall)] private static extern int sqlite3_finalize(IntPtr stmt);
        [DllImport(L, CallingConvention = CallingConvention.StdCall)] private static extern IntPtr sqlite3_errmsg(IntPtr db);
        public SqWin() { Name = "winsqlite3.dll"; }
        public override string LibVersion() { return FromUtf8z(sqlite3_libversion()); }
        public override int Open(string path, out IntPtr db) { return sqlite3_open_v2(Utf8z(path), out db, 0x02 | 0x04 | 0x10000, IntPtr.Zero); }
        public override int Close(IntPtr db) { return sqlite3_close(db); }
        public override int Prepare(IntPtr db, string sql, out IntPtr stmt) { return sqlite3_prepare_v2(db, Utf8z(sql), -1, out stmt, IntPtr.Zero); }
        public override int BindText(IntPtr stmt, int idx, string val) { byte[] b = Encoding.UTF8.GetBytes(val ?? ""); return sqlite3_bind_text(stmt, idx, b, b.Length, new IntPtr(-1)); }
        public override int BindInt64(IntPtr stmt, int idx, long val) { return sqlite3_bind_int64(stmt, idx, val); }
        public override int Step(IntPtr stmt) { return sqlite3_step(stmt); }
        public override string ColumnText(IntPtr stmt, int col) { IntPtr p = sqlite3_column_text(stmt, col); return p == IntPtr.Zero ? null : FromUtf8(p, sqlite3_column_bytes(stmt, col)); }
        public override long ColumnInt64(IntPtr stmt, int col) { return sqlite3_column_int64(stmt, col); }
        public override int Reset(IntPtr stmt) { return sqlite3_reset(stmt); }
        public override int FinalizeStmt(IntPtr stmt) { return sqlite3_finalize(stmt); }
        public override string ErrMsg(IntPtr db) { return FromUtf8z(sqlite3_errmsg(db)); }
    }

    // SQLite 公式の部品（sqlite3.dll をポータルのフォルダに置いたとき。Linux の検証環境では libsqlite3）
    public class SqStd : SqApi
    {
        private const string L = "sqlite3";
        [DllImport(L, CallingConvention = CallingConvention.Cdecl)] private static extern IntPtr sqlite3_libversion();
        [DllImport(L, CallingConvention = CallingConvention.Cdecl)] private static extern int sqlite3_open_v2(byte[] filename, out IntPtr db, int flags, IntPtr vfs);
        [DllImport(L, CallingConvention = CallingConvention.Cdecl)] private static extern int sqlite3_close(IntPtr db);
        [DllImport(L, CallingConvention = CallingConvention.Cdecl)] private static extern int sqlite3_prepare_v2(IntPtr db, byte[] sql, int nByte, out IntPtr stmt, IntPtr tail);
        [DllImport(L, CallingConvention = CallingConvention.Cdecl)] private static extern int sqlite3_bind_text(IntPtr stmt, int idx, byte[] val, int n, IntPtr destructor);
        [DllImport(L, CallingConvention = CallingConvention.Cdecl)] private static extern int sqlite3_bind_int64(IntPtr stmt, int idx, long val);
        [DllImport(L, CallingConvention = CallingConvention.Cdecl)] private static extern int sqlite3_step(IntPtr stmt);
        [DllImport(L, CallingConvention = CallingConvention.Cdecl)] private static extern IntPtr sqlite3_column_text(IntPtr stmt, int col);
        [DllImport(L, CallingConvention = CallingConvention.Cdecl)] private static extern int sqlite3_column_bytes(IntPtr stmt, int col);
        [DllImport(L, CallingConvention = CallingConvention.Cdecl)] private static extern long sqlite3_column_int64(IntPtr stmt, int col);
        [DllImport(L, CallingConvention = CallingConvention.Cdecl)] private static extern int sqlite3_reset(IntPtr stmt);
        [DllImport(L, CallingConvention = CallingConvention.Cdecl)] private static extern int sqlite3_finalize(IntPtr stmt);
        [DllImport(L, CallingConvention = CallingConvention.Cdecl)] private static extern IntPtr sqlite3_errmsg(IntPtr db);
        public SqStd() { Name = "sqlite3"; }
        public override string LibVersion() { return FromUtf8z(sqlite3_libversion()); }
        public override int Open(string path, out IntPtr db) { return sqlite3_open_v2(Utf8z(path), out db, 0x02 | 0x04 | 0x10000, IntPtr.Zero); }
        public override int Close(IntPtr db) { return sqlite3_close(db); }
        public override int Prepare(IntPtr db, string sql, out IntPtr stmt) { return sqlite3_prepare_v2(db, Utf8z(sql), -1, out stmt, IntPtr.Zero); }
        public override int BindText(IntPtr stmt, int idx, string val) { byte[] b = Encoding.UTF8.GetBytes(val ?? ""); return sqlite3_bind_text(stmt, idx, b, b.Length, new IntPtr(-1)); }
        public override int BindInt64(IntPtr stmt, int idx, long val) { return sqlite3_bind_int64(stmt, idx, val); }
        public override int Step(IntPtr stmt) { return sqlite3_step(stmt); }
        public override string ColumnText(IntPtr stmt, int col) { IntPtr p = sqlite3_column_text(stmt, col); return p == IntPtr.Zero ? null : FromUtf8(p, sqlite3_column_bytes(stmt, col)); }
        public override long ColumnInt64(IntPtr stmt, int col) { return sqlite3_column_int64(stmt, col); }
        public override int Reset(IntPtr stmt) { return sqlite3_reset(stmt); }
        public override int FinalizeStmt(IntPtr stmt) { return sqlite3_finalize(stmt); }
        public override string ErrMsg(IntPtr db) { return FromUtf8z(sqlite3_errmsg(db)); }
    }

    public class PortalStore
    {
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern IntPtr LoadLibraryW(string path);

        private SqApi _api;
        private IntPtr _db = IntPtr.Zero;
        private readonly object _lock = new object();
        // データベースの中身を、そのまま手元にも持つ（読み出しを速くし、変わった行だけを見つけるため）
        private List<string> _keys = new List<string>();                                   // 上から順の項目名
        private Dictionary<string, string> _whole = new Dictionary<string, string>();       // 丸ごと1行で持つ項目
        private Dictionary<string, List<string>> _order = new Dictionary<string, List<string>>(); // 記録ごとに持つ項目の並び
        private Dictionary<string, Dictionary<string, string>> _recs = new Dictionary<string, Dictionary<string, string>>();
        private string _text;
        private long _stamp = 1;
        public string Path;

        public string Info { get { return _api.Name + "（SQLite " + _api.LibVersion() + "）"; } }
        public long Stamp { get { lock (_lock) { return _stamp; } } }
        public bool IsEmpty { get { lock (_lock) { return _keys.Count == 0; } } }

        // 使える SQLite を探して開く。開けなければ null（理由は why）
        public static PortalStore TryOpen(string dbPath, string baseDir, out string why)
        {
            why = null;
            bool isWin = Environment.OSVersion.Platform == PlatformID.Win32NT;
            if (isWin)
            {
                // フォルダに置いた sqlite3.dll を先に読み込んでおく（置いていれば、そちらを使えるように）
                try { string own = System.IO.Path.Combine(baseDir, "sqlite3.dll"); if (File.Exists(own)) LoadLibraryW(own); } catch { }
            }
            SqApi[] apis = isWin ? new SqApi[] { new SqWin(), new SqStd() } : new SqApi[] { new SqStd() };
            List<string> reasons = new List<string>();
            foreach (SqApi api in apis)
            {
                try { api.LibVersion(); }
                catch (DllNotFoundException) { reasons.Add(api.Name + " なし"); continue; }
                catch (EntryPointNotFoundException) { reasons.Add(api.Name + " が使えない"); continue; }
                catch (BadImageFormatException) { reasons.Add(api.Name + " の種類が合わない"); continue; }
                PortalStore st = new PortalStore();
                st._api = api;
                st.Path = dbPath;
                try
                {
                    st.OpenAndLoad();
                    return st;
                }
                catch (Exception ex)
                {
                    try { st.Close(); } catch { }
                    why = "データベースを開けませんでした: " + ex.Message;
                    return null;
                }
            }
            why = "SQLite が見つかりません（" + string.Join("・", reasons.ToArray()) + "）";
            return null;
        }

        private void Check(int rc, string what)
        {
            if (rc != SqApi.SQ_OK && rc != SqApi.SQ_ROW && rc != SqApi.SQ_DONE)
                throw new Exception(what + ": " + _api.ErrMsg(_db) + " (" + rc + ")");
        }

        private void Exec(string sql)
        {
            IntPtr st;
            Check(_api.Prepare(_db, sql, out st), "命令の準備");
            try
            {
                int rc;
                while ((rc = _api.Step(st)) == SqApi.SQ_ROW) { }
                Check(rc, sql);
            }
            finally { _api.FinalizeStmt(st); }
        }

        private void OpenAndLoad()
        {
            Check(_api.Open(Path, out _db), "開く");
            Exec("PRAGMA journal_mode=WAL");
            Exec("PRAGMA synchronous=FULL");
            Exec("PRAGMA busy_timeout=5000");
            Exec("CREATE TABLE IF NOT EXISTS items(key TEXT PRIMARY KEY, pos INTEGER NOT NULL, kind INTEGER NOT NULL, json TEXT NOT NULL)");
            Exec("CREATE TABLE IF NOT EXISTS records(coll TEXT NOT NULL, id TEXT NOT NULL, json TEXT NOT NULL, PRIMARY KEY(coll, id))");
            Exec("CREATE TABLE IF NOT EXISTS sysinfo(key TEXT PRIMARY KEY, value TEXT)");
            // [第3段階] 差分保存の変更の記録（端末への差分の受け渡しを、サーバーの再起動をまたいでも続けるため）
            Exec("CREATE TABLE IF NOT EXISTS changes(rev INTEGER PRIMARY KEY, prev INTEGER NOT NULL, ops TEXT NOT NULL)");
            // 読み込み
            List<string> keys = new List<string>();
            Dictionary<string, string> whole = new Dictionary<string, string>();
            Dictionary<string, List<string>> order = new Dictionary<string, List<string>>();
            Dictionary<string, Dictionary<string, string>> recs = new Dictionary<string, Dictionary<string, string>>();
            IntPtr st;
            Check(_api.Prepare(_db, "SELECT key, kind, json FROM items ORDER BY pos", out st), "読み込み");
            try
            {
                int rc;
                while ((rc = _api.Step(st)) == SqApi.SQ_ROW)
                {
                    string key = _api.ColumnText(st, 0);
                    long kind = _api.ColumnInt64(st, 1);
                    string json = _api.ColumnText(st, 2);
                    keys.Add(key);
                    if (kind == 1)
                    {
                        List<object> ids = MiniJson.Parse(json) as List<object>;
                        if (ids == null) throw new Exception("並びが読めません: " + key);
                        List<string> idl = new List<string>();
                        foreach (object o in ids) idl.Add((string)o);
                        order[key] = idl;
                        recs[key] = new Dictionary<string, string>();
                    }
                    else whole[key] = json;
                }
                Check(rc, "読み込み");
            }
            finally { _api.FinalizeStmt(st); }
            Check(_api.Prepare(_db, "SELECT coll, id, json FROM records", out st), "記録の読み込み");
            try
            {
                int rc;
                while ((rc = _api.Step(st)) == SqApi.SQ_ROW)
                {
                    string coll = _api.ColumnText(st, 0);
                    Dictionary<string, string> m;
                    if (!recs.TryGetValue(coll, out m)) continue; // 並びにない記録は使わない
                    m[_api.ColumnText(st, 1)] = _api.ColumnText(st, 2);
                }
                Check(rc, "記録の読み込み");
            }
            finally { _api.FinalizeStmt(st); }
            foreach (KeyValuePair<string, List<string>> kv in order)
            {
                foreach (string id in kv.Value)
                {
                    if (!recs[kv.Key].ContainsKey(id)) throw new Exception("データベースの中身が合いません（" + kv.Key + " の記録が足りない）");
                }
            }
            _keys = keys; _whole = whole; _order = order; _recs = recs; _text = null;
        }

        public void Close()
        {
            lock (_lock)
            {
                if (_db != IntPtr.Zero) { try { _api.Close(_db); } catch { } _db = IntPtr.Zero; }
            }
        }

        // 記録ごとに持てる一覧か（全部が id のある項目で、id が重ならない）。持てるなら id の並びを返す
        private static List<string> RecordIds(object v)
        {
            List<object> list = v as List<object>;
            if (list == null) return null;
            List<string> ids = new List<string>(list.Count);
            Dictionary<string, bool> seen = new Dictionary<string, bool>();
            foreach (object o in list)
            {
                JObj j = o as JObj;
                if (j == null) return null;
                object idv = j.Get("id");
                string id = null;
                if (idv is string) id = "s:" + (string)idv;           // 文字の id と数字の id を区別する
                else if (idv is JNum) id = "n:" + ((JNum)idv).Raw;
                if (id == null || seen.ContainsKey(id)) return null;
                seen[id] = true;
                ids.Add(id);
            }
            return ids;
        }

        private static string OrderJson(List<string> ids)
        {
            StringBuilder sb = new StringBuilder("[");
            for (int i = 0; i < ids.Count; i++) { if (i > 0) sb.Append(','); sb.Append(MiniJson.Quote(ids[i])); }
            sb.Append(']');
            return sb.ToString();
        }

        public string Read()
        {
            lock (_lock)
            {
                if (_text != null) return _text;
                StringBuilder sb = new StringBuilder("{");
                for (int i = 0; i < _keys.Count; i++)
                {
                    string k = _keys[i];
                    if (i > 0) sb.Append(',');
                    sb.Append(MiniJson.Quote(k)).Append(':');
                    string w;
                    if (_whole.TryGetValue(k, out w)) { sb.Append(w); continue; }
                    List<string> ids = _order[k];
                    Dictionary<string, string> m = _recs[k];
                    sb.Append('[');
                    for (int j = 0; j < ids.Count; j++) { if (j > 0) sb.Append(','); sb.Append(m[ids[j]]); }
                    sb.Append(']');
                }
                sb.Append('}');
                _text = sb.ToString();
                return _text;
            }
        }

        private void Run(IntPtr st)
        {
            int rc = _api.Step(st);
            _api.Reset(st);
            Check(rc, "書き込み");
        }

        // 全体の JSON を受け取り、前と変わった行だけをデータベースに書く。全部書けたときだけ反映する
        public void Write(string json)
        {
            JObj root = MiniJson.Parse(json) as JObj;
            if (root == null) throw new Exception("保存する内容が読めません");
            lock (_lock) { Apply(root, null, null, null); }
        }

        // [第2段階] 差分保存のときの書き込み: 変わった記録（ops に出てくる記録）と版番号の行だけを書く。
        // 全体を組み立て直したり、ほかの記録を見比べたりしない。うまく当てはまらないときは全体の書き込みに切り替える
        // [第3段階] change を渡すと、同じ書き込みの中で変更の記録も残す（書けたときは両方、だめなときはどちらも残らない）
        public void WriteDelta(JObj root, List<object> ops, long prevRev, long newRev, string change)
        {
            lock (_lock)
            {
                _pendOps = change; _pendPrev = prevRev; _pendRev = newRev;
                try { WriteDeltaCore(root, ops); }
                finally { _pendOps = null; }
            }
        }

        public const int ChangeKeep = 500;
        private string _pendOps;
        private long _pendPrev, _pendRev;

        // 残っている変更の記録を読む。今の版までとぎれずにつながる分だけを返す（つながらなければ空）
        public List<KeyValuePair<long, string>> LoadChanges(out long baseRev)
        {
            lock (_lock)
            {
                baseRev = -1;
                List<KeyValuePair<long, string>> res = new List<KeyValuePair<long, string>>();
                string rv;
                long cur;
                if (!_whole.TryGetValue("_rev", out rv) || !long.TryParse(rv, out cur)) return res;
                List<long> revs = new List<long>(), prevs = new List<long>();
                List<string> opsl = new List<string>();
                IntPtr st;
                Check(_api.Prepare(_db, "SELECT rev, prev, ops FROM changes ORDER BY rev", out st), "変更の記録の読み込み");
                try
                {
                    int rc;
                    while ((rc = _api.Step(st)) == SqApi.SQ_ROW)
                    {
                        revs.Add(_api.ColumnInt64(st, 0));
                        prevs.Add(_api.ColumnInt64(st, 1));
                        opsl.Add(_api.ColumnText(st, 2));
                    }
                    Check(rc, "変更の記録の読み込み");
                }
                finally { _api.FinalizeStmt(st); }
                int n = revs.Count;
                if (n == 0 || revs[n - 1] != cur) return res;
                int from = n - 1;
                while (from > 0 && prevs[from] == revs[from - 1]) from--;
                for (int i = from; i < n; i++) res.Add(new KeyValuePair<long, string>(revs[i], opsl[i]));
                baseRev = prevs[from];
                return res;
            }
        }

        private void WriteDeltaCore(JObj root, List<object> ops)
        {
            {
                bool keysSame = root.Keys.Count == _keys.Count;
                for (int i = 0; keysSame && i < _keys.Count; i++) if (root.Keys[i] != _keys[i]) keysSame = false;
                if (!keysSame) { Apply(root, null, null, null); return; }
                Dictionary<string, bool> onlyKeys = new Dictionary<string, bool>();
                Dictionary<string, Dictionary<string, bool>> upIds = new Dictionary<string, Dictionary<string, bool>>();
                Dictionary<string, Dictionary<string, bool>> rmIds = new Dictionary<string, Dictionary<string, bool>>();
                foreach (object o in ops)
                {
                    JObj op = o as JObj;
                    if (op == null) continue;
                    string k = op.GetStr("k"), t = op.GetStr("t"), id = op.GetStr("id");
                    if (string.IsNullOrEmpty(k)) continue;
                    if ((t == "up" || t == "rm") && id != null && _recs.ContainsKey(k) && root.Get(k) is List<object>)
                    {
                        Dictionary<string, Dictionary<string, bool>> d = t == "up" ? upIds : rmIds;
                        Dictionary<string, bool> m;
                        if (!d.TryGetValue(k, out m)) { m = new Dictionary<string, bool>(); d[k] = m; }
                        m[id] = true;
                    }
                    else onlyKeys[k] = true;
                }
                onlyKeys["_rev"] = true;
                try { Apply(root, onlyKeys, upIds, rmIds); }
                catch (DeltaMismatch) { Apply(root, null, null, null); }
            }
        }

        private class DeltaMismatch : Exception { public DeltaMismatch(string m) : base(m) { } }

        private static string RecKeyOf(JObj rec)
        {
            object idv = rec.Get("id");
            if (idv is string) return "s:" + (string)idv;
            if (idv is JNum) return "n:" + ((JNum)idv).Raw;
            return null;
        }

        // onlyKeys == null なら全部の項目を見比べる。そうでなければ、onlyKeys の項目は丸ごと見比べ、
        // upIds・rmIds の項目は書かれた記録だけを書く・消す。ほかの項目は触らない（_lock の中で呼ぶ）
        private void Apply(JObj root, Dictionary<string, bool> onlyKeys, Dictionary<string, Dictionary<string, bool>> upIds, Dictionary<string, Dictionary<string, bool>> rmIds)
        {
            bool full = onlyKeys == null;
            List<string> newKeys = new List<string>(root.Keys);
            Dictionary<string, string> newWhole = new Dictionary<string, string>(_whole);
            Dictionary<string, List<string>> newOrder = new Dictionary<string, List<string>>(_order);
            Dictionary<string, Dictionary<string, string>> newRecs = new Dictionary<string, Dictionary<string, string>>(_recs);
            Dictionary<string, int> oldPos = new Dictionary<string, int>();
            for (int i = 0; i < _keys.Count; i++) oldPos[_keys[i]] = i;
            if (full) { newWhole.Clear(); newOrder.Clear(); newRecs.Clear(); }

            IntPtr upItem = IntPtr.Zero, delItem = IntPtr.Zero, upRec = IntPtr.Zero, delRec = IntPtr.Zero, delColl = IntPtr.Zero, chIns = IntPtr.Zero, chDel = IntPtr.Zero;
            bool began = false;
            try
            {
                Check(_api.Prepare(_db, "INSERT OR REPLACE INTO items(key, pos, kind, json) VALUES(?, ?, ?, ?)", out upItem), "準備");
                Check(_api.Prepare(_db, "DELETE FROM items WHERE key = ?", out delItem), "準備");
                Check(_api.Prepare(_db, "INSERT OR REPLACE INTO records(coll, id, json) VALUES(?, ?, ?)", out upRec), "準備");
                Check(_api.Prepare(_db, "DELETE FROM records WHERE coll = ? AND id = ?", out delRec), "準備");
                Check(_api.Prepare(_db, "DELETE FROM records WHERE coll = ?", out delColl), "準備");
                Exec("BEGIN IMMEDIATE");
                began = true;

                for (int i = 0; i < newKeys.Count; i++)
                {
                    string k = newKeys[i];
                    object v = root.Map[k];
                    bool inUp = upIds != null && upIds.ContainsKey(k);
                    bool inRm = rmIds != null && rmIds.ContainsKey(k);
                    bool whole = full || onlyKeys.ContainsKey(k);
                    if (!whole && !inUp && !inRm) continue; // 変わっていない項目
                    int op;
                    bool posChanged = !oldPos.TryGetValue(k, out op) || op != i;

                    if (!whole)
                    {
                        // 書かれた記録だけを書く・消す
                        List<object> list = v as List<object>;
                        Dictionary<string, string> m = new Dictionary<string, string>(_recs[k]);
                        bool orderChanged = false;
                        if (inRm)
                        {
                            foreach (string id in rmIds[k].Keys)
                            {
                                bool stillThere = false;
                                foreach (object e in list) { JObj je = e as JObj; if (je != null && je.GetStr("id") == id) { stillThere = true; break; } }
                                if (stillThere) continue; // 同じ保存の中で消して書き直した記録
                                foreach (string pre in new string[] { "s:", "n:" })
                                {
                                    if (m.Remove(pre + id)) { _api.BindText(delRec, 1, k); _api.BindText(delRec, 2, pre + id); Run(delRec); orderChanged = true; }
                                }
                            }
                        }
                        if (inUp)
                        {
                            foreach (string id in upIds[k].Keys)
                            {
                                JObj rec = null;
                                foreach (object e in list) { JObj je = e as JObj; if (je != null && je.GetStr("id") == id) { rec = je; break; } }
                                if (rec == null) continue; // 同じ保存の中で書いてから消した記録
                                string rk = RecKeyOf(rec);
                                if (rk == null) throw new DeltaMismatch("id がない記録");
                                string t = MiniJson.Serialize(rec);
                                string ot;
                                if (!m.TryGetValue(rk, out ot)) orderChanged = true;
                                if (ot != t) { _api.BindText(upRec, 1, k); _api.BindText(upRec, 2, rk); _api.BindText(upRec, 3, t); Run(upRec); }
                                m[rk] = t;
                            }
                        }
                        if (orderChanged || posChanged)
                        {
                            List<string> ids = RecordIds(v);
                            if (ids == null || ids.Count != m.Count) throw new DeltaMismatch("並びが合わない: " + k);
                            foreach (string rid in ids) if (!m.ContainsKey(rid)) throw new DeltaMismatch("並びが合わない: " + k);
                            _api.BindText(upItem, 1, k); _api.BindInt64(upItem, 2, i); _api.BindInt64(upItem, 3, 1); _api.BindText(upItem, 4, OrderJson(ids));
                            Run(upItem);
                            newOrder[k] = ids;
                        }
                        newRecs[k] = m;
                        continue;
                    }

                    // 項目を丸ごと見比べる
                    List<string> allIds = RecordIds(v);
                    if (allIds != null)
                    {
                        List<object> list = (List<object>)v;
                        Dictionary<string, string> oldRecs;
                        bool wasColl = _recs.TryGetValue(k, out oldRecs);
                        if (!wasColl) { oldRecs = new Dictionary<string, string>(); _api.BindText(delColl, 1, k); Run(delColl); }
                        Dictionary<string, string> nr = new Dictionary<string, string>();
                        for (int j = 0; j < list.Count; j++)
                        {
                            string t = MiniJson.Serialize(list[j]);
                            nr[allIds[j]] = t;
                            string ot;
                            if (!oldRecs.TryGetValue(allIds[j], out ot) || ot != t)
                            {
                                _api.BindText(upRec, 1, k); _api.BindText(upRec, 2, allIds[j]); _api.BindText(upRec, 3, t);
                                Run(upRec);
                            }
                        }
                        foreach (string oid in oldRecs.Keys)
                        {
                            if (!nr.ContainsKey(oid)) { _api.BindText(delRec, 1, k); _api.BindText(delRec, 2, oid); Run(delRec); }
                        }
                        string newOrderJson = OrderJson(allIds);
                        List<string> oldIds;
                        bool orderSame = wasColl && _order.TryGetValue(k, out oldIds) && OrderJson(oldIds) == newOrderJson;
                        if (!orderSame || posChanged)
                        {
                            _api.BindText(upItem, 1, k); _api.BindInt64(upItem, 2, i); _api.BindInt64(upItem, 3, 1); _api.BindText(upItem, 4, newOrderJson);
                            Run(upItem);
                        }
                        newWhole.Remove(k);
                        newOrder[k] = allIds;
                        newRecs[k] = nr;
                    }
                    else
                    {
                        string t = MiniJson.Serialize(v);
                        if (_recs.ContainsKey(k)) { _api.BindText(delColl, 1, k); Run(delColl); }
                        string ow;
                        if (!_whole.TryGetValue(k, out ow) || ow != t || posChanged)
                        {
                            _api.BindText(upItem, 1, k); _api.BindInt64(upItem, 2, i); _api.BindInt64(upItem, 3, 0); _api.BindText(upItem, 4, t);
                            Run(upItem);
                        }
                        newOrder.Remove(k); newRecs.Remove(k);
                        newWhole[k] = t;
                    }
                }
                if (full)
                {
                    // なくなった項目を消す
                    Dictionary<string, bool> keep = new Dictionary<string, bool>();
                    foreach (string k in newKeys) keep[k] = true;
                    foreach (string k in _keys)
                    {
                        if (keep.ContainsKey(k)) continue;
                        _api.BindText(delItem, 1, k); Run(delItem);
                        if (_recs.ContainsKey(k)) { _api.BindText(delColl, 1, k); Run(delColl); }
                    }
                }
                // [第3段階] 変更の記録: 差分保存なら1行足して古い分を消す。全体の書き込み（取り込み・パスワードの変更など）では
                // どの記録が変わったか言えないので、全部消す（端末は次に全体を取りに来る）
                if (_pendOps != null)
                {
                    Check(_api.Prepare(_db, "INSERT OR REPLACE INTO changes(rev, prev, ops) VALUES(?, ?, ?)", out chIns), "準備");
                    _api.BindInt64(chIns, 1, _pendRev); _api.BindInt64(chIns, 2, _pendPrev); _api.BindText(chIns, 3, _pendOps);
                    Run(chIns);
                    Check(_api.Prepare(_db, "DELETE FROM changes WHERE rev <= ? OR rev > ?", out chDel), "準備");
                    _api.BindInt64(chDel, 1, _pendRev - ChangeKeep); _api.BindInt64(chDel, 2, _pendRev);
                    Run(chDel);
                }
                else Exec("DELETE FROM changes");
                Exec("COMMIT");
                began = false;
                _keys = newKeys; _whole = newWhole; _order = newOrder; _recs = newRecs;
                _text = null;
                _stamp++;
            }
            catch
            {
                if (began) { try { Exec("ROLLBACK"); } catch { } }
                throw;
            }
            finally
            {
                foreach (IntPtr p in new IntPtr[] { upItem, delItem, upRec, delRec, delColl, chIns, chDel }) { if (p != IntPtr.Zero) _api.FinalizeStmt(p); }
            }
        }

        public string GetSys(string key)
        {
            lock (_lock)
            {
                IntPtr st;
                Check(_api.Prepare(_db, "SELECT value FROM sysinfo WHERE key = ?", out st), "準備");
                try
                {
                    _api.BindText(st, 1, key);
                    return _api.Step(st) == SqApi.SQ_ROW ? _api.ColumnText(st, 0) : null;
                }
                finally { _api.FinalizeStmt(st); }
            }
        }

        public void SetSys(string key, string value)
        {
            lock (_lock)
            {
                IntPtr st;
                Check(_api.Prepare(_db, "INSERT OR REPLACE INTO sysinfo(key, value) VALUES(?, ?)", out st), "準備");
                try
                {
                    _api.BindText(st, 1, key);
                    _api.BindText(st, 2, value);
                    Check(_api.Step(st), "書き込み");
                }
                finally { _api.FinalizeStmt(st); }
            }
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
        private readonly object _extBackupLock = new object();

        // [Claude追加 2026-10-17] データの読み書きは、ここを通す（データベースがあればデータベース、なければ今までどおり JSON ファイル）
        private PortalStore _store;
        private string _storeWhy;
        private System.Threading.Timer _jsonSyncTimer;
        private long _exportedStamp = -1;
        private string _exportedHash;
        private bool _warnedBadJson;
        public string StorageInfo
        {
            get
            {
                if (_store != null) return "データベース " + _store.Info + " data\\portal.db";
                return "JSON ファイル data\\portal_database.json（" + (_storeWhy ?? "") + "）";
            }
        }
        // _fileLock の中で呼ぶ
        private bool DbExists() { return _store != null ? !_store.IsEmpty : File.Exists(_dbFile); }
        private string DbReadText()
        {
            if (_store != null) return _store.IsEmpty ? null : _store.Read();
            return File.Exists(_dbFile) ? File.ReadAllText(_dbFile, Encoding.UTF8) : null;
        }
        private void DbWriteText(string json)
        {
            ResetChangeLog();
            if (_store != null) { _store.Write(json); return; }
            File.WriteAllText(_dbFile, json, Encoding.UTF8);
        }
        // 中身が変わったら変わる番号（読み込み済みの内容を使い回してよいかの判定に使う）
        private long DbStamp()
        {
            if (_store != null) return _store.Stamp;
            if (!File.Exists(_dbFile)) return 0;
            FileInfo fi = new FileInfo(_dbFile);
            return unchecked(fi.LastWriteTimeUtc.Ticks * 31 + fi.Length);
        }
        private static string HashBytes(byte[] b)
        {
            using (System.Security.Cryptography.SHA256 h = System.Security.Cryptography.SHA256.Create())
            {
                return BitConverter.ToString(h.ComputeHash(b)).Replace("-", "");
            }
        }
        // _fileLock の中で呼ぶ。portal_database.json が外から書き換えられていれば取り込み（git で取り込んだ・控えから戻した など）、
        // そうでなければデータベースの中身を書き出す（GitHub での受け渡し・バックアップ用）
        private void SyncJsonFile()
        {
            if (_store == null) return;
            byte[] fileBytes = File.Exists(_dbFile) ? File.ReadAllBytes(_dbFile) : null;
            string fileHash = fileBytes != null ? HashBytes(fileBytes) : null;
            if (_exportedHash == null) _exportedHash = _store.GetSys("json_export_hash");
            if (fileHash != null && fileHash != _exportedHash)
            {
                string txt = Encoding.UTF8.GetString(fileBytes);
                if (txt.Length > 0 && txt[0] == '\uFEFF') txt = txt.Substring(1);
                JObj parsed = null;
                try { parsed = MiniJson.Parse(txt) as JObj; } catch { parsed = null; }
                if (parsed == null)
                {
                    // 読めないファイルは取り込まず、上書きもしない（書き換えの途中かもしれないため）
                    if (!_warnedBadJson) Console.WriteLine("[データ] portal_database.json が読めないため、取り込みと書き出しを止めています。");
                    _warnedBadJson = true;
                    return;
                }
                _warnedBadJson = false;
                bool first = _store.IsEmpty;
                if (!first)
                {
                    // 取り込む前の中身を控えに残す（取り込みで消える変更があっても戻せるように）
                    try { File.WriteAllText(Path.Combine(_backupDir, "before_import_" + DateTime.Now.ToString("yyyyMMdd_HHmmss") + ".json"), _store.Read(), Encoding.UTF8); } catch { }
                }
                _store.Write(txt);
                ResetChangeLog();
                _exportedStamp = -1;
                Console.WriteLine(first
                    ? "[データ] portal_database.json をデータベースに取り込みました（初めての起動）"
                    : "[データ] portal_database.json が外から変わったので、データベースに取り込みました（" + DateTime.Now.ToString("HH:mm:ss") + "）。前の中身は data\\backup\\before_import_*.json");
            }
            if (_store.IsEmpty) return;
            long st = _store.Stamp;
            if (st == _exportedStamp && fileHash != null && fileHash == _exportedHash) return;
            string outTxt = _store.Read();
            byte[] pre = Encoding.UTF8.GetPreamble();
            byte[] body = Encoding.UTF8.GetBytes(outTxt);
            byte[] all = new byte[pre.Length + body.Length];
            Buffer.BlockCopy(pre, 0, all, 0, pre.Length);
            Buffer.BlockCopy(body, 0, all, pre.Length, body.Length);
            string h = HashBytes(all);
            if (h != fileHash)
            {
                // 書き出せないとき（ほかのソフトで開いている など）は、データベースはそのまま使い、次の機会にもう一度試す
                try
                {
                    string tmp = _dbFile + ".writing";
                    File.WriteAllBytes(tmp, all);
                    File.Copy(tmp, _dbFile, true);
                    File.Delete(tmp);
                }
                catch (Exception ex)
                {
                    Console.WriteLine("[データ] portal_database.json に書き出せませんでした。30秒後にもう一度試します（" + ex.Message + "）");
                    return;
                }
            }
            _exportedHash = h;
            _store.SetSys("json_export_hash", h);
            _exportedStamp = st;
        }
        private void OnJsonSyncTick(object state)
        {
            try { lock (_fileLock) { SyncJsonFile(); } }
            catch (Exception ex) { Console.WriteLine("[データ] 書き出しに失敗しました: " + ex.Message); }
        }
        private System.Threading.Timer _extBackupTimer;

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
                txt = DbReadText();
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
            // [Claude修正] 空のとき（パスワードを含まないバックアップから戻した場合など）は初期値として扱う
            string sidV = acc.GetStr("staff_id"); if (string.IsNullOrEmpty(sidV)) sidV = "aaaa";
            string pwV = acc.GetStr("password"); if (string.IsNullOrEmpty(pwV)) pwV = "0000";
            return new string[] { sidV, pwV, IsTrue(acc.Get("is_custom")) ? "true" : "false" };
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
                string txt = DbReadText();
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
                        DbWriteText(outTxt);
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
                if (!DbExists()) return false;
                string txt = DbReadText();
                JObj db = null;
                try { db = MiniJson.Parse(txt) as JObj; } catch { db = null; }
                if (db == null) return false;
                if (!mutate(db)) return false;
                long rev = 0;
                JNum rn = db.Get("_rev") as JNum;
                if (rn != null) long.TryParse(rn.Raw, out rev);
                db.Set("_rev", new JNum((rev + 1).ToString(System.Globalization.CultureInfo.InvariantCulture)));
                string outTxt = MiniJson.Serialize(db);
                DbWriteText(outTxt);
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
        // [Claude追加] 処方箋の画像の保存。本文: {"resident_id":1,"date":"2026-10-09","data":"(JPEGのbase64)"}
        // 返り値: {"success":true,"url":"data/photos/prescriptions/r1/2026-10-09_123456_ab12cd.jpg","uploaded_by":"..."}
        private void HandlePrescriptionUpload(NetworkStream stream, string body, string staff)
        {
            JObj req = ParseBody(body);
            if (req == null) { SendJsonResponse(stream, 400, "{\"error\":\"bad_request\"}"); return; }
            string rid = (req.GetStr("resident_id") ?? "").Trim();
            string date = (req.GetStr("date") ?? "").Trim();
            string data = req.GetStr("data") ?? "";
            if (!System.Text.RegularExpressions.Regex.IsMatch(rid, "^[0-9]{1,9}$") || !System.Text.RegularExpressions.Regex.IsMatch(date, "^[0-9]{4}-[0-9]{2}-[0-9]{2}$"))
            {
                SendJsonResponse(stream, 400, "{\"error\":\"bad_request\"}");
                return;
            }
            int comma = data.IndexOf(',');
            if (data.StartsWith("data:") && comma > 0) data = data.Substring(comma + 1);
            byte[] img;
            try { img = Convert.FromBase64String(data); } catch { img = null; }
            if (img == null || img.Length < 4 || img.Length > 8 * 1024 * 1024 || img[0] != 0xFF || img[1] != 0xD8)
            {
                SendJsonResponse(stream, 400, "{\"error\":\"bad_image\"}");
                return;
            }
            string folder = Path.Combine(Path.Combine(Path.Combine(_dataDir, "photos"), "prescriptions"), "r" + rid);
            string fileName = date + "_" + DateTime.Now.ToString("HHmmss") + "_" + NewToken().Substring(0, 6) + ".jpg";
            try
            {
                if (!Directory.Exists(folder)) Directory.CreateDirectory(folder);
                File.WriteAllBytes(Path.Combine(folder, fileName), img);
            }
            catch
            {
                SendJsonResponse(stream, 500, "{\"error\":\"save_failed\"}");
                return;
            }
            string url = "data/photos/prescriptions/r" + rid + "/" + fileName;
            string who = (staff ?? "").Replace("\\", "").Replace("\"", "");
            SendJsonResponse(stream, 200, "{\"success\":true,\"url\":\"" + url + "\",\"uploaded_by\":\"" + who + "\"}");
        }

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

        // [Antigravity追加] 外部への自動二重バックアップ
        public class ExtBackupResult
        {
            public bool Success;
            public string Timestamp;
            public string BackupDir;
            public string Error;
            public string DestPath;
            public int FilesCount;
        }

        private static int CopyDirectoryRecursive(string sourceDir, string targetDir)
        {
            int count = 0;
            if (!Directory.Exists(sourceDir)) return 0;
            if (!Directory.Exists(targetDir)) Directory.CreateDirectory(targetDir);

            string[] files = Directory.GetFiles(sourceDir);
            for (int i = 0; i < files.Length; i++)
            {
                string f = files[i];
                string dest = Path.Combine(targetDir, Path.GetFileName(f));
                File.Copy(f, dest, true);
                count++;
            }

            string[] dirs = Directory.GetDirectories(sourceDir);
            for (int i = 0; i < dirs.Length; i++)
            {
                string d = dirs[i];
                string dest = Path.Combine(targetDir, Path.GetFileName(d));
                count += CopyDirectoryRecursive(d, dest);
            }
            return count;
        }

        private static void EnforceRetention(string destPath, int maxGenerations)
        {
            if (maxGenerations <= 0) return;
            if (!Directory.Exists(destPath)) return;
            // [Claude修正] このアプリが作った名前（backup_YYYYMMDD_HHmmss）のフォルダだけを数え、消す。
            // 以前は「backup_」で始まる別のフォルダ（例: backup_old）も対象になり、名前の並びで本物の世代が消されるおそれがあった
            List<string> own = new List<string>();
            foreach (string d0 in Directory.GetDirectories(destPath, "backup_*"))
            {
                if (System.Text.RegularExpressions.Regex.IsMatch(Path.GetFileName(d0), "^backup_[0-9]{8}_[0-9]{6}$")) own.Add(d0);
            }
            string[] dirs = own.ToArray();
            if (dirs.Length <= maxGenerations) return;
            Array.Sort(dirs);
            int toDelete = dirs.Length - maxGenerations;
            for (int i = 0; i < toDelete; i++)
            {
                try { Directory.Delete(dirs[i], true); } catch { }
            }
        }

        private void OnExtBackupTimerTick(object state)
        {
            try
            {
                TryRunExternalBackup(false);
            }
            catch { }
        }

        private ExtBackupResult TryRunExternalBackup(bool isManual)
        {
            ExtBackupResult res = new ExtBackupResult();
            res.Success = false;
            res.Timestamp = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss");
            res.BackupDir = "";
            res.Error = "";
            res.DestPath = "";
            res.FilesCount = 0;

            lock (_extBackupLock)
            {
                JObj db = null;
                try { db = LoadDb(); } catch { db = null; }
                if (db == null)
                {
                    res.Error = "データベースの読み込みに失敗しました";
                    return res;
                }

                JObj extCfg = db.Get("external_backup") as JObj;
                if (extCfg == null)
                {
                    if (isManual)
                    {
                        res.Error = "外部保存先のパスが設定されていません。管理画面から保存先パスを設定してください。";
                    }
                    return res;
                }

                string destPath = (extCfg.GetStr("destination_path") ?? "").Trim();
                if (string.IsNullOrEmpty(destPath))
                {
                    if (isManual)
                    {
                        res.Error = "外部保存先のパスが空です。管理画面から有効なパスを設定してください。";
                    }
                    return res;
                }

                int maxGen = 30;
                JNum mgNum = extCfg.Get("max_generations") as JNum;
                if (mgNum != null)
                {
                    int parsed;
                    if (int.TryParse(mgNum.Raw, out parsed) && parsed > 0) maxGen = parsed;
                }

                string todayStr = DateTime.Now.ToString("yyyy-MM-dd");
                string lastSuccess = extCfg.GetStr("last_success_at") ?? "";
                if (!isManual && lastSuccess.StartsWith(todayStr))
                {
                    res.Success = true;
                    res.Timestamp = lastSuccess;
                    res.BackupDir = extCfg.GetStr("last_backup_dir") ?? "";
                    return res;
                }

                res.DestPath = destPath;

                string destProblem = CheckExtBackupDest(destPath);
                if (destProblem != null)
                {
                    res.Error = destProblem;
                    try
                    {
                        UpdateDb(delegate(JObj d)
                        {
                            JObj ec = d.Get("external_backup") as JObj;
                            if (ec == null) { ec = new JObj(); d.Set("external_backup", ec); }
                            ec.Set("last_attempt_at", res.Timestamp);
                            ec.Set("last_status", "failed");
                            ec.Set("last_error", destProblem);
                            return true;
                        });
                    }
                    catch { }
                    return res;
                }

                try
                {
                    if (!Directory.Exists(destPath))
                    {
                        Directory.CreateDirectory(destPath);
                    }

                    string tsFolder = "backup_" + DateTime.Now.ToString("yyyyMMdd_HHmmss");
                    string targetFolder = Path.Combine(destPath, tsFolder);
                    Directory.CreateDirectory(targetFolder);

                    // 1. データ（portal_database.json の形）の保存。データベースのときは中身を書き出す
                    lock (_fileLock)
                    {
                        string allTxt = DbReadText();
                        if (!string.IsNullOrEmpty(allTxt))
                        {
                            File.WriteAllText(Path.Combine(targetFolder, "portal_database.json"), allTxt, Encoding.UTF8);
                            res.FilesCount++;
                        }
                    }

                    // 2. data/photos/ 以下の全ファイル・フォルダの保存
                    string photosSrc = Path.Combine(_dataDir, "photos");
                    if (Directory.Exists(photosSrc))
                    {
                        string photosTarget = Path.Combine(targetFolder, "photos");
                        int photoCopied = CopyDirectoryRecursive(photosSrc, photosTarget);
                        res.FilesCount += photoCopied;
                    }

                    // 3. バックアップ情報ファイル backup_info.json の出力
                    string infoContent = "{\"backup_time\":\"" + res.Timestamp + "\",\"generation\":\"" + tsFolder + "\",\"files_count\":" + res.FilesCount + "}";
                    File.WriteAllText(Path.Combine(targetFolder, "backup_info.json"), infoContent, Encoding.UTF8);

                    // 4. 世代管理
                    EnforceRetention(destPath, maxGen);

                    res.Success = true;
                    res.BackupDir = tsFolder;

                    UpdateDb(delegate(JObj d)
                    {
                        JObj ec = d.Get("external_backup") as JObj;
                        if (ec == null)
                        {
                            ec = new JObj();
                            d.Set("external_backup", ec);
                        }
                        ec.Set("last_success_at", res.Timestamp);
                        ec.Set("last_attempt_at", res.Timestamp);
                        ec.Set("last_status", "success");
                        ec.Set("last_error", "");
                        ec.Set("last_backup_dir", tsFolder);
                        return true;
                    });
                }
                catch (Exception ex)
                {
                    res.Success = false;
                    res.Error = ex.Message;

                    try
                    {
                        UpdateDb(delegate(JObj d)
                        {
                            JObj ec = d.Get("external_backup") as JObj;
                            if (ec == null)
                            {
                                ec = new JObj();
                                d.Set("external_backup", ec);
                            }
                            ec.Set("last_attempt_at", res.Timestamp);
                            ec.Set("last_status", "failed");
                            ec.Set("last_error", ex.Message);
                            return true;
                        });
                    }
                    catch { }
                }
            }

            return res;
        }

        // [Claude追加] 外部保存先の確認。問題があれば理由（日本語）、なければ null。
        // ポータルのフォルダの中（data/ など）を指定すると、写真フォルダを自分の中へ写し続けて止まらなくなる。
        // 相対パスは起動場所で行き先が変わるため使わない
        private string CheckExtBackupDest(string dest)
        {
            if (string.IsNullOrEmpty(dest)) return "外部保存先のパスが空です。管理画面から設定してください。";
            if (!Path.IsPathRooted(dest)) return "外部保存先は、ドライブ名（D:\\ など）か共有フォルダ（\\\\PC名\\共有名 など）から始まるパスで指定してください。";
            string full;
            try { full = Path.GetFullPath(dest).TrimEnd(Path.DirectorySeparatorChar); } catch { return "外部保存先のパスの書き方が正しくありません。"; }
            string baseFull = Path.GetFullPath(_baseDir).TrimEnd(Path.DirectorySeparatorChar);
            if (string.Equals(full, baseFull, StringComparison.OrdinalIgnoreCase)
                || full.StartsWith(baseFull + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))
            {
                return "外部保存先に、ポータルのフォルダ（" + baseFull + "）の中は指定できません。別のPCの共有フォルダなどを指定してください。";
            }
            return null;
        }

        private void HandleExternalBackupStatus(NetworkStream stream)
        {
            JObj db = null;
            try { db = LoadDb(); } catch { db = null; }
            JObj ext = db != null ? (db.Get("external_backup") as JObj) : null;
            if (ext == null)
            {
                SendJsonResponse(stream, 200, "{\"configured\":false,\"destination_path\":\"\",\"max_generations\":30,\"last_success_at\":\"\",\"last_attempt_at\":\"\",\"last_status\":\"\",\"last_error\":\"\",\"last_backup_dir\":\"\"}");
            }
            else
            {
                string json = MiniJson.Serialize(ext);
                SendJsonResponse(stream, 200, json);
            }
        }

        private void HandleExternalBackupConfig(NetworkStream stream, string body, string sessionStaff)
        {
            JObj req = ParseBody(body);
            if (req == null) { SendJsonResponse(stream, 400, "{\"error\":\"bad_request\"}"); return; }
            if (string.IsNullOrEmpty(sessionStaff)) { SendJsonResponse(stream, 401, "{\"error\":\"unauthorized\"}"); return; }

            JObj db = null;
            try { db = LoadDb(); } catch { db = null; }
            if (db == null) { SendJsonResponse(stream, 500, "{\"error\":\"no_data\"}"); return; }

            List<object> stamps = GetList(db, "stamps");
            JObj st = FindStamp(stamps, sessionStaff);
            if (!IsAdminRole(st) && !IsClerkRole(st))
            {
                SendJsonResponse(stream, 403, "{\"error\":\"forbidden_role\"}");
                return;
            }

            string dest = (req.GetStr("destination_path") ?? "").Trim();
            int maxGen = 30;
            JNum mgNum = req.Get("max_generations") as JNum;
            if (mgNum != null)
            {
                int p;
                if (int.TryParse(mgNum.Raw, out p) && p > 0) maxGen = p;
            }
            // [Claude修正] 保存先の確認（ポータルのフォルダの中・相対パスは不可）と、世代数は 1〜365
            if (maxGen > 365) maxGen = 365;
            if (dest.Length > 0)
            {
                string problem = CheckExtBackupDest(dest);
                if (problem != null)
                {
                    SendJsonResponse(stream, 400, "{\"error\":\"bad_destination\",\"message\":" + MiniJson.Quote(problem) + "}");
                    return;
                }
            }

            bool saved = UpdateDb(delegate(JObj d)
            {
                JObj ec = d.Get("external_backup") as JObj;
                if (ec == null)
                {
                    ec = new JObj();
                    d.Set("external_backup", ec);
                }
                ec.Set("destination_path", dest);
                ec.Set("max_generations", new JNum(maxGen.ToString(System.Globalization.CultureInfo.InvariantCulture)));
                return true;
            });

            SendJsonResponse(stream, saved ? 200 : 500, saved ? "{\"success\":true}" : "{\"error\":\"save_failed\"}");
        }

        private void HandleExternalBackupRun(NetworkStream stream, string sessionStaff)
        {
            if (string.IsNullOrEmpty(sessionStaff)) { SendJsonResponse(stream, 401, "{\"error\":\"unauthorized\"}"); return; }

            JObj db = null;
            try { db = LoadDb(); } catch { db = null; }
            if (db == null) { SendJsonResponse(stream, 500, "{\"error\":\"no_data\"}"); return; }

            List<object> stamps = GetList(db, "stamps");
            JObj st = FindStamp(stamps, sessionStaff);
            if (!IsAdminRole(st) && !IsClerkRole(st))
            {
                SendJsonResponse(stream, 403, "{\"error\":\"forbidden_role\"}");
                return;
            }

            ExtBackupResult res = TryRunExternalBackup(true);

            JObj respObj = new JObj();
            respObj.Set("success", res.Success);
            respObj.Set("timestamp", res.Timestamp);
            respObj.Set("backup_dir", res.BackupDir);
            respObj.Set("error", res.Error);
            respObj.Set("files_count", new JNum(res.FilesCount.ToString(System.Globalization.CultureInfo.InvariantCulture)));

            string respJson = MiniJson.Serialize(respObj);
            SendJsonResponse(stream, res.Success ? 200 : 500, respJson);
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
            if (cur != null && cur.Get("external_backup") != null)
            {
                posted.Set("external_backup", cur.Get("external_backup"));
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


        // ======================================================================
        // [Claude追加 2026-10-16] 差分保存（作り変え ①②）
        // ① /api/rev: 版番号だけを返す。端末は5秒ごとにこれだけを聞き、変わったときだけ全データを取る
        // ② /api/save-diff: 変わった記録だけを「前の中身」と一緒に受け取り、記録ごとに当てはめる。
        //    同じ記録を別の端末が先に変えていたら 409（競合）を返し、端末に最新と合流させてやり直させる。
        //    違う記録なら、同時に保存しても両方残る。
        // 控えファイル: 24時間分は全部残し、それより前は1日1つ（その日の最後）を30日分だけ残す
        // ======================================================================
        private long _revCacheVal = -1;
        private long _revCacheStamp = -1;
        private JObj _dbCache;
        private long _dbCacheStamp = -1;
        private DateTime _lastBackupCleanup = DateTime.MinValue;
        private string _maskedCache;
        private byte[] _maskedGz;
        private string _maskedGzSrc;
        private static byte[] Gzip(byte[] raw)
        {
            using (MemoryStream ms = new MemoryStream())
            {
                using (System.IO.Compression.GZipStream z = new System.IO.Compression.GZipStream(ms, System.IO.Compression.CompressionMode.Compress, true))
                {
                    z.Write(raw, 0, raw.Length);
                }
                return ms.ToArray();
            }
        }
        private long _maskedCacheStamp = -1;
        // 受け取りも差分: 差分保存で当てはめた変更を覚えておき、端末には「この版から後に変わった記録だけ」を渡す
        private readonly List<KeyValuePair<long, string>> _changeLog = new List<KeyValuePair<long, string>>();
        private long _changeLogBaseRev = -1; // この版から後の変更を、途切れずに持っている
        private long _changeLogLastRev = -1;
        private const int ChangeLogMax = 500;

        // _fileLock の中で呼ぶ。describable=false（パスワードなどサーバーが補った保存）のときは途切れたことにする
        // 端末に渡す形の変更（パスワードは伏せ字）
        private static string DescribeOps(List<object> ops)
        {
                StringBuilder sb = new StringBuilder("[");
                bool first = true;
                foreach (object o in ops)
                {
                    JObj op = (JObj)o;
                    JObj c = new JObj();
                    foreach (string key in new string[] { "k", "t", "id", "v", "before", "del" })
                    {
                        if (op.Map.ContainsKey(key)) c.Set(key, op.Get(key));
                    }
                    if (!first) sb.Append(',');
                    first = false;
                    sb.Append(MiniJson.Serialize(c));
                }
                sb.Append(']');
                return MaskPasswords(sb.ToString());
        }

        // 変更の記録を途切れたことにする（全体を書き込んだとき。端末は次に全体を取りに来る）
        private void ResetChangeLog()
        {
            _changeLog.Clear();
            _changeLogBaseRev = -1;
            _changeLogLastRev = -1;
        }

        // [第3段階] 起動時: データベースに残っている変更の記録を読み込む
        private void LoadChangeLog()
        {
            ResetChangeLog();
            if (_store == null) return;
            long baseRev;
            List<KeyValuePair<long, string>> rows = _store.LoadChanges(out baseRev);
            if (rows.Count == 0) return;
            _changeLog.AddRange(rows);
            _changeLogBaseRev = baseRev;
            _changeLogLastRev = rows[rows.Count - 1].Key;
        }

        private void RecordChange(long prevRev, long newRev, string change)
        {
            bool describable = change != null;
            if (!describable || prevRev != _changeLogLastRev)
            {
                _changeLog.Clear();
                _changeLogBaseRev = describable ? prevRev : newRev;
            }
            if (describable)
            {
                _changeLog.Add(new KeyValuePair<long, string>(newRev, change));
                while (_changeLog.Count > ChangeLogMax)
                {
                    _changeLog.RemoveAt(0);
                    _changeLogBaseRev = _changeLog[0].Key - 1;
                }
            }
            _changeLogLastRev = newRev;
        }

        private void HandleChanges(NetworkStream stream, string rawUrl)
        {
            long since = -1;
            var m = System.Text.RegularExpressions.Regex.Match(rawUrl, "[?&]since=(\\d+)");
            if (m.Success) long.TryParse(m.Groups[1].Value, out since);
            string resp;
            lock (_fileLock)
            {
                long cur = GetCurrentRev();
                if (since < 0 || cur < 0 || cur != _changeLogLastRev || since < _changeLogBaseRev || since > cur)
                {
                    resp = "{\"full\":true,\"rev\":" + cur + "}";
                }
                else
                {
                    StringBuilder sb = new StringBuilder("{\"rev\":" + cur + ",\"changes\":[");
                    bool first = true;
                    foreach (var kv in _changeLog)
                    {
                        if (kv.Key <= since) continue;
                        if (!first) sb.Append(',');
                        first = false;
                        sb.Append("{\"rev\":" + kv.Key + ",\"ops\":" + kv.Value + "}");
                    }
                    sb.Append("]}");
                    resp = sb.ToString();
                }
            }
            SendJsonResponse(stream, 200, resp);
        }
        // パスワード・暗証番号など、サーバーが持つ値が入る項目。変わったときは今までの全体の手順で補う
        private static readonly string[] DiffSlowKeys = new string[] { "staff_accounts", "stamps", "facility_name", "external_backup" };

        // _fileLock の中で呼ぶ
        private long GetCurrentRev()
        {
            if (!DbExists()) return -1;
            long stamp = DbStamp();
            if (_revCacheVal >= 0 && stamp == _revCacheStamp) return _revCacheVal;
            string txt = DbReadText();
            var m = System.Text.RegularExpressions.Regex.Match(txt ?? "", "\"_rev\":(\\d+)");
            _revCacheVal = m.Success ? long.Parse(m.Groups[1].Value) : 0;
            _revCacheStamp = stamp;
            return _revCacheVal;
        }

        // _fileLock の中で呼ぶ。ファイルが変わっていなければ、読み込み済みのデータを使う
        private JObj GetDbCached()
        {
            if (!DbExists()) return null;
            long stamp = DbStamp();
            if (_dbCache != null && stamp == _dbCacheStamp) return _dbCache;
            string txt = DbReadText();
            _dbCache = string.IsNullOrEmpty(txt) ? null : (MiniJson.Parse(txt) as JObj);
            _dbCacheStamp = stamp;
            return _dbCache;
        }

        private static string DiffMasked(object v)
        {
            return MaskPasswords(MiniJson.Serialize(v));
        }

        private static int DiffFindIndex(List<object> list, string id)
        {
            if (list == null || id == null) return -1;
            for (int i = 0; i < list.Count; i++)
            {
                JObj j = list[i] as JObj;
                if (j != null && j.GetStr("id") == id) return i;
            }
            return -1;
        }

        private static bool DiffFlag(JObj o, string key)
        {
            object v = o.Get(key);
            return v is bool && (bool)v;
        }

        private void HandleSaveDiff(NetworkStream stream, string body)
        {
            JObj req = null;
            try { req = MiniJson.Parse(body) as JObj; } catch { req = null; }
            List<object> ops = req != null ? (req.Get("ops") as List<object>) : null;
            if (ops == null) { SendJsonResponse(stream, 400, "{\"error\":\"bad_diff\"}"); return; }
            int status = 200;
            string resp = null;
            string sessionsJson = null;
            lock (_fileLock)
            {
                try
                {
                    JObj db = GetDbCached();
                    if (db == null)
                    {
                        status = 409; resp = "{\"error\":\"no_data\"}";
                    }
                    else
                    {
                        // 1. 先に全部の記録を確かめる（途中で競合が見つかったら、何も変えない）
                        string conflictKey = null;
                        bool slow = false;
                        foreach (object o in ops)
                        {
                            JObj op = o as JObj;
                            if (op == null) { conflictKey = "?"; break; }
                            string k = op.GetStr("k");
                            string t = op.GetStr("t");
                            if (string.IsNullOrEmpty(k) || k == "_rev") { conflictKey = "?"; break; }
                            if (Array.IndexOf(DiffSlowKeys, k) >= 0) slow = true;
                            if (t == "up" || t == "rm")
                            {
                                List<object> list = db.Get(k) as List<object>;
                                if (db.Get(k) != null && list == null) { conflictKey = k; break; }
                                int idx = DiffFindIndex(list, op.GetStr("id"));
                                object cur = idx >= 0 ? list[idx] : null;
                                object b = op.Get("b");
                                bool ok;
                                if (t == "up")
                                {
                                    object v = op.Get("v");
                                    if (cur == null) ok = (b == null);
                                    else ok = (b != null && DiffMasked(cur) == DiffMasked(b)) || DiffMasked(cur) == DiffMasked(v);
                                }
                                else
                                {
                                    ok = (cur == null) || (b != null && DiffMasked(cur) == DiffMasked(b));
                                }
                                if (!ok) { conflictKey = k; break; }
                            }
                            else if (t == "set")
                            {
                                bool curHas = db.Map.ContainsKey(k);
                                bool had = DiffFlag(op, "had");
                                bool del = DiffFlag(op, "del");
                                string curM = curHas ? DiffMasked(db.Get(k)) : "<none>";
                                string baseM = had ? DiffMasked(op.Get("b")) : "<none>";
                                string newM = del ? "<none>" : DiffMasked(op.Get("v"));
                                if (curM != baseM && curM != newM) { conflictKey = k; break; }
                            }
                            else { conflictKey = "?"; break; }
                        }
                        if (conflictKey != null)
                        {
                            status = 409; resp = "{\"error\":\"conflict\",\"key\":" + MiniJson.Quote(conflictKey) + "}";
                        }
                        else
                        {
                            string beforeJson = slow ? DbReadText() : null;
                            // 2. 当てはめる
                            foreach (object o in ops)
                            {
                                JObj op = (JObj)o;
                                string k = op.GetStr("k");
                                string t = op.GetStr("t");
                                if (t == "set")
                                {
                                    if (DiffFlag(op, "del")) { if (db.Map.ContainsKey(k)) { db.Map.Remove(k); db.Keys.Remove(k); } }
                                    else db.Set(k, op.Get("v"));
                                    continue;
                                }
                                List<object> list = db.Get(k) as List<object>;
                                if (list == null) { list = new List<object>(); db.Set(k, list); }
                                int idx = DiffFindIndex(list, op.GetStr("id"));
                                if (t == "rm")
                                {
                                    if (idx >= 0) list.RemoveAt(idx);
                                    continue;
                                }
                                JObj nv = op.Get("v") as JObj;
                                if (nv == null) continue;
                                if (idx >= 0)
                                {
                                    // 伏せ字（空）で届いたパスワード・暗証番号は、サーバーの値を残す
                                    JObj old = list[idx] as JObj;
                                    if (old != null)
                                    {
                                        foreach (string sk in new string[] { "password", "pin" })
                                        {
                                            if (nv.Get(sk) is string && (string)nv.Get(sk) == "" && old.Get(sk) is string && (string)old.Get(sk) != "") nv.Set(sk, old.Get(sk));
                                        }
                                    }
                                    list[idx] = nv;
                                }
                                else
                                {
                                    int at = DiffFindIndex(list, op.GetStr("before"));
                                    if (at >= 0) list.Insert(at, nv); else list.Add(nv);
                                }
                            }
                            // 3. 版番号を進めて書き込む
                            long prevRev = 0;
                            JNum rn = db.Get("_rev") as JNum;
                            if (rn != null) long.TryParse(rn.Raw, out prevRev);
                            long newRev = prevRev + 1;
                            db.Set("_rev", new JNum(newRev.ToString(System.Globalization.CultureInfo.InvariantCulture)));
                            string outJson = null;
                            string change = null;
                            if (slow)
                            {
                                outJson = MergeAccountSecrets(MiniJson.Serialize(db), beforeJson);
                                _dbCache = MiniJson.Parse(outJson) as JObj;
                                sessionsJson = outJson;
                                DbWriteText(outJson);
                            }
                            else if (_store != null)
                            {
                                // [第2段階] データベースには、変わった記録と版番号だけを書く（全体を組み立て直さない）
                                change = DescribeOps(ops);
                                _store.WriteDelta(db, ops, prevRev, newRev, change);
                            }
                            else
                            {
                                outJson = MiniJson.Serialize(db);
                                File.WriteAllText(_dbFile, outJson, Encoding.UTF8); // JSON だけで動くとき（変更の記録は続ける）
                                change = DescribeOps(ops);
                            }
                            RecordChange(prevRev, newRev, change);
                            long stampAfter = DbStamp();
                            _dbCacheStamp = stampAfter;
                            _revCacheVal = newRev; _revCacheStamp = stampAfter;
                            if (outJson != null) WriteMinuteBackup(outJson);
                            else QueueMinuteBackup();
                            resp = "{\"success\":true,\"rev\":" + newRev + ",\"prev_rev\":" + prevRev + ",\"saved_at\":\"" + DateTime.Now.ToString("HH:mm") + "\"}";
                        }
                    }
                }
                catch (Exception ex)
                {
                    _dbCache = null; // 途中で失敗したときは、次はファイルから読み直す
                    status = 500; resp = "{\"error\":" + MiniJson.Quote(ex.Message) + "}";
                }
            }
            if (sessionsJson != null) { try { DropSuspendedSessions(sessionsJson); } catch { } }
            SendJsonResponse(stream, status, resp);
        }

        // 分ごとの控え: その分の最初の保存で1つ作る。最新の控え（backup_latest.json）は毎回書く。古い控えは整理する
        private void WriteMinuteBackup(string json)
        {
            try
            {
                string ts = DateTime.Now.ToString("yyyyMMdd_HHmm");
                string backupPath = Path.Combine(_backupDir, "backup_" + ts + ".json");
                if (!File.Exists(backupPath)) File.WriteAllText(backupPath, json, Encoding.UTF8);
                File.WriteAllText(Path.Combine(_backupDir, "backup_latest.json"), json, Encoding.UTF8);
            }
            catch { }
            CleanupMinuteBackups();
        }

        // [第2段階] データベースのとき: 控え（その分の最初の1つと backup_latest.json）は1分に1回だけ作る。
        // データベースは書きかけが残らないので、保存のたびに全体を書く必要がない（保存を速くするため）
        // [Claude修正 2026-10-18] データベースのときの分ごとの控えは、保存の返事を待たせないよう別の作業で書く
        //（記録が1年分あると、控え1つの書き込みに1秒近くかかり、その分だけ保存が遅れていた）
        private string _minuteBackupQueued;
        private void QueueMinuteBackup()
        {
            string ts = DateTime.Now.ToString("yyyyMMdd_HHmm");
            if (_minuteBackupQueued == ts) return;
            string backupPath = Path.Combine(_backupDir, "backup_" + ts + ".json");
            if (File.Exists(backupPath)) { _minuteBackupQueued = ts; return; }
            _minuteBackupQueued = ts;
            ThreadPool.QueueUserWorkItem(delegate(object st)
            {
                try
                {
                    string json;
                    lock (_fileLock) { json = DbReadText(); }
                    if (string.IsNullOrEmpty(json)) return;
                    File.WriteAllText(backupPath, json, Encoding.UTF8);
                    File.WriteAllText(Path.Combine(_backupDir, "backup_latest.json"), json, Encoding.UTF8);
                }
                catch { }
                try { lock (_fileLock) { CleanupMinuteBackups(); } } catch { }
            });
        }

        private void WriteMinuteBackupIfDue(JObj db)
        {
            try
            {
                string ts = DateTime.Now.ToString("yyyyMMdd_HHmm");
                string backupPath = Path.Combine(_backupDir, "backup_" + ts + ".json");
                if (File.Exists(backupPath)) return;
                string json = MiniJson.Serialize(db);
                File.WriteAllText(backupPath, json, Encoding.UTF8);
                File.WriteAllText(Path.Combine(_backupDir, "backup_latest.json"), json, Encoding.UTF8);
            }
            catch { }
            CleanupMinuteBackups();
        }

        private void CleanupMinuteBackups()
        {
            if ((DateTime.Now - _lastBackupCleanup).TotalMinutes < 10) return;
            _lastBackupCleanup = DateTime.Now;
            try
            {
                var rx = new System.Text.RegularExpressions.Regex("^backup_(\\d{8})_(\\d{4})\\.json$");
                DateTime now = DateTime.Now;
                var byDay = new Dictionary<string, List<string>>();
                foreach (string f in Directory.GetFiles(_backupDir, "backup_*.json"))
                {
                    var m = rx.Match(Path.GetFileName(f));
                    if (!m.Success) continue; // backup_latest.json など、この形でない名前は触らない
                    DateTime t;
                    if (!DateTime.TryParseExact(m.Groups[1].Value + m.Groups[2].Value, "yyyyMMddHHmm", System.Globalization.CultureInfo.InvariantCulture, System.Globalization.DateTimeStyles.None, out t)) continue;
                    if ((now - t).TotalHours <= 24) continue;               // 24時間分は全部残す
                    if ((now - t).TotalDays > 30) { try { File.Delete(f); } catch { } continue; } // 30日より前は消す
                    string day = m.Groups[1].Value;
                    if (!byDay.ContainsKey(day)) byDay[day] = new List<string>();
                    byDay[day].Add(f);
                }
                foreach (var kv in byDay)
                {
                    kv.Value.Sort(StringComparer.Ordinal);
                    for (int i = 0; i < kv.Value.Count - 1; i++) { try { File.Delete(kv.Value[i]); } catch { } } // その日の最後の1つだけ残す
                }
            }
            catch { }
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

            // [Claude追加 2026-10-17] データベース（data/portal.db）を開く。初めてのときは portal_database.json から取り込む。
            // 使える SQLite がなければ、今までどおり JSON ファイルで動く
            if (Environment.GetEnvironmentVariable("CARE_PORTAL_NO_DB") != "1")
            {
                string why;
                _store = PortalStore.TryOpen(Path.Combine(_dataDir, "portal.db"), _baseDir, out why);
                _storeWhy = why;
                if (_store != null)
                {
                    try { lock (_fileLock) { SyncJsonFile(); LoadChangeLog(); } }
                    catch (Exception ex)
                    {
                        // 取り込みに失敗したら、データベースは使わず JSON ファイルで動く（データを失わないことを優先）
                        _storeWhy = "取り込みに失敗: " + ex.Message;
                        try { _store.Close(); } catch { }
                        _store = null;
                    }
                }
            }
            else _storeWhy = "CARE_PORTAL_NO_DB=1 のため使わない";
        }

        public void Start()
        {
            _listener = new TcpListener(IPAddress.Any, _port);
            _listener.Start();
            // [Claude追加 2026-10-16] 端末が多いときに、要求を待たせないよう同時に動ける作業の下限を上げる
            try { int w, io; ThreadPool.GetMinThreads(out w, out io); ThreadPool.SetMinThreads(Math.Max(w, 64), Math.Max(io, 64)); } catch { }

            // [Antigravity追加] 外部への自動二重バックアップ
            // 起動5秒後に初回の外部バックアップ確認を行い、以降30分ごとに定期確認 (1日1回自動保存)
            try
            {
                _extBackupTimer = new System.Threading.Timer(OnExtBackupTimerTick, null, 5000, 30 * 60 * 1000);
            }
            catch { }
            // [Claude追加 2026-10-17] 30秒ごとに、データベースの中身を portal_database.json に書き出す（外から変わっていれば取り込む）
            if (_store != null)
            {
                try { _jsonSyncTimer = new System.Threading.Timer(OnJsonSyncTick, null, 30000, 30000); } catch { }
            }

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

        public void StartAsync()
        {
            ThreadPool.QueueUserWorkItem(delegate(object state)
            {
                Start();
            });
        }

        public void Stop()
        {
            // [Claude追加 2026-10-17] 止めるときに、最後の中身を書き出してからデータベースを閉じる
            try { if (_jsonSyncTimer != null) { _jsonSyncTimer.Dispose(); _jsonSyncTimer = null; } } catch { }
            if (_store != null)
            {
                try { lock (_fileLock) { SyncJsonFile(); } } catch { }
                try { _store.Close(); } catch { }
            }
            try
            {
                if (_extBackupTimer != null)
                {
                    _extBackupTimer.Dispose();
                    _extBackupTimer = null;
                }
            }
            catch { }
            try
            {
                if (_listener != null)
                {
                    _listener.Stop();
                }
            }
            catch { }
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

                    // [Antigravity追加] 外部への自動二重バックアップ
                    if (urlPath == "/api/external-backup-status" && (method == "GET" || method == "POST"))
                    {
                        HandleExternalBackupStatus(stream);
                        return;
                    }
                    if (urlPath == "/api/external-backup-config" && method == "POST")
                    {
                        HandleExternalBackupConfig(stream, Encoding.UTF8.GetString(bodyBytes), sessStaff);
                        return;
                    }
                    if (urlPath == "/api/external-backup-run" && method == "POST")
                    {
                        HandleExternalBackupRun(stream, sessStaff);
                        return;
                    }

                    // [Claude追加] 処方箋の画像を data/photos/prescriptions/ にファイルとして保存する
                    // （全データの JSON に画像を入れると、保存・同期のたびに重くなるため）。登録者はセッションの職員名
                    if (urlPath == "/api/prescription-upload" && method == "POST")
                    {
                        HandlePrescriptionUpload(stream, Encoding.UTF8.GetString(bodyBytes), sessStaff);
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
                            if (DbExists())
                            {
                                // [Claude修正 2026-10-16] 伏せ字にした全データを覚えておき、中身が変わるまで使い回す
                                // （以前は端末が取りに来るたびに読み込み・伏せ字の処理をし、その間ほかの要求を待たせていた）
                                long stamp = DbStamp();
                                if (_maskedCache != null && stamp == _maskedCacheStamp)
                                {
                                    dataJson = _maskedCache;
                                }
                                else
                                {
                                    string txt = DbReadText();
                                    // [Claude修正] パスワードは端末に渡さない (伏せ字にする)
                                    dataJson = string.IsNullOrEmpty(txt) ? "" : MaskPasswords(txt);
                                    _maskedCache = dataJson;
                                    _maskedCacheStamp = stamp;
                                }
                            }
                        }
                        // [第3段階] ブラウザには縮めて渡す（gzip。記録が増えても受け取りが軽い。ブラウザがそのまま元に戻す）
                        string ae = GetHeader(lines, "Accept-Encoding") ?? "";
                        if (!string.IsNullOrEmpty(dataJson) && dataJson.Length > 8192 && ae.IndexOf("gzip", StringComparison.OrdinalIgnoreCase) >= 0)
                        {
                            byte[] gz = null;
                            lock (_fileLock)
                            {
                                if (_maskedGz != null && object.ReferenceEquals(_maskedGzSrc, dataJson)) gz = _maskedGz;
                            }
                            if (gz == null)
                            {
                                gz = Gzip(Encoding.UTF8.GetBytes(dataJson));
                                lock (_fileLock) { _maskedGz = gz; _maskedGzSrc = dataJson; }
                            }
                            SendCorsResponse(stream, 200, "OK", "application/json; charset=utf-8", gz, null, "Content-Encoding: gzip\r\nVary: Accept-Encoding\r\n");
                            return;
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

                    // [Claude追加 2026-10-16] ① 版番号だけを返す ② 差分保存
                    if (urlPath == "/api/rev")
                    {
                        long rv;
                        lock (_fileLock) { rv = GetCurrentRev(); }
                        SendJsonResponse(stream, 200, "{\"rev\":" + rv + "}");
                        return;
                    }
                    if (urlPath == "/api/changes")
                    {
                        HandleChanges(stream, rawUrl);
                        return;
                    }
                    if (urlPath == "/api/save-diff" && method == "POST")
                    {
                        HandleSaveDiff(stream, Encoding.UTF8.GetString(bodyBytes));
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
                                if (DbExists())
                                {
                                    currentJson = DbReadText();
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
                                DbWriteText(postData);
                                try { DropSuspendedSessions(postData); } catch { }
                                // [Claude修正 2026-10-16] 控えは差分保存と同じ手順（分ごとに1つ・古いものは整理）
                                WriteMinuteBackup(postData);
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
            SendCorsResponse(stream, statusCode, statusMsg, contentType, body, setCookie, null);
        }

        private static void SendCorsResponse(NetworkStream stream, int statusCode, string statusMsg, string contentType, byte[] body, string setCookie, string extraHeaders)
        {
            string headers = "HTTP/1.1 " + statusCode + " " + statusMsg + "\r\n" +
                             (string.IsNullOrEmpty(setCookie) ? "" : "Set-Cookie: " + setCookie + "\r\n") +
                             (extraHeaders ?? "") +
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
    Write-Host (" [データの保存先]: " + $server.StorageInfo) -ForegroundColor White
    Write-Host ""
    $server.Start()
} finally {
    if ($server) {
        try { $server.Stop() } catch { }
    }
    & $cleanup
}