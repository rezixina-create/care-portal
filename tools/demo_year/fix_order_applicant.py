# デモの発注で、発注者・受取者が入っていないもの（前の版で作った試しの発注）に名前を入れる
# あなた「誰かに切り替えてください、未記入だと了承するのおかしいでしょ」
# 物品の発注と受け取りは事務が行う流れにして、事務員（松本 陽子）にする
# 使い方: python fix_order_applicant.py data/portal_database.json （サーバーを止めてから）
import sys, os, json
path = sys.argv[1]
d = json.load(open(path, encoding="utf-8-sig"))
na = nr = 0
for o in d.get("orders", []):
    if not o.get("applicant"):
        o["applicant"] = "松本 陽子"; na += 1
    if o.get("status") == "納品完了" and not o.get("received_by"):
        o["received_by"] = "松本 陽子"; nr += 1
if isinstance(d.get("_rev"), int): d["_rev"] += 1
tmp = path + ".tmp_write"
with open(tmp, "w", encoding="utf-8-sig", newline="") as f:
    f.write(json.dumps(d, ensure_ascii=False, separators=(",", ":")))
os.replace(tmp, path)
print("発注者を入れた発注:", na, "件 / 受取者を入れた発注:", nr, "件")
