# 勤務表を 2027-02 まで入れ直す（行事の日は夜勤・明け以外が全員「日」、年末年始の希望休）
# 使い方: python apply_roster_ext.py data/portal_database.json
# 2026-10-17 までの日は、行事の日のほかは前と同じ（記録を書いた職員と勤務表が合ったまま）
import sys, os, json, datetime as DT
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gen_daily as G

path = sys.argv[1]
d = json.load(open(path, encoding="utf-8-sig"))
new = G.monthly_shifts()
ms = d.get("monthly_shifts") or {}
for ym, staff in new.items():
    if ym <= G.END.isoformat()[:7]:
        mo = ms.setdefault(ym, {})
        for name, days in staff.items():
            mo.setdefault(name, {}).update(days)
    else:
        ms[ym] = staff
d["monthly_shifts"] = ms

# 希望休（年末年始など）を勤務表の画面にも出す。同じ人・同じ日があれば足さない
hopes = d.get("shift_hope_offs") or []
have = {(h.get("staff_name"), h.get("year_month"), int(h.get("day"))) for h in hopes}
next_id = max([int(h.get("id") or 0) for h in hopes] + [0]) + 1
for (name, day), reason in sorted(G.hope_offs().items(), key=lambda x: (x[0][1], x[0][0])):
    key = (name, day.isoformat()[:7], day.day)
    if key in have: continue
    hopes.append({"id": next_id, "year_month": key[1], "staff_name": name, "day": day.day, "reason": reason})
    next_id += 1
# 前から入っていた希望休で、もう過ぎた日（2026-10-17 まで）なのに勤務表で「休」でないものは、
# その月のいちばん近い「休」の日へ動かす（過去の勤務表は記録を書いた職員と合わせてあるので変えない）
for h in hopes:
    ym, day = h.get("year_month"), int(h.get("day"))
    row = ms.get(ym, {}).get(h.get("staff_name"), {})
    if not row or row.get(str(day)) == "休": continue
    if DT.date(int(ym[:4]), int(ym[5:]), day) > G.END: continue
    offs = sorted((abs(int(k) - day), int(k)) for k, v in row.items() if v == "休" and DT.date(int(ym[:4]), int(ym[5:]), int(k)) <= G.END)
    if offs:
        print("希望休を動かした:", h.get("staff_name"), ym, day, "→", offs[0][1])
        h["day"] = offs[0][1]
d["shift_hope_offs"] = hopes
# 勤務表の「行事・予定」の行に、職員全員で出る行事の名前を入れる（なぜ全員が日勤かわかるように）
EVT_NAME = {(2, 3): "節分", (3, 3): "ひな祭り", (4, 6): "お花見", (5, 5): "こどもの日", (7, 7): "七夕",
            (8, 15): "夏祭り", (9, 15): "敬老会", (10, 10): "運動会", (12, 24): "クリスマス会"}
assert set(EVT_NAME) == set(G.STAFF_EVENT_DAYS)
se = d.get("shift_events") or {}
for day in G.ROSTER_DAYS:
    if G.is_staff_event(day):
        mo = se.setdefault(day.isoformat()[:7], {})
        if not mo.get(str(day.day)):
            mo[str(day.day)] = EVT_NAME[(day.month, day.day)] + "（職員全員）"
d["shift_events"] = se
if isinstance(d.get("_rev"), int): d["_rev"] += 1

tmp = path + ".tmp_write"
with open(tmp, "w", encoding="utf-8-sig", newline="") as f:
    f.write(json.dumps(d, ensure_ascii=False, separators=(",", ":")))
os.replace(tmp, path)   # 書き終えてから差し替える（途中で止まっても元が残る）
print("monthly_shifts:", min(ms), "〜", max(ms), " 希望休:", len(hopes))
