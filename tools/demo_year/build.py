# 1年分デモ: 今のデモ（職員・在庫などの設定）をもとに、利用者と記録を作り直して portal_database.json を作る
import json, sys, os, datetime as DT
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import roster, gen_daily

SRC = sys.argv[1] if len(sys.argv) > 1 else "/home/claude/dbwork/orig.json"
DST = sys.argv[2] if len(sys.argv) > 2 else "/home/claude/demo/demo_year.json"
d = json.load(open(SRC, encoding="utf-8-sig"))
END = gen_daily.END

# ---- 区分 ----
d["units"] = [{"id": 1, "name": "東棟", "order": 1}, {"id": 2, "name": "西棟", "order": 2}]
d["unit_logs"] = []

# ---- 利用者 ----
KEEP = ["id", "room_no", "unit_id", "name", "care_level", "birth_date", "admission_date", "policy_stamp", "emergency_contact",
        "family_wishes", "life_history", "diseases", "paralysis", "allergies", "diet_type", "oral_state", "dr_instructions",
        "care_plan_goal", "sensor_alert", "bp_high_max", "bp_high_min", "temp_max", "spo2_min", "pulse_max", "pulse_min"]
res = []
for r in roster.R:
    x = {k: r[k] for k in KEEP}
    x["status"] = "在所"
    x["deposit_balance"] = 0
    # 次の受診日・認定の期限（今日より先）
    x["next_clinic_date"] = (END + DT.timedelta(days=[5, 9, 20, 26, 33, 40][r["id"] % 6])).isoformat()
    x["care_expiry_date"] = (DT.date(2026, 11, 1) + DT.timedelta(days=37 * (r["id"] % 9))).isoformat()
    x["clinic_special_notes"] = ""
    res.append(x)
for h in roster.HOSP:
    if h["end"] is None:
        x = next(a for a in res if a["id"] == h["rid"])
        x["status"] = "入院中"; x["hospital_date"] = h["start"]; x["hospital_name"] = h["hospital"]; x["hospital_reason"] = h["reason"]
for dc in roster.DISCHARGE:
    x = next(a for a in res if a["id"] == dc["rid"])
    x["status_before_discharge"] = "在所"; x["status"] = "退所"
    x["discharge_date"] = dc["date"]; x["discharge_reason"] = dc["reason"]; x["discharge_note"] = dc["note"]
    x["discharged_at"] = dc["date"] + " 10:00"; x["discharged_by"] = "木村 健一"
d["residents"] = res
d["settings_logs"] = [{"id": 1790000000001, "at": "2026-03-14 10:00", "by": "木村 健一", "kind": "利用者の移動・退所", "action": "退所の手続き",
                       "detail": "坂本 茂 様（203号室）：2026-03-14 死亡退所（ホームでの看取り。ご家族に見守られ穏やかに。）"}]

# ---- 処方薬・目薬・塗り薬の場所 ----
meds = []; mid = 1
for r in roster.R:
    adm = r["admission_date"]
    since = max(adm, "2025-09-01")
    for (name, unit, tim, prn, purpose) in r["rx"]:
        m = {"id": mid, "resident_id": r["id"], "name": name, "unit": unit, "status": "服用中",
             "timings": [{"key": k, "count": c} for k, c in tim.items()], "purpose": purpose,
             "source_type": "処方箋", "source_detail": f"{since} の処方箋", "added_at": f"{since} 11:00", "added_by": "鈴木 美智子", "edit_history": []}
        if prn: m["prn"] = {"count": prn[0], "when": prn[1]}
        if r["id"] in [dc["rid"] for dc in roster.DISCHARGE]: m["status"] = "中止"
        meds.append(m); mid += 1
d["resident_medications"] = meds
eo = []; eid = 1
for r in roster.R:
    for (mname, eye, slots, dose, doc, why) in r.get("eye", []):
        eo.append({"id": eid, "resident_id": r["id"], "eye": eye, "medicine_name": mname, "timing_slots": slots, "dosage": dose,
                   "doctor_name": doc, "notes": why, "status": "継続中", "updated_at": max(r["admission_date"], "2025-09-01")}); eid += 1
d["eyedrop_orders"] = eo
POS = {"両膝": (22.0, 72.0), "右膝": (19.0, 72.0), "腰": (75.0, 47.0), "両下腿・背中": (75.0, 32.0), "仙骨部": (75.0, 52.0),
       "仙骨部・かかと": (75.0, 52.0), "両足": (25.0, 92.0)}
pins = []
for r in roster.R:
    for pi, (cat, site, item, freq) in enumerate(r.get("topical", [])):
        x, y = POS.get(site, (25.0, 50.0))
        pins.append({"id": r["id"] * 100 + pi + 1, "resident_id": r["id"], "pin_no": pi + 1, "category": {"湿布": "湿布", "保湿": "軟膏塗布", "保護": "軟膏塗布"}[cat],
                     "site_name": site, "item_name": item, "frequency": freq, "status": "終了" if r["id"] in [dc["rid"] for dc in roster.DISCHARGE] else "継続中",
                     "notes": "", "doctor_name": "ひだまり内科クリニック", "x_pct": x, "y_pct": y,
                     "created_at": max(r["admission_date"], "2025-09-01") + " 10:00", "updated_at": max(r["admission_date"], "2025-09-01") + " 10:00", "staff_name": "鈴木 美智子"})
d["body_schema_pins"] = pins

# ---- 毎日の記録 ----
daily = gen_daily.generate()
for k, v in daily.items():
    d[k] = v

# 古い見本の、利用者に結びついた記録は消す（作り直したので）
for k in ["belongings", "equipments", "photos", "prescriptions", "care_summaries", "incidents", "visitations", "consumptions", "deposits",
          "notebook_stamps", "inventory_logs", "complaints"]:
    if k in d and isinstance(d[k], list): d[k] = []
d["dismissed_alerts"] = {}
import gen_facility
fac = gen_facility.generate()
d["care_records"].extend(fac.pop("care_records_extra"))
for k, v in fac.items(): d[k] = v
for x in d["residents"]:
    dep = [p for p in d["deposits"] if p["resident_id"] == x["id"]]
    x["deposit_balance"] = dep[-1]["balance"] if dep else 0

# 勤務表（記録を書いた職員と同じ。2026-11 から先の予定はそのまま）
ms = d.get("monthly_shifts") or {}
for ym, v in gen_daily.monthly_shifts().items(): ms[ym] = v
d["monthly_shifts"] = ms
d["_rev"] = int(d.get("_rev", 0)) + 1000
json.dump(d, open(DST, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print("written", DST, os.path.getsize(DST) // 1024, "KB")
