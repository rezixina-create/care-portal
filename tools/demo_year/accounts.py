# デモ用のログインID（説明用。パスワードは全員 0000）
# 管理者 aaaa・看護師 bbbb・事務 cccc・介護士 dddd。ほかの職員は eeee から順に
import json, sys
FIXED = [("木村 健一", "aaaa"), ("鈴木 美智子", "bbbb"), ("松本 陽子", "cccc"), ("井上 蓮", "dddd")]

def apply(d):
    names = [s["name"] if isinstance(s, dict) else s for s in d.get("stamps", [])]
    ids = dict(FIXED)
    nxt = ord("e")
    for nm in names:
        if nm in ids: continue
        ids[nm] = chr(nxt) * 4; nxt += 1
    accs = []
    for nm in names:
        accs.append({"id": nm, "staff_name": nm, "staff_id": ids[nm], "password": "0000", "is_custom": False, "updated_at": ""})
    d["staff_accounts"] = accs
    return [(nm, ids[nm]) for nm in names]

if __name__ == "__main__":
    src = sys.argv[1]; dst = sys.argv[2]
    raw = open(src, "rb").read()
    bom = raw.startswith(b"\xef\xbb\xbf")
    d = json.loads(raw.decode("utf-8-sig"))
    lst = apply(d)
    d["_rev"] = int(d.get("_rev", 0)) + 1
    out = json.dumps(d, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    open(dst, "wb").write((b"\xef\xbb\xbf" if bom else b"") + out)
    for nm, i in lst: print(i, nm)
