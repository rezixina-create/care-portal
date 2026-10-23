# デモの「口腔の状態」の欄に、飲み込み・食べ方・吸引のことまで書いていたのを直す（2026-10-24）
# あなた「口腔ケアのところで、なんでトロミをつけてって嚥下能力のところが記載されていたのかが不思議だった。歯のところよね？」
# あなた「食形態でいいんじゃないかな…状態変化に応じてそこは記載をかえてもらうでも？だいたい職員会議で話題が出て、確かめてつけてみましょうって流れになると思うので」
# - 口腔の状態は、歯・入れ歯と口腔ケアのやり方だけにする
# - 佐藤 太郎 様（1）: お茶のとろみは食形態へ。2026-10-15 の職員会議で決めて、その日から（看護師が確かめた）。変更の履歴と記録を残す
# - 鈴木 一郎 様（3）: 吸引のことは外す（医師の指示の欄に「痰がからむときは看護師へ」がある）
# - 池田 久子 様（14）: 食べ方の注意は外す（医師の指示の欄に「食べるのが早いので、ひと口の量に注意」がある）
# 使い方: python fix_oral_state.py data/portal_database.json （2回当てても同じ）。このあと add_supply_demo.py を当てると、佐藤様のとろみ剤が 10/15 から入る
import sys, os, json
path = sys.argv[1]
d = json.load(open(path, encoding="utf-8-sig"))
R = {r["id"]: r for r in d["residents"]}
n = 0
r = R.get(1)
if r and "とろみ" not in (r.get("diet_type") or ""):
    before = {"diet_type": r.get("diet_type"), "oral_state": r.get("oral_state")}
    r["oral_state"] = "上下部分入れ歯。毎食後に入れ歯を洗う。"
    r["diet_type"] = (r.get("diet_type") or "普通食") + "・水分はとろみ"
    r.setdefault("edit_history", []).append({"edited_at": "2026-10-15 15:10", "edited_by": "鈴木 美智子", "before": before,
        "reason": "職員会議で、お茶でむせることが続いていると話し合い、水分にとろみをつけて様子をみることにした（看護師が飲み込みの様子を確かめた）"})
    d.setdefault("care_records", []).append({"id": 1795700000001, "recorded_at": "2026-10-15 15:05", "resident_id": 1, "category": "看護",
        "content": "職員会議で、お茶でむせることが続いていると話し合った。飲み込みの様子を確かめ、今日の夕食から水分にとろみをつけて様子をみる。むせの様子を記録し、変わりがあれば看護師へ。",
        "staff_name": "鈴木 美智子"})
    n += 1
for rid, txt in ((3, "上下総入れ歯。食事の前に口の体操。食後は口の中に食べ物が残っていないか確かめる。"), (14, "自分の歯。")):
    r = R.get(rid)
    if r and r.get("oral_state") != txt: r["oral_state"] = txt; n += 1
if isinstance(d.get("_rev"), int): d["_rev"] += 1
tmp = path + ".tmp_write"
with open(tmp, "w", encoding="utf-8-sig", newline="") as f:
    f.write(json.dumps(d, ensure_ascii=False, separators=(",", ":")))
os.replace(tmp, path)
print("直した:", n, "人")
