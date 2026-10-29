# -*- coding: utf-8 -*-
# デモデータに事故報告書の受傷ピン（injury_pins）および関連経過記録・申し送りを足すツール (2026-10-29)
# 使い方: python tools/demo_year/add_incident_pin_demo.py data/portal_database.json
# ※ サーバーを止めてから実行。2回当てても増えない（等冪性確保）。

import sys, os, json

def main():
    if len(sys.argv) < 2:
        print("使用法: python add_incident_pin_demo.py <path/to/portal_database.json>")
        sys.exit(1)

    target_path = sys.argv[1]
    if not os.path.exists(target_path):
        print(f"エラー: 指定されたファイルが存在しません: {target_path}")
        sys.exit(1)

    with open(target_path, "r", encoding="utf-8-sig") as f:
        d = json.load(f)

    # 既存のすべての整数IDを収集して重複のないIDを採番
    all_int_ids = []
    for k, v in d.items():
        if isinstance(v, list):
            for item in v:
                if isinstance(item, dict) and isinstance(item.get("id"), int):
                    all_int_ids.append(item["id"])
        elif isinstance(v, dict):
            for k2, v2 in v.items():
                if isinstance(v2, list):
                    for item in v2:
                        if isinstance(item, dict) and isinstance(item.get("id"), int):
                            all_int_ids.append(item["id"])

    cur_id = max(all_int_ids, default=1796000000000)
    def nid():
        nonlocal cur_id
        cur_id += 1
        return cur_id

    incidents = d.setdefault("incidents", [])
    care_records = d.setdefault("care_records", [])
    notebooks = d.setdefault("notebooks", [])
    mod_count = 0

    # ----------------------------------------------------
    # 1. 既存の 2025-12-03 事故報告書（104号 中島 正雄 様、resident_id: 6）に受傷ピン追加
    # ----------------------------------------------------
    inc1 = next((inc for inc in incidents if inc.get("resident_id") == 6 and (inc.get("occurred_at") or "").startswith("2025-12-03")), None)
    pins_added_1 = 0
    if inc1:
        if not inc1.get("injury_pins"):
            inc1["injury_pins"] = [{
                "id": nid(),
                "site_name": "右の脚の付け根",
                "injury_type": "骨折疑い",
                "severity": "受診・医師精査要",
                "treatment": "主治医の指示で救急搬送",
                "notes": "",
                "x_pct": 22.0,
                "y_pct": 55.0
            }]
            pins_added_1 += 1

    # ----------------------------------------------------
    # 2. 新規事故報告書 a: 2026-09-14 14:10 105号 小川 フミ 様 (resident_id: 7)
    # ----------------------------------------------------
    inc2 = next((inc for inc in incidents if inc.get("resident_id") == 7 and (inc.get("occurred_at") or "").startswith("2026-09-14")), None)
    inc2_added = 0
    if not inc2:
        inc2 = {
            "id": nid(),
            "report_type": "事故報告書",
            "occurred_at": "2026-09-14 14:10",
            "resident_id": 7,
            "place": "浴室 (脱衣所)",
            "situation": "入浴前の更衣で左の前腕に3cmほどの紫色の内出血を見つけた。痛みの訴えはない。前の日までにぶつけた記録はない。看護師が確認し、経過を見る。",
            "cause": "【本人】皮膚が薄い\n【ケア】移乗のときに腕を持って支えた可能性。",
            "prevention": "1. 移乗のときは腕をつかまず体を支える。\n2. 入浴・更衣のときに皮膚を確かめる。",
            "supervisor_comment": "発見後の看護師への連携と皮膚観察は迅速に行われた。移乗介助時の支持方法について全職員で徹底すること。（管理者：木村 健一）",
            "status": "承認済",
            "staff_name": "松田 健二",
            "injury_pins": [
                {
                    "id": nid(),
                    "site_name": "左の前腕",
                    "injury_type": "皮下出血 (内出血・紫斑)",
                    "severity": "要観察 (経過観察中)",
                    "treatment": "看護師が確認し、経過観察",
                    "notes": "",
                    "x_pct": 35.0,
                    "y_pct": 43.0
                }
            ]
        }
        incidents.append(inc2)
        inc2_added += 1
    else:
        # ピン座標の更新（手・腕の外側から内側へ）
        for pin in inc2.get("injury_pins", []):
            if pin.get("site_name") == "左の前腕":
                if pin.get("x_pct") != 35.0 or pin.get("y_pct") != 43.0:
                    pin["x_pct"] = 35.0
                    pin["y_pct"] = 43.0
                    mod_count += 1

    # 2026-09-14 経過記録（care_records）
    # ※ 14:30 の「入浴（個別浴）実施」は実際の入浴記録（特浴・機械浴・14:26）と合わないため除去
    old_cr_len = len(care_records)
    care_records[:] = [cr for cr in care_records if not (cr.get("resident_id") == 7 and cr.get("recorded_at") == "2026-09-14 14:30")]
    if len(care_records) != old_cr_len:
        mod_count += 1

    cr2_needed = [
        {
            "resident_id": 7,
            "category": "特変",
            "recorded_at": "2026-09-14 14:10",
            "staff_name": "松田 健二",
            "content": "入浴前の更衣時、左の前腕に約3cmの紫色内出血を発見。ご本人は痛みなしと話される。看護師へ連絡。"
        },
        {
            "resident_id": 7,
            "category": "看護",
            "recorded_at": "2026-09-14 14:15",
            "staff_name": "加藤 由美",
            "content": "松田介護職員より連絡を受け患部を確認。左前腕に約3cmの内出血を確認。経過を見る。"
        }
    ]
    cr_added = 0
    for cr in cr2_needed:
        existing_cr = next((x for x in care_records if x.get("resident_id") == cr["resident_id"] and x.get("recorded_at") == cr["recorded_at"] and x.get("category") == cr["category"]), None)
        if not existing_cr:
            cr_copy = dict(cr)
            cr_copy["id"] = nid()
            care_records.append(cr_copy)
            cr_added += 1
        else:
            if existing_cr.get("content") != cr["content"]:
                existing_cr["content"] = cr["content"]
                mod_count += 1

    # Clean up / migrate misassigned resident_id 14 on 2026-10-21 (森 ヨシエ 様 は resident_id: 13, 204号)
    for inc in incidents:
        if inc.get("resident_id") == 14 and (inc.get("occurred_at") or "").startswith("2026-10-21"):
            inc["resident_id"] = 13
            mod_count += 1
    for cr in care_records:
        if cr.get("resident_id") == 14 and (cr.get("recorded_at") or "").startswith("2026-10-21 14:"):
            cr["resident_id"] = 13
            mod_count += 1

    # ----------------------------------------------------
    # 3. 新規事故報告書 b: 2026-10-21 14:20 204号 森 ヨシエ 様 (resident_id: 13)
    # ----------------------------------------------------
    target_supervisor_comment = "転倒後の看護師処置、家族への報告は適切に行われた。再発防止のため歩行器の確認と見守り動線を改善すること。（管理者：木村 健一）"
    inc3 = next((inc for inc in incidents if inc.get("resident_id") == 13 and (inc.get("occurred_at") or "").startswith("2026-10-21")), None)
    inc3_added = 0
    if not inc3:
        inc3 = {
            "id": nid(),
            "report_type": "事故報告書",
            "occurred_at": "2026-10-21 14:20",
            "resident_id": 13,
            "place": "廊下",
            "situation": "トイレから居室へ戻るとき、歩行器から手が離れて前に転んだ。右の膝をすりむき、左の肘を床に打った。頭は打っていないと話される。看護師が膝の傷を洗ってガーゼで保護。家族へ電話で報告。",
            "cause": "【本人】急いで戻ろうとした\n【ケア】トイレからの帰りの見守りが離れていた。",
            "prevention": "1. トイレの行き帰りはそばで見守る。\n2. 歩行器のブレーキと持ち手を確かめてから歩き出してもらう。",
            "supervisor_comment": target_supervisor_comment,
            "status": "承認済",
            "staff_name": "斉藤 翼",
            "injury_pins": [
                {
                    "id": nid(),
                    "site_name": "右の膝",
                    "injury_type": "擦過傷 (すり傷)",
                    "severity": "施設内処置完了",
                    "treatment": "看護師が洗ってガーゼで保護",
                    "notes": "",
                    "x_pct": 23.0,
                    "y_pct": 75.0
                },
                {
                    "id": nid(),
                    "site_name": "左の肘",
                    "injury_type": "打撲 (たんこぶ・腫れ)",
                    "severity": "要観察 (経過観察中)",
                    "treatment": "",
                    "notes": "",
                    "x_pct": 65.0,
                    "y_pct": 41.0
                }
            ]
        }
        incidents.append(inc3)
        inc3_added += 1
    else:
        if inc3.get("supervisor_comment") != target_supervisor_comment:
            inc3["supervisor_comment"] = target_supervisor_comment
            mod_count += 1
        for pin in inc3.get("injury_pins", []):
            if pin.get("site_name") == "右の膝":
                if pin.get("x_pct") != 23.0 or pin.get("y_pct") != 75.0:
                    pin["x_pct"] = 23.0
                    pin["y_pct"] = 75.0
                    mod_count += 1
            elif pin.get("site_name") == "左の肘":
                if pin.get("x_pct") != 65.0 or pin.get("y_pct") != 41.0:
                    pin["x_pct"] = 65.0
                    pin["y_pct"] = 41.0
                    mod_count += 1

    # 2026-10-21 経過記録（care_records）
    cr3_needed = [
        {
            "resident_id": 13,
            "category": "特変",
            "recorded_at": "2026-10-21 14:20",
            "staff_name": "斉藤 翼",
            "content": "トイレから居室への移動中、歩行器から手が離れ前方に転倒。右膝にすり傷、左肘を床に強打。頭部打撲なし。直ちに看護師へ連絡。"
        },
        {
            "resident_id": 13,
            "category": "看護",
            "recorded_at": "2026-10-21 14:25",
            "staff_name": "加藤 由美",
            "content": "転倒の連絡を受け訪室。意識清明、頭部強打なし。右膝のすり傷を洗ってガーゼで保護。左肘に赤みあり。経過を見る。"
        },
        {
            "resident_id": 13,
            "category": "家族",
            "recorded_at": "2026-10-21 14:40",
            "staff_name": "佐々木 浩二",
            "content": "長女様へ電話。廊下での転倒状況、右膝の処置および左肘の経過観察について報告。了承いただく。"
        }
    ]
    for cr in cr3_needed:
        existing_cr = next((x for x in care_records if x.get("resident_id") == cr["resident_id"] and x.get("recorded_at") == cr["recorded_at"] and x.get("category") == cr["category"]), None)
        if not existing_cr:
            cr_copy = dict(cr)
            cr_copy["id"] = nid()
            care_records.append(cr_copy)
            cr_added += 1
        else:
            if existing_cr.get("content") != cr["content"]:
                existing_cr["content"] = cr["content"]
                mod_count += 1

    # 2026-10-21 申し送り（notebooks）
    target_nb_content = "森ヨシエ様（204号）：14:20頃廊下にて転倒。右膝すり傷（ガーゼ処置済）、左肘打撲（経過観察）。頭部強打なし、ご家族へ連絡済。夜勤帯も患部の腫れや痛みの訴えに留意願います。"
    existing_nb = next((nb for nb in notebooks if nb.get("date") == "2026-10-21" and "森ヨシエ様" in nb.get("content", "")), None)
    nb_added = 0
    if not existing_nb:
        notebooks.append({
            "id": nid(),
            "date": "2026-10-21",
            "category": "申し送り",
            "content": target_nb_content,
            "status": "完了",
            "staff_name": "斉藤 翼",
            "resolved_staff": "斉藤 翼",
            "confirmed_staff": ["加藤 由美", "佐々木 浩二", "木村 健一"],
            "confirmed_versions": {
                "加藤 由美": "2026-10-21 15:00",
                "佐々木 浩二": "2026-10-21 15:30",
                "木村 健一": "2026-10-21 16:00"
            }
        })
        nb_added += 1
    else:
        if existing_nb.get("content") != target_nb_content:
            existing_nb["content"] = target_nb_content
            mod_count += 1

    incidents.sort(key=lambda x: (x.get("occurred_at") or "", x.get("id") or 0))
    care_records.sort(key=lambda x: (x.get("recorded_at") or "", x.get("id") or 0))

    total_changes = pins_added_1 + inc2_added + inc3_added + cr_added + nb_added + mod_count
    if total_changes > 0:
        if isinstance(d.get("_rev"), int):
            d["_rev"] += 1
        tmp = target_path + ".tmp_write"
        with open(tmp, "w", encoding="utf-8-sig", newline="") as f:
            f.write(json.dumps(d, ensure_ascii=False, separators=(",", ":")))
        os.replace(tmp, target_path)

    print(f"[{os.path.basename(target_path)}] 完了:")
    print(f"  2025-12-03事故報告書 受傷ピン追加: {pins_added_1} 件")
    print(f"  新規事故報告書: {inc2_added + inc3_added} 件 (合計: {len(incidents)} 件)")
    print(f"  経過記録追加: {cr_added} 件")
    print(f"  申し送り追加: {nb_added} 件")
    print(f"  既存レコード更新・修正: {mod_count} 件")

if __name__ == "__main__":
    main()
