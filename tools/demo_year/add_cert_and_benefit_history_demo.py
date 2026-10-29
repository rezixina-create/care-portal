# -*- coding: utf-8 -*-
"""
tools/demo_year/add_cert_and_benefit_history_demo.py

要介護認定履歴 (care_cert_history) と 負担割合履歴 (benefit_rate_history) を
全19名の利用者に設定するデモ移行スクリプト。
・19名全員について、入所日（または 2025-10-01）から現在の認定期間の前日までを覆う過去の認定期間を付加。
・田中 ハナ 様 (ID 2) の区分変更新認定期間は法令の原則どおり6か月（2026-10-15〜2027-04-14）に設定。
・書き出しは extend_demo.py と同一の json.dumps(..., separators=(',', ':')) + utf-8-sig (1行形式)。
"""
import sys, os, json, hashlib
from datetime import datetime, date, timedelta

def shift_years(d, years):
    try:
        return date(d.year + years, d.month, d.day)
    except ValueError:
        return date(d.year + years, d.month, d.day - 1)

def migrate_database(db_path):
    with open(db_path, "r", encoding="utf-8-sig") as f:
        data = json.load(f)

    residents = data.get("residents", [])
    print(f"Total residents: {len(residents)}")

    clerk_name = "松本 陽子"

    for r in residents:
        rid = r.get("id")
        cur_level = r.get("care_level") or "要介護1"
        cur_start_str = r.get("care_start_date") or "2025-08-01"
        cur_end_str = r.get("care_expiry_date") or "2027-07-31"
        cur_rate = int(r.get("benefit_rate") or 90)

        # 1. benefit_rate_history (2期間: 2025-08〜2026-07 と 2026-08〜2027-07)
        r["benefit_rate_history"] = [
            {
                "id": 1,
                "rate": cur_rate,
                "start_ym": "2025-08",
                "end_ym": "2026-07",
                "note": "2025年度負担割合証",
                "created_by": clerk_name,
                "created_at": "2025-08-01T09:00:00",
                "voided": False,
                "void_reason": ""
            },
            {
                "id": 2,
                "rate": cur_rate,
                "start_ym": "2026-08",
                "end_ym": "2027-07",
                "note": "2026年度負担割合証（年次更新）",
                "created_by": clerk_name,
                "created_at": "2026-07-25T10:00:00",
                "voided": False,
                "void_reason": ""
            }
        ]

        # 過去の認定期間の計算
        cur_start_d = datetime.strptime(cur_start_str, "%Y-%m-%d").date()
        cur_end_d = datetime.strptime(cur_end_str, "%Y-%m-%d").date()
        days_span = (cur_end_d - cur_start_d).days
        years_back = 2 if days_span > 400 else 1

        prev_end_d = cur_start_d - timedelta(days=1)
        prev_start_d = shift_years(cur_start_d, -years_back)
        prev_start_str = prev_start_d.strftime("%Y-%m-%d")
        prev_end_str = prev_end_d.strftime("%Y-%m-%d")

        # 2. care_cert_history
        if rid == 2:
            # 田中 ハナ 様:
            # 認定1 (過去更新): 2024-01-15〜2026-01-14 (要介護2)
            # 認定2 (直近更新): 2026-01-15〜2026-10-14 (要介護2, 区分変更により短縮, original_end_date: 2028-01-14)
            # 認定3 (区分変更): 2026-10-15〜2027-04-14 (要介護3, 法令原則の6か月)
            r["care_cert_history"] = [
                {
                    "id": 1,
                    "level": "要介護2",
                    "start_date": "2024-01-15",
                    "end_date": "2026-01-14",
                    "kind": "更新",
                    "applied_date": "2023-12-10",
                    "created_by": clerk_name,
                    "created_at": "2024-01-10T10:00:00",
                    "voided": False,
                    "void_reason": ""
                },
                {
                    "id": 2,
                    "level": "要介護2",
                    "start_date": "2026-01-15",
                    "end_date": "2026-10-14",
                    "original_end_date": "2028-01-14",
                    "kind": "更新",
                    "applied_date": "2025-12-10",
                    "created_by": clerk_name,
                    "created_at": "2026-01-10T11:00:00",
                    "modified_by": clerk_name,
                    "modified_at": "2026-10-20T14:30:00",
                    "modified_reason": "区分変更(開始日:2026-10-15)による期間短縮",
                    "voided": False,
                    "void_reason": ""
                },
                {
                    "id": 3,
                    "level": "要介護3",
                    "start_date": "2026-10-15",
                    "end_date": "2027-04-14",
                    "kind": "区分変更",
                    "applied_date": "2026-10-15",
                    "created_by": clerk_name,
                    "created_at": "2026-10-20T14:30:00",
                    "voided": False,
                    "void_reason": ""
                }
            ]
            # 2026-10-15時点の直接保持フィールド同期（要介護3, 2026-10-15〜2027-04-14）
            r["care_level"] = "要介護3"
            r["care_start_date"] = "2026-10-15"
            r["care_expiry_date"] = "2027-04-14"
        else:
            # その他の18名: 過去の認定期間(id:1) + 現在の認定期間(id:2)
            r["care_cert_history"] = [
                {
                    "id": 1,
                    "level": cur_level,
                    "start_date": prev_start_str,
                    "end_date": prev_end_str,
                    "kind": "更新",
                    "applied_date": prev_start_str,
                    "created_by": clerk_name,
                    "created_at": f"{prev_start_str}T09:00:00",
                    "voided": False,
                    "void_reason": ""
                },
                {
                    "id": 2,
                    "level": cur_level,
                    "start_date": cur_start_str,
                    "end_date": cur_end_str,
                    "kind": "更新",
                    "applied_date": cur_start_str,
                    "created_by": clerk_name,
                    "created_at": f"{cur_start_str}T09:00:00",
                    "voided": False,
                    "void_reason": ""
                }
            ]

    # 書き出し (UTF-8 BOM付き, 1行形式 separators=(',', ':'))
    tmp_path = db_path + ".tmp_write"
    with open(tmp_path, "w", encoding="utf-8-sig", newline="") as f:
        f.write(json.dumps(data, ensure_ascii=False, separators=(",", ":")))
    os.replace(tmp_path, db_path)

    with open(db_path, "rb") as f:
        new_md5 = hashlib.md5(f.read()).hexdigest()
    print(f"Migration completed. New MD5: {new_md5}")
    return new_md5

if __name__ == "__main__":
    path = sys.argv[1] if len(sys.argv) > 1 else r"data/portal_database.json"
    migrate_database(path)
