# -*- coding: utf-8 -*-
# デモデータに委員会・研修・訓練・運営推進会議、自己評価・外部評価、職員の健康診断を足すツール (2026-10-29)
# 使い方: python tools/demo_year/add_committee_demo.py data/portal_database.json
# ※ サーバーを止めてから実行。2回当てても増えない（等冪性確保）。

import sys, os, json

def main():
    if len(sys.argv) < 2:
        print("使用法: python add_committee_demo.py <path/to/portal_database.json>")
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

    ms = d.get("monthly_shifts", {})

    def get_working_staff(dt_str):
        ym = dt_str[:7]
        day = str(int(dt_str[8:10]))
        shifts = ms.get(ym, {})
        working = []
        for staff, days in shifts.items():
            if days.get(day) in ("日", "早", "遅"):
                working.append(staff)
        return working

    def build_attendees(dt_str, is_promotion=False):
        working = get_working_staff(dt_str)
        prio_mgmt = ["木村 健一", "佐々木 浩二", "小林 恵子", "鈴木 美智子", "加藤 由美"]
        selected_mgmt = [s for s in prio_mgmt if s in working][:4]
        selected_care = [s for s in working if s not in prio_mgmt][:3]
        facility_attendees = selected_mgmt + selected_care
        if is_promotion:
            return "、".join(facility_attendees) + "、利用者のご家族、地域の方（自治会）、地域包括支援センターの職員"
        else:
            return "、".join(facility_attendees)

    # ----------------------------------------------------
    # 1. 既存の13件の委員会記録に合う item_key を付与
    # ----------------------------------------------------
    ITEM_KEY_MAP = {
        "身体拘束適正化委員会": "restraint_committee",
        "感染症対策委員会": "infection_committee",
        "虐待防止委員会": "abuse_committee",
        "虐待防止研修": "abuse_training",
    }
    committees = d.setdefault("committees", [])
    updated_existing = 0
    for c in committees:
        if not c.get("item_key"):
            name = c.get("committee_name", "")
            key = ITEM_KEY_MAP.get(name, "other")
            c["item_key"] = key
            updated_existing += 1

    # ----------------------------------------------------
    # 2. 委員会・研修・訓練・運営推進会議の記録を追加
    # ----------------------------------------------------
    NEW_COMMITTEE_RECORDS = [
        # 2025年度（2025-10〜2026-03の後半）
        {
            "date": "2025-11-20",
            "category": "施設内研修",
            "committee_name": "身体拘束廃止・適正化研修",
            "item_key": "restraint_training",
            "agenda": "身体拘束の定義とスピーチロックの防止",
            "content": "身体拘束廃止の基本理念とスピーチロックへの気づきを深めた。利用者の行動を否定せず受容する言葉がけの重要性を共有。"
        },
        {
            "date": "2025-12-11",
            "category": "施設内研修",
            "committee_name": "虐待防止研修",
            "item_key": "abuse_training",
            "agenda": "権利擁護と高齢者虐待防止の基本姿勢",
            "content": "虐待の芽を見逃さない職場環境づくりについて協議。職員間の声かけとチームでの見守り体制を確認した。"
        },
        {
            "date": "2025-12-18",
            "category": "会議",
            "committee_name": "運営推進会議",
            "item_key": "promotion_meeting",
            "agenda": "施設運営状況の報告及び冬期の感染症対策について",
            "content": "入居状況・日中活動の報告を実施。冬期の換気や加湿の工夫、面会時の感染対策について地域・ご家族からご意見をいただき協議した。"
        },
        {
            "date": "2026-01-22",
            "category": "施設内研修",
            "committee_name": "感染対策研修",
            "item_key": "infection_training",
            "agenda": "ノロウイルス等感染症発生時の初動対応",
            "content": "吐瀉物処理の手順と次亜塩素酸ナトリウムの希釈方法を再確認。汚染拡大を防ぐための動線確保について共有した。"
        },
        {
            "date": "2026-01-29",
            "category": "訓練",
            "committee_name": "感染症対策訓練",
            "item_key": "infection_drill",
            "agenda": "居室での吐瀉物処理実技訓練",
            "content": "食堂および居室を想定した防護具（PPE）の着脱と吐瀉物処理の実技訓練を実施。手順に沿って安全に処理できることを確認した。"
        },
        {
            "date": "2026-02-19",
            "category": "会議",
            "committee_name": "運営推進会議",
            "item_key": "promotion_meeting",
            "agenda": "今年度自己評価結果の報告及び外部評価の実施について",
            "content": "事業所内での自己評価結果を報告。運営推進会議を活用した評価を行い、出席者からケアの質や安全管理について評価と助言をいただいた。"
        },
        {
            "date": "2026-02-26",
            "category": "施設内研修",
            "committee_name": "業務継続計画（BCP）研修",
            "item_key": "bcp_training",
            "agenda": "災害時・感染症まん延時の業務継続計画（BCP）の理解",
            "content": "非常時の優先業務の選定と安否確認手順を確認。職員の初動対応と備蓄品の配置場所について再共有した。"
        },
        {
            "date": "2026-03-12",
            "category": "訓練",
            "committee_name": "業務継続計画（BCP）訓練",
            "item_key": "bcp_drill",
            "agenda": "地震発生時の情報伝達・初動対応訓練",
            "content": "震度6弱の地震を想定し、利用者の安全確保、火気点検、非常用電源の立ち上げ、職員間の情報共有訓練を実施した。"
        },
        # 2026年度（2026-04〜2026-10-28）
        {
            "date": "2026-04-16",
            "category": "会議",
            "committee_name": "運営推進会議",
            "item_key": "promotion_meeting",
            "agenda": "新年度の運営方針及び行事計画について",
            "content": "新年度の職員体制、年間行事予定、防災訓練計画を説明。地域の春祭りへの参加協力について自治会役員と意見交換を行った。"
        },
        {
            "date": "2026-05-21",
            "category": "施設内研修",
            "committee_name": "身体拘束廃止・適正化研修",
            "item_key": "restraint_training",
            "agenda": "不穏・離設行動へのアセスメントとケアの工夫",
            "content": "行動の背景にある不安や環境要因をアセスメントし、拘束に頼らない環境調整と声かけの具体例をグループで検討した。"
        },
        {
            "date": "2026-06-18",
            "category": "会議",
            "committee_name": "運営推進会議",
            "item_key": "promotion_meeting",
            "agenda": "入居者の健康管理及び熱中症予防の取り組み",
            "content": "最近の利用者の生活の様子を報告。夏期の水分補給や空調管理の工夫について報告し、ご家族から生活面の相談をいただいた。"
        },
        {
            "date": "2026-06-25",
            "category": "施設内研修",
            "committee_name": "感染対策研修",
            "item_key": "infection_training",
            "agenda": "標準予防策（スタンダードプリコーション）の徹底",
            "content": "手洗いのタイミング（1ケア1手洗い）と手指消毒液の適切な使用量を実演を交えて確認。手指衛生の徹底を図った。"
        },
        {
            "date": "2026-07-23",
            "category": "訓練",
            "committee_name": "感染症対策訓練",
            "item_key": "infection_drill",
            "agenda": "発熱者発生時の隔離・ゾーニング訓練",
            "content": "居室での発熱者発生を想定し、レッドゾーン・グリーンゾーンの区画分けと防護具着脱エリアの設置訓練を実施した。"
        },
        {
            "date": "2026-08-20",
            "category": "施設内研修",
            "committee_name": "業務継続計画（BCP）研修",
            "item_key": "bcp_training",
            "agenda": "台風・水害等の風水害を想定したBCP対策",
            "content": "近隣河川のハザードマップ確認とタイムラインに沿った垂直避難・物資移動の手順について確認した。"
        },
        {
            "date": "2026-08-27",
            "category": "会議",
            "committee_name": "運営推進会議",
            "item_key": "promotion_meeting",
            "agenda": "事故・ヒヤリハット報告の共有及び防災への取り組み",
            "content": "上半期の事故・ヒヤリハット傾向と再発防止策を報告。秋の地域合同防災訓練への参加について包括職員・自治会と調整した。"
        },
        {
            "date": "2026-09-17",
            "category": "訓練",
            "committee_name": "業務継続計画（BCP）訓練",
            "item_key": "bcp_drill",
            "agenda": "風水害時の浸水防止及び垂直避難訓練",
            "content": "大雨による浸水警報発令を想定。止水板設置の確認、2階への重要書類・医薬品・非常食の搬送手順を模擬体験した。"
        },
        {
            "date": "2026-09-24",
            "category": "施設内研修",
            "committee_name": "虐待防止研修",
            "item_key": "abuse_training",
            "agenda": "ストレスマネジメントと不適切なケアの未然防止",
            "content": "日々のケアにおける気づきの共有と、職員のストレス軽減に向けた相談体制の整備について確認した。"
        },
        {
            "date": "2026-10-15",
            "category": "施設内研修",
            "committee_name": "身体拘束廃止・適正化研修",
            "item_key": "restraint_training",
            "agenda": "緊急やむを得ない場合の三要件と適正手続の再確認",
            "content": "切迫性・非代替性・一時性の三要件を再確認。現在当施設での身体拘束対象者は0件であることを確認し、継続を申し合わせた。"
        },
        {
            "date": "2026-10-22",
            "category": "会議",
            "committee_name": "運営推進会議",
            "item_key": "promotion_meeting",
            "agenda": "秋期の行事実施報告及び冬期の防災・感染対策について",
            "content": "敬老会など秋の行事の報告を実施。これから冬に向けての暖房管理・火災予防・感染対策の準備について報告・協議した。"
        }
    ]

    added_committees = 0
    for rec in NEW_COMMITTEE_RECORDS:
        exists = any(
            c.get("date") == rec["date"] and (
                c.get("item_key") == rec["item_key"] or c.get("committee_name") == rec["committee_name"]
            ) for c in committees
        )
        if not exists:
            is_promo = (rec["item_key"] == "promotion_meeting")
            att = build_attendees(rec["date"], is_promotion=is_promo)
            committees.append({
                "id": nid(),
                "date": rec["date"],
                "category": rec["category"],
                "committee_name": rec["committee_name"],
                "item_key": rec["item_key"],
                "attendees": att,
                "agenda": rec["agenda"],
                "content": rec["content"]
            })
            added_committees += 1

    committees.sort(key=lambda x: (x.get("date") or "", x.get("id") or 0))

    # ----------------------------------------------------
    # 3. 自己評価・外部評価（quality_evaluations）
    # ----------------------------------------------------
    q_evals = d.setdefault("quality_evaluations", [])
    added_quality = 0
    if not any(q.get("nendo") == 2024 and not q.get("voided") for q in q_evals):
        q_evals.append({
            "id": nid(),
            "nendo": 2024,
            "self_eval_date": "2024-09-12",
            "external_eval_type": "評価機関による評価",
            "external_eval_date": "2024-11-21",
            "agency_name": "デモ評価センター",
            "reason_exempt": "",
            "committee_report_date": "2025-02-20",
            "submitted_date": "2025-02-28",
            "created_at": "2025-02-28 15:30",
            "created_by": "木村 健一",
            "edit_history": [],
            "voided": False,
            "voided_at": "",
            "voided_by": "",
            "void_reason": ""
        })
        added_quality += 1

    if not any(q.get("nendo") == 2025 and not q.get("voided") for q in q_evals):
        q_evals.append({
            "id": nid(),
            "nendo": 2025,
            "self_eval_date": "2025-12-10",
            "external_eval_type": "運営推進会議を活用した評価",
            "external_eval_date": "2026-02-19",
            "agency_name": "",
            "reason_exempt": "",
            "committee_report_date": "2026-02-19",
            "submitted_date": "2026-03-10",
            "created_at": "2026-03-10 16:00",
            "created_by": "木村 健一",
            "edit_history": [],
            "voided": False,
            "voided_at": "",
            "voided_by": "",
            "void_reason": ""
        })
        added_quality += 1

    q_evals.sort(key=lambda x: (x.get("nendo") or 0, x.get("id") or 0))

    # ----------------------------------------------------
    # 4. 職員の健康診断（stamps[].health_checks）
    # ----------------------------------------------------
    stamps = d.get("stamps", [])
    added_hc_regular = 0
    added_hc_night = 0

    REGULAR_DATES = ["2026-05-12", "2026-05-13", "2026-05-14", "2026-05-15"]
    NIGHT_DATES = ["2025-11-11", "2025-11-12", "2025-11-13"]

    for idx, s in enumerate(stamps):
        hcs = s.setdefault("health_checks", [])
        has_reg = any(hc.get("kind") == "定期健康診断" and (hc.get("date") or "").startswith("2026-05") for hc in hcs)
        if not has_reg:
            reg_date = REGULAR_DATES[idx % len(REGULAR_DATES)]
            hcs.append({
                "id": nid(),
                "date": reg_date,
                "kind": "定期健康診断",
                "kind_other": "",
                "created_at": f"{reg_date} 16:30",
                "created_by": "松本 陽子",
                "voided": False,
                "voided_at": "",
                "voided_by": "",
                "void_reason": ""
            })
            added_hc_regular += 1

        staff_name = s.get("name", "")
        has_night_duty = False
        for ym, staff_shifts in ms.items():
            if staff_name in staff_shifts and "夜" in staff_shifts[staff_name].values():
                has_night_duty = True
                break
        
        if has_night_duty:
            has_night_hc = any(hc.get("kind") == "夜勤などの業務の健康診断" and (hc.get("date") or "").startswith("2025-11") for hc in hcs)
            if not has_night_hc:
                night_date = NIGHT_DATES[idx % len(NIGHT_DATES)]
                hcs.append({
                    "id": nid(),
                    "date": night_date,
                    "kind": "夜勤などの業務の健康診断",
                    "kind_other": "",
                    "created_at": f"{night_date} 16:30",
                    "created_by": "松本 陽子",
                    "voided": False,
                    "voided_at": "",
                    "voided_by": "",
                    "void_reason": ""
                })
                added_hc_night += 1

    # 変更があった場合のみ書き出し
    total_added = updated_existing + added_committees + added_quality + added_hc_regular + added_hc_night
    if total_added > 0:
        if isinstance(d.get("_rev"), int):
            d["_rev"] += 1
        tmp = target_path + ".tmp_write"
        with open(tmp, "w", encoding="utf-8-sig", newline="") as f:
            f.write(json.dumps(d, ensure_ascii=False, separators=(",", ":")))
        os.replace(tmp, target_path)

    print(f"[{os.path.basename(target_path)}] 完了:")
    print(f"  既存委員会のitem_key更新: {updated_existing} 件")
    print(f"  新規委員会・研修・訓練等: {added_committees} 件 (合計: {len(committees)} 件)")
    print(f"  自己評価・外部評価: {added_quality} 件 (合計: {len(q_evals)} 件)")
    print(f"  定期健康診断 (2026-05): {added_hc_regular} 件")
    print(f"  夜勤健康診断 (2025-11): {added_hc_night} 件")

if __name__ == "__main__":
    main()
