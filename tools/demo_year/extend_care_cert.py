# -*- coding: utf-8 -*-
# デモの要介護認定の有効期限を、発表（12/7・2月）のあいだ切れないように延ばす（2026-10-28）
# - あなた「２の期限的なところは済み、もしくは伸ばそうか。2月の分までいけるぐらいに」
# - 期限が 2027-02-28 までの在所・入院中の方は、今の認定期間を 24か月にする（始まりの日はそのまま、終わりを1年先に）
#   更新の認定の期間は最長36か月（同じ介護度なら48か月）なので、24か月はあり得る長さ
# - 始まりの日を変えない理由: 国保連の請求ファイル（7171）は今の認定期間を書くので、始まりを動かすと前の月の請求と合わなくなる
# - 退所した方（坂本 茂 様）は変えない。更新の手続きの印（renewal_steps）は触らない
# 使い方: python extend_care_cert.py data/portal_database.json （サーバーを止めてから。2回当てても同じ）
import sys, os, json, datetime as DT
path = sys.argv[1]
d = json.load(open(path, encoding="utf-8-sig"))
LIMIT = "2027-02-28"
changed = []
for r in d["residents"]:
    if r.get("status") not in ("在所", "入院中"): continue
    st, ex = r.get("care_start_date") or "", r.get("care_expiry_date") or ""
    if not st or not ex or ex > LIMIT: continue
    s = DT.date.fromisoformat(st)
    new_ex = (DT.date(s.year + 2, s.month, s.day) - DT.timedelta(days=1)).isoformat()
    if new_ex <= ex: continue
    changed.append(f"{r['room_no']} {r['name']}: {st}〜{ex} → {st}〜{new_ex}")
    r["care_expiry_date"] = new_ex
if changed and isinstance(d.get("_rev"), int): d["_rev"] += 1
tmp = path + ".tmp_write"
with open(tmp, "w", encoding="utf-8-sig", newline="") as f:
    f.write(json.dumps(d, ensure_ascii=False, separators=(",", ":")))
os.replace(tmp, path)
print("延ばした:", len(changed), "人"); print("\n".join(changed))
