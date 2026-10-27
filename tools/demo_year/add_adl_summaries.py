# -*- coding: utf-8 -*-
# デモの介護サマリーに、新しい書き方（ADL を動作ごとの段階＋介助のやり方）の版を足す（2026-10-27）
# - Antigravity 4206c26 で ADL が「動作ごとの段階＋介助のやり方」になったが、デモのサマリーは前の書き方（文章）だけだったので、
#   口腔ケアの表の「整容」が全員「サマリー未記入」になっていた
# - 前の版は書き換えない。今いる方（在所）ごとに、2026-10-16 の「定期」の新しい版を足す（previous_id で前の版につなぐ）
#   入院中の方（前田 勝 様）・退所した方（坂本 茂 様）には足さない（退院したとき・作らない）
# - 段階と介助のやり方は、前の版の ADL の文章・麻痺・口腔の状態と合うように決めた（デモの架空の内容）
# - 食事の形は今の利用者の食事の形にそろえる（佐藤 太郎 様は 10/15 の職員会議から水分にとろみ）
# - ADL の文章（adl）は画面の保存と同じ形で作る（「移動: 見守り（…）。移乗: 自立。…」）
# 使い方: python add_adl_summaries.py data/portal_database.json （サーバーを止めてから。2回当てても同じ）
import sys, os, json

path = sys.argv[1]
d = json.load(open(path, encoding="utf-8-sig"))

ACTIONS = [("move", "移動"), ("transfer", "移乗"), ("eating", "食事"), ("excretion", "排泄"),
           ("bathing", "入浴"), ("dressing", "更衣"), ("grooming", "整容（歯みがき・洗面）")]
J, M, I, Z = "自立", "見守り", "一部介助", "全介助"
TOIRE = "声をかけてトイレへ誘導する"
# 利用者 id: {動作: (段階, 介助のやり方)}
ADL = {
    1: {"move": (M, "歩行器で歩く。右足に力が入りにくいので、横について見守る"), "transfer": (M, "立ち上がるときは歩行器を前に置いてから見守る"),
        "eating": (J, ""), "excretion": (M, TOIRE), "bathing": (I, "一般浴。浴槽をまたぐときに体を支え、背中と足先を洗うのを手伝う"),
        "dressing": (I, "ズボンをはくとき、右足を通すのを手伝う"), "grooming": (M, "歯みがきは自分で行う。毎食後、入れ歯を外して洗えているか確かめる")},
    2: {"move": (M, "杖で歩く。両膝が痛むので、そばで見守る"), "transfer": (M, "立ち上がりがゆっくりなので、手すりを持ってもらい見守る"),
        "eating": (J, ""), "excretion": (J, ""), "bathing": (I, "一般浴。浴槽の出入りは手すりを使ってもらい、体を支える"),
        "dressing": (J, ""), "grooming": (I, "歯みがきは声をかけると自分で行う。仕上げみがきを手伝う")},
    3: {"move": (Z, "車いすで移動。職員が押す"), "transfer": (Z, "体のこわばりが強いので、体を支えて移る"),
        "eating": (Z, "飲み込みを確かめながら、ひと口ずつ介助する"), "excretion": (Z, "おむつを使用。交換は介助"), "bathing": (Z, "機械浴"),
        "dressing": (Z, "体のこわばりが強いので、ゆっくり腕を通す"), "grooming": (Z, "入れ歯の出し入れと洗浄、食後の口の中の確認は職員が行う")},
    4: {"move": (J, "シルバーカーで歩く"), "transfer": (J, ""), "eating": (J, ""), "excretion": (J, ""),
        "bathing": (I, "一般浴。腰痛があるので、背中と足先を洗うのを手伝う"), "dressing": (J, ""), "grooming": (J, "")},
    5: {"move": (J, ""), "transfer": (J, ""), "eating": (J, ""), "excretion": (J, ""), "bathing": (M, "一般浴。浴室では見守る"), "dressing": (J, ""), "grooming": (J, "")},
    6: {"move": (M, "杖で歩く。そばで見守る"), "transfer": (M, "立ち上がるときに見守る"), "eating": (J, ""), "excretion": (M, TOIRE),
        "bathing": (I, "一般浴。右手が使いにくいので、体を洗うのを手伝う"), "dressing": (I, "右手のこまかい動きがしにくいので、ボタンを留めるのを手伝う"),
        "grooming": (I, "夜は入れ歯を外して洗浄液につけるのを手伝う")},
    7: {"move": (Z, "車いすで移動。職員が押す"), "transfer": (Z, "立つときは2人で介助する"), "eating": (I, "途中から介助する"),
        "excretion": (Z, "おむつを使用。交換は介助"), "bathing": (Z, "機械浴"), "dressing": (Z, "着替えは職員が行う。腕を通すときはゆっくり"),
        "grooming": (I, "食後、口の中に食べ物が残っていないか確かめ、歯みがきを手伝う")},
    8: {"move": (J, ""), "transfer": (J, ""), "eating": (J, ""), "excretion": (J, ""), "bathing": (M, "一般浴。浴室では見守る"), "dressing": (J, ""), "grooming": (J, "")},
    10: {"move": (M, "そばで見守って歩く。立ち上がり直後にふらつくので注意する"), "transfer": (M, "立ち上がったら少し待ってから歩き出してもらう"),
         "eating": (J, ""), "excretion": (M, TOIRE), "bathing": (I, "一般浴。浴槽から立つときに体を支える"),
         "dressing": (M, "座って着替えてもらい、見守る"), "grooming": (M, "歯みがきは自分で行う。入れ歯を洗えているか確かめる")},
    11: {"move": (J, ""), "transfer": (J, ""), "eating": (J, ""), "excretion": (J, ""), "bathing": (M, "一般浴。浴室では見守る"), "dressing": (J, ""), "grooming": (J, "")},
    13: {"move": (M, "歩行器で歩く。そばで見守る"), "transfer": (M, "立ち上がるときに見守る"), "eating": (J, ""), "excretion": (M, TOIRE),
         "bathing": (I, "一般浴。背中と足先を洗うのを手伝う"), "dressing": (M, "声をかけて見守る"), "grooming": (M, "入れ歯を洗えているか確かめる")},
    14: {"move": (J, ""), "transfer": (J, ""), "eating": (M, "ひと口の量が多くならないよう見守る"), "excretion": (J, ""),
         "bathing": (M, "一般浴。浴室では見守る"), "dressing": (J, ""), "grooming": (J, "")},
    15: {"move": (M, "杖で歩く。長く歩くと足がしびれるので、途中で休んでもらう"), "transfer": (J, ""), "eating": (J, ""), "excretion": (M, TOIRE),
         "bathing": (I, "一般浴。足先を洗うのを手伝う"), "dressing": (J, ""), "grooming": (J, "")},
    16: {"move": (I, "車いすで移動。こげるところは自分でこいでもらい、長い距離は職員が押す"), "transfer": (I, "移るときは体を支える"),
         "eating": (I, "途中から介助する"), "excretion": (I, "声をかけてトイレへ誘導し、便座に移るのを手伝う"),
         "bathing": (I, "一般浴。浴槽の出入りで体を支える"), "dressing": (I, "ズボンをはくときに立つのを支える"),
         "grooming": (M, "歯みがきは自分で行う。入れ歯を洗えているか確かめる")},
    17: {"move": (J, ""), "transfer": (J, ""), "eating": (J, ""), "excretion": (J, ""), "bathing": (M, "一般浴。浴室では見守る"), "dressing": (J, ""), "grooming": (J, "")},
    18: {"move": (J, ""), "transfer": (J, ""), "eating": (J, ""), "excretion": (J, ""), "bathing": (M, "一般浴。右膝が痛むので、浴槽の出入りを見守る"), "dressing": (J, ""), "grooming": (J, "")},
    19: {"move": (J, ""), "transfer": (J, ""), "eating": (J, ""), "excretion": (J, ""), "bathing": (M, "一般浴。浴室では見守る"), "dressing": (J, ""), "grooming": (J, "")},
}
CREATED = "2026-10-16 15:00"
BASE_ID = 1795800000000  # 時刻から作る番号の形にそろえる（いちばん大きい番号＋1 にしない）

