# デモの連絡ノートの記入者・車両の運転者を、その日に出勤している人にそろえる（勤務表 monthly_shifts を見る）
# gen_facility は人を勤務表を見ずに選んでいたので、休み・明けの人が書いたことになっていた日があった
# 使い方: python fix_on_duty.py data/portal_database.json （extend_demo.py からも呼ぶ。2回当てても同じ）
import sys, os, json

DAY = ("早", "日", "遅")
NB_STAFF = ["木村 健一", "山田 孝之", "吉田 誠", "佐藤 健太", "三浦 拓也", "鈴木 美智子"]
DRIVERS = ["山田 孝之", "吉田 誠", "佐々木 浩二"]
MORE_DRIVERS = ["伊藤 翔太", "高橋 直樹", "三浦 拓也", "中村 大輔", "松田 健二", "石川 太陽"]

def apply(d):
    ms = d.get("monthly_shifts") or {}
    def on(name, ds):
        return (ms.get(ds[:7], {}).get(name, {}) or {}).get(str(int(ds[8:10]))) in DAY
    def pick(cands, ds, seed):
        ok = [c for c in cands if on(c, ds)]
        return ok[seed % len(ok)] if ok else None
    n = 0
    for x in d.get("notebooks", []):
        ds = x.get("date", "")
        s = x.get("staff_name")
        if len(ds) < 10 or not s or s not in NB_STAFF or on(s, ds) or not ds[:7] in ms: continue
        p = pick(NB_STAFF, ds, int(x["id"]) // 7) or pick(sorted(ms.get(ds[:7], {})), ds, int(x["id"]) // 7)
        if not p: continue
        if x.get("resolved_staff") == s: x["resolved_staff"] = p
        x["staff_name"] = p; n += 1
    for x in d.get("vehicle_logs", []):
        ds = x.get("date", "")
        s = x.get("driver_name")
        if len(ds) < 10 or not s or on(s, ds) or not ds[:7] in ms: continue
        p = pick(DRIVERS, ds, int(x["id"]) // 7) or pick(MORE_DRIVERS, ds, int(x["id"]) // 7)
        if not p: continue
        x["driver_name"] = p; n += 1
    return n

if __name__ == "__main__":
    path = sys.argv[1]
    d = json.load(open(path, encoding="utf-8-sig"))
    n = apply(d)
    if n:
        if isinstance(d.get("_rev"), int): d["_rev"] += 1
        tmp = path + ".tmp_write"
        with open(tmp, "w", encoding="utf-8-sig", newline="") as f:
            f.write(json.dumps(d, ensure_ascii=False, separators=(",", ":")))
        os.replace(tmp, path)
    print("出勤していない人を直した:", n, "件")
