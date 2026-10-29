# -*- coding: utf-8 -*-
"""
tools/demo_year/add_cert_and_benefit_history_demo.py

要介護認定履歴 (care_cert_history) と 負担割合履歴 (benefit_rate_history) を
全19名の利用者に設定するデモ移行スクリプト。
田中 ハナ 様 (ID 2) には 2026年10月の区分変更（10/1〜10/14: 要介護2、10/15〜10/31: 要介護3、申請日 2026-10-15）を設定。
"""
import sys, os, json, hashlib

def migrate_database(db_path):
    with open(db_path, "r", encoding="utf-8-sig") as f:
        data = json.load(f)

    residents = data.get("residents", [])
    print(f"Total residents: {len(residents)}")

    for r in residents:
        rid = r.get("id")
        cur_level = r.get("care_level") or "要介護1"
        cur_start = r.get("care_start_date") or "2025-08-01"
        cur_end = r.get("care_expiry_date") or "2027-07-31"
        cur_rate = int(r.get("benefit_rate") or 90)

        # 1. benefit_rate_history (2期間: 2025-08〜2026-07 と 2026-08〜2027-07)
        r["benefit_rate_history"] = [
            {
                "id": 1,
                "rate": cur_rate,
                "start_ym": "2025-08",
                "end_ym": "2026-07",
                "note": "2025年度負担割合証",
                "created_by": "松本 陽子",
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
                "created_by": "松本 陽子",
                "created_at": "2026-07-25T10:00:00",
                "voided": False,
                "void_reason": ""
            }
        ]

        # 2. care_cert_history
        if rid == 2:
            # 田中 ハナ 様: 2026-10-15に要介護2から要介護3への区分変更
            # 従前認定: 2026-01-15〜2026-10-14 (要介護2)
            # 新認定(区分変更): 2026-10-15〜2028-01-14 (要介護3, 申請日 2026-10-15)
            r["care_cert_history"] = [
                {
                    "id": 1,
                    "level": "要介護2",
                    "start_date": "2026-01-15",
                    "end_date": "2026-10-14",
                    "kind": "更新",
                    "applied_date": "2025-12-10",
                    "created_by": "松本 陽子",
                    "created_at": "2026-01-10T11:00:00",
                    "voided": False,
                    "void_reason": ""
                },
                {
                    "id": 2,
                    "level": "要介護3",
                    "start_date": "2026-10-15",
                    "end_date": "2028-01-14",
                    "kind": "区分変更",
                    "applied_date": "2026-10-15",
                    "created_by": "松本 陽子",
                    "created_at": "2026-10-20T14:30:00",
                    "voided": False,
                    "void_reason": ""
                }
            ]
            # 最新の直接保持フィールドも現在の値（要介護3）に同期
            r["care_level"] = "要介護3"
            r["care_start_date"] = "2026-10-15"
            r["care_expiry_date"] = "2028-01-14"
        else:
            # その他の利用者: 現在の認定期間から1件
            r["care_cert_history"] = [
                {
                    "id": 1,
                    "level": cur_level,
                    "start_date": cur_start,
                    "end_date": cur_end,
                    "kind": "更新",
                    "applied_date": cur_start,
                    "created_by": "松本 陽子",
                    "created_at": f"{cur_start}T09:00:00",
                    "voided": False,
                    "void_reason": ""
                }
            ]

    # 書き出し (UTF-8 BOM付き)
    out_content = json.dumps(data, ensure_ascii=False, indent=2)
    with open(db_path, "wb") as f:
        f.write(b"\xef\xbb\xbf" + out_content.encode("utf-8"))

    with open(db_path, "rb") as f:
        new_md5 = hashlib.md5(f.read()).hexdigest()
    print(f"Migration completed. New MD5: {new_md5}")
    return new_md5

if __name__ == "__main__":
    path = sys.argv[1] if len(sys.argv) > 1 else r"data/portal_database.json"
    migrate_database(path)
