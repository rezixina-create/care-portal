# 年末年始（12/29〜1/3）は入浴なし: 1年分のデモ（2025-12-29〜2026-01-03）の入浴と「入浴後」の塗り薬の記録を外す
# （gen_daily.py の is_newyear と同じ決まり。デモのデータを作り直すのと同じ扱い）
# 使い方: python fix_newyear_bath.py data/portal_database.json
import sys, os, json, datetime as DT
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gen_daily as G
path = sys.argv[1]
d = json.load(open(path, encoding="utf-8-sig"))
def ny(x):
    s = str(x.get("date") or "")
    return len(s) >= 10 and s <= G.END.isoformat() and G.is_newyear(DT.date.fromisoformat(s[:10]))
nb = len(d.get("baths", [])); d["baths"] = [x for x in d.get("baths", []) if not ny(x)]
nt = len(d.get("topical_records", [])); d["topical_records"] = [x for x in d.get("topical_records", []) if not (ny(x) and x.get("timing") == "入浴後")]
print("入浴", nb - len(d["baths"]), "件・入浴後の塗り薬", nt - len(d["topical_records"]), "件を外した")
if isinstance(d.get("_rev"), int): d["_rev"] += 1
tmp = path + ".tmp_write"
with open(tmp, "w", encoding="utf-8-sig", newline="") as f:
    f.write(json.dumps(d, ensure_ascii=False, separators=(",", ":")))
os.replace(tmp, path)
