# デモの車両の記録を、キャラバン1号だけでなくタント2号も使うようにする
# あなた「車も１つだけじゃなくて他のも使ってあげて」（2026-10-22 20:51）
# - 散歩・外出（みんなで出かける）と整形外科の通院（車いすの方が多い）→ キャラバン1号
# - 日用品の買い出し・眼科・歯科の通院（1〜2人）→ タント2号
# - メーターは車ごとに日付の順でつなげ直す（走った距離はそのまま）。キャラバン 12,000km・タント 8,000km から
# 使い方: python fix_vehicles.py data/portal_database.json （extend_demo.py からも呼ぶ。2回当てても同じ）
import sys, os, json

START_KM = {"キャラバン1号": 12000, "タント2号": 8000}

def car_for(purpose):
    p = purpose or ""
    if "散歩" in p or "外出" in p or "整形外科" in p or "行事" in p: return "キャラバン1号"
    return "タント2号"

def apply(d):
    logs = d.get("vehicle_logs") or []
    demo = [x for x in logs if isinstance(x.get("id"), int) and 1790000000000 <= x["id"] < 1797000000000]
    n = 0
    for x in demo:
        c = car_for(x.get("purpose"))
        if x.get("vehicle_name") != c: x["vehicle_name"] = c; n += 1
    km = dict(START_KM)
    for x in sorted(demo, key=lambda x: (x.get("date", ""), x["id"])):
        c = x["vehicle_name"]
        dist = int(x.get("distance_km") or 0)
        x["start_km"] = km[c]; x["end_km"] = km[c] + dist; x["distance_km"] = dist
        km[c] += dist
    return n

if __name__ == "__main__":
    path = sys.argv[1]
    d = json.load(open(path, encoding="utf-8-sig"))
    n = apply(d)
    if isinstance(d.get("_rev"), int): d["_rev"] += 1
    tmp = path + ".tmp_write"
    with open(tmp, "w", encoding="utf-8-sig", newline="") as f:
        f.write(json.dumps(d, ensure_ascii=False, separators=(",", ":")))
    os.replace(tmp, path)
    print("車を入れ替えた:", n, "件")
