# デモの入院（roster.HOSP）を、利用者の「入院の期間リスト」（hospitalizations）に入れる
# 過去の入院（中島さん・鈴木さん・田中さん）がリストになく、その月の入院時費用や「入院中」の表示、利用者への請求の日数がずれていた（2026-10-23 見つけた）
# 使い方: python fix_hosp_list.py data/portal_database.json [--today 2026-10-23] （2回当てても同じ。今日より後の入院・退院は入れない）
import sys, os, json, datetime as DT
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import roster

def apply(d, today):
    res = {r["id"]: r for r in d["residents"]}
    n = 0
    for h in roster.HOSP:
        r = res.get(h["rid"])
        if not r or h["start"] > today: continue
        lst = r.get("hospitalizations") if isinstance(r.get("hospitalizations"), list) else []
        end = h["end"] if (h["end"] and h["end"] <= today) else ""
        hit = next((x for x in lst if x.get("admission_date") == h["start"]), None)
        if hit is None:
            lst.append({"id": int(r["id"]) * 10000 + 1 + len(lst), "resident_id": r["id"], "admission_date": h["start"], "discharge_date": end,
                        "hospital_name": h["hospital"], "reason": h["reason"], "created_by": "鈴木 美智子", "created_at": f"{h['start']} 12:00"})
            n += 1
        elif end and not hit.get("discharge_date"):
            hit["discharge_date"] = end; n += 1
        r["hospitalizations"] = sorted(lst, key=lambda x: x.get("admission_date", ""))
        ongoing = [x for x in r["hospitalizations"] if not x.get("discharge_date") and not x.get("voided")]
        latest = r["hospitalizations"][-1]
        r["hospital_date"] = latest["admission_date"]; r["hospital_name"] = latest["hospital_name"]; r["hospital_reason"] = latest["reason"]
        if not ongoing and r.get("status") == "入院中": r["status"] = "在所"
    return n

if __name__ == "__main__":
    path = sys.argv[1]
    today = sys.argv[sys.argv.index("--today") + 1] if "--today" in sys.argv else DT.date.today().isoformat()
    d = json.load(open(path, encoding="utf-8-sig"))
    n = apply(d, today)
    if isinstance(d.get("_rev"), int): d["_rev"] += 1
    tmp = path + ".tmp_write"
    with open(tmp, "w", encoding="utf-8-sig", newline="") as f:
        f.write(json.dumps(d, ensure_ascii=False, separators=(",", ":")))
    os.replace(tmp, path)
    print("入院の期間リストに入れた:", n, "件")