R = {r["id"]: r for r in d["residents"]}
sums = d.setdefault("care_summaries", [])
ids = {s["id"] for s in sums}
added = 0
for rid, items in ADL.items():
    r = R.get(rid)
    if not r or r.get("status") != "在所":
        continue
    mine = sorted([s for s in sums if s.get("resident_id") == rid], key=lambda s: (str(s.get("created_at", ""))[:10], s["id"]))
    if not mine:
        continue
    latest = mine[-1]
    if latest.get("adl_items"):
        continue  # もう新しい書き方の版がある（2回当てても同じ）
    if str(latest.get("created_at", ""))[:10] >= CREATED[:10]:
        continue
    adl_items = [{"key": k, "action": name, "level": items[k][0], "method": items[k][1]} for k, name in ACTIONS]
    adl = "。".join(f"{it['action']}: {it['level']}" + (f"（{it['method']}）" if it["method"] else "") for it in adl_items) + "。"
    sid = BASE_ID + rid
    while sid in ids:
        sid += 100
    ids.add(sid)
    new = {k: v for k, v in latest.items() if k not in ("id", "previous_id", "created_at", "updated_at", "staff_name", "summary_type", "adl", "adl_items", "edit_history")}
    meals = str(latest.get("meals_hydration") or "")
    if meals.startswith("食事の形: "):
        rest = meals.split("。", 1)[1] if "。" in meals else ""
        meals = f"食事の形: {r.get('diet_type') or '未登録'}。" + rest
    new.update({"id": sid, "resident_id": rid, "summary_type": "定期", "created_at": CREATED, "updated_at": CREATED,
                "staff_name": "小林 恵子", "previous_id": latest["id"], "adl": adl, "adl_items": adl_items, "meals_hydration": meals})
    sums.insert(0, new)
    added += 1

if added and isinstance(d.get("_rev"), int):
    d["_rev"] += 1
tmp = path + ".tmp_write"
with open(tmp, "w", encoding="utf-8-sig", newline="") as f:
    f.write(json.dumps(d, ensure_ascii=False, separators=(",", ":")))
os.replace(tmp, path)
print("新しい書き方の版を足した:", added, "人")
