# -*- coding: utf-8 -*-
# デモの事業所に、届出の加算を入れる（2026-10-27）
# - いままでデモの「加算・減算の設定」は事業所番号などだけで、届出の加算が一つもなかった
# - デモの職員と利用者の内容から、満たしていると言える加算だけを入れる（くわしい理由は project の kasan_demo_explain_20261027.md）
#   医療連携体制加算（Ⅰ）イ   … 正看護師が常勤で2名（常勤換算1以上）
#   サービス提供体制強化加算（Ⅱ）… 介護職員15名のうち介護福祉士10名（66.7%。60%以上）
#   介護職員等処遇改善加算（Ⅰ）イ … キャリアパス要件Ⅴは提供体制（Ⅱ）で満たす。ほかの要件は満たしている想定
# - ほかの届出の加算は「届出なし」。科学的介護推進体制加算は LIFE の記録がデモにないので入れない
# - 届出の日はデモの仮の日付（開設の 2020-10-01 の前に届け出た想定）
# - 画面の保存と同じ形で、変更の履歴（edit_history と settings_logs）も残す
# 使い方: python set_demo_kasan.py data/portal_database.json （サーバーを止めてから。2回当てても同じ）
import sys, os, json

path = sys.argv[1]
d = json.load(open(path, encoding="utf-8-sig"))

TAISEI_IDS = ["night_support", "medical_coop", "medical_coop2", "dementia_care", "service_supply", "coop_hospital",
              "nutrition", "oral", "infection", "productivity", "life", "dementia_team"]
GENSAN_IDS = None  # 減算はさわらない（いまの値をそのまま残す）
NOTIFIED = "2020-09-15"
WANT_TAISEI = {"medical_coop": "1_a", "service_supply": "2"}
WANT_SHOGU = "1_a"
AT = "2026-10-27 10:00"
BY = "木村 健一"

cur = d.get("kasan_settings") or {}
cur_taisei = cur.get("taisei_items") or {}

def norm_taisei(raw):
    return {i: {"option_key": (raw.get(i) or {}).get("option_key", ""), "notified_date": (raw.get(i) or {}).get("notified_date", "")} for i in TAISEI_IDS}

next_taisei = {i: ({"option_key": WANT_TAISEI[i], "notified_date": NOTIFIED} if i in WANT_TAISEI else {"option_key": "none", "notified_date": ""}) for i in TAISEI_IDS}

already = cur.get("shogu_type") == WANT_SHOGU and all(
    (cur_taisei.get(i) or {}).get("option_key") == v["option_key"] for i, v in next_taisei.items() if v["option_key"] != "none") and all(
    (cur_taisei.get(i) or {}).get("option_key", "none") in ("", "none") for i, v in next_taisei.items() if v["option_key"] == "none")

if already:
    print("もう入っている。なにもしない")
    sys.exit(0)

def cap(v):
    return int(v) if v not in ("", None) else ""

before = {
    "office_no": cur.get("office_no", ""), "media_code": cur.get("media_code", ""), "region_type": cur.get("region_type", ""),
    "capacity": cap(cur.get("capacity", "")), "shogu_type": cur.get("shogu_type", ""),
    "careplan_link": cur.get("careplan_link", ""), "careplan_link_pledged_date": cur.get("careplan_link_pledged_date", ""),
    "productivity_pledge": cur.get("productivity_pledge", ""), "productivity_pledged_date": cur.get("productivity_pledged_date", ""),
    "social_welfare": cur.get("social_welfare", ""), "social_welfare_pledged_date": cur.get("social_welfare_pledged_date", ""),
    "taisei_items": norm_taisei(cur_taisei),
    "gensan_items": cur.get("gensan_items") or {},
}

new = dict(cur)
new["shogu_type"] = WANT_SHOGU
new["taisei_items"] = next_taisei
for k, v in (("careplan_link", ""), ("careplan_link_pledged_date", ""), ("productivity_pledge", ""), ("productivity_pledged_date", ""),
             ("social_welfare", ""), ("social_welfare_pledged_date", ""), ("night_shortage", {}), ("capacity_excess", {}),
             ("staff_shortage", []), ("gensan_items", {}), ("committee_rules", []), ("edit_history", [])):
    new.setdefault(k, v)

detail = f"事業所番号: {new.get('office_no') or '未設定'}、媒体区分: {new.get('media_code') or '未設定'}、地域区分: {new.get('region_type') or '未設定'}、届出加算・減算更新"
LOG_ID = 1793000000000  # 2026-10-27 ごろの時刻の番号
new["edit_history"] = [{"id": LOG_ID, "at": AT, "by": BY, "detail": detail, "before": before}] + list(new["edit_history"])
d["kasan_settings"] = new
logs = d.setdefault("settings_logs", [])
logs.append({"id": LOG_ID, "at": AT, "by": BY, "kind": "加算・減算設定", "action": "変更", "detail": detail})

if isinstance(d.get("_rev"), int):
    d["_rev"] += 1
tmp = path + ".tmp_write"
with open(tmp, "w", encoding="utf-8-sig", newline="") as f:
    f.write(json.dumps(d, ensure_ascii=False, separators=(",", ":")))
os.replace(tmp, path)
print("届出の加算を入れた: 医療連携（Ⅰ）イ・提供体制（Ⅱ）・処遇改善（Ⅰ）イ")
