# デモのケアプラン（care_plans）を作る。版ごとの記録（作成→話し合い→説明・同意・交付→モニタリング→見直し）
import datetime as DT
import roster
from careplan_content import C

CM = "小林 恵子"
NURSE = "鈴木 美智子"
LEADER = {1: "山田 孝之", 2: "吉田 誠"}
CARE = {1: "伊藤 翔太", 2: "高橋 直樹"}

def d(s): return DT.date.fromisoformat(s)
def s(x): return x.isoformat()
def add(x, days): return x + DT.timedelta(days=days)

_seq = [1795000000000]
def nid():
    _seq[0] += 1
    return _seq[0]

def relation(r):
    return r["emergency_contact"].split("・")[0]

# 版の予定: (作成日, 説明・同意日, 短期の期間(から,まで), 長期の期間, モニタリング日のリスト, 最後のモニタリングで見直しか, 見直しの理由)
def schedule(r):
    rid = r["id"]
    adm = r["admission_date"]
    if rid == 19:  # 大野 2026-05-18 入居
        return [
            ("2026-05-18", "2026-05-22", ("2026-05-22", "2026-08-31"), ("2026-05-22", "2027-05-21"), ["2026-06-26", "2026-08-26"], True, None),
            ("2026-08-27", "2026-09-01", ("2026-09-01", "2027-02-28"), ("2026-05-22", "2027-05-21"), [], False, "入居から3か月の見直し（ホームの暮らしに慣れてきたため目標を見直す）"),
        ]
    if rid == 12:  # 坂本 2026-03-14 死亡退所
        return [
            ("2025-09-24", "2025-10-01", ("2025-10-01", "2026-03-31"), ("2025-10-01", "2026-09-30"), ["2025-12-25"], False, None),
            ("2026-02-09", "2026-02-14", ("2026-02-14", "2026-05-31"), ("2026-02-14", "2026-09-30"), [], False, "看取りの時期への移行（主治医の説明とご家族の意向を受けて方針を見直す）"),
        ]
    if rid == 6:  # 中島 入院 2025-12-03〜2026-01-09
        return [
            ("2025-09-24", "2025-10-01", ("2025-10-01", "2026-03-31"), ("2025-10-01", "2026-09-30"), [], False, None),
            ("2026-01-10", "2026-01-16", ("2026-01-16", "2026-06-30"), ("2026-01-16", "2026-12-31"), ["2026-03-25", "2026-06-25"], True, "退院（右大腿骨の骨折の手術とリハビリ）に伴う見直し"),
            ("2026-06-26", "2026-07-01", ("2026-07-01", "2026-12-31"), ("2026-01-16", "2026-12-31"), ["2026-09-25"], False, "短期目標の期間が終わるための見直し"),
        ]
    if rid == 3:  # 鈴木 入院 2026-01-22〜02-06
        return [
            ("2025-09-24", "2025-10-01", ("2025-10-01", "2026-03-31"), ("2025-10-01", "2026-09-30"), ["2025-12-25"], False, None),
            ("2026-02-07", "2026-02-13", ("2026-02-13", "2026-07-31"), ("2026-02-13", "2027-01-31"), ["2026-04-24", "2026-07-24"], True, "退院（誤嚥性肺炎）に伴う見直し"),
            ("2026-07-25", "2026-08-01", ("2026-08-01", "2027-01-31"), ("2026-02-13", "2027-01-31"), ["2026-09-25"], False, "短期目標の期間が終わるための見直し"),
        ]
    if rid == 2:  # 田中 入院 2026-07-08〜07-18
        return [
            ("2025-09-24", "2025-10-01", ("2025-10-01", "2026-03-31"), ("2025-10-01", "2026-09-30"), ["2025-12-25", "2026-03-25"], True, None),
            ("2026-03-26", "2026-04-01", ("2026-04-01", "2026-09-30"), ("2026-04-01", "2027-03-31"), ["2026-06-25"], False, "短期目標の期間が終わるための見直し"),
            ("2026-07-19", "2026-07-24", ("2026-07-24", "2027-01-31"), ("2026-04-01", "2027-03-31"), ["2026-09-25"], False, "退院（心不全の悪化）に伴う見直し"),
        ]
    # ふつう: 半年ごとに見直し
    return [
        ("2025-09-24", "2025-10-01", ("2025-10-01", "2026-03-31"), ("2025-10-01", "2026-09-30"), ["2025-12-25", "2026-03-25"], True, None),
        ("2026-03-26", "2026-04-01", ("2026-04-01", "2026-09-30"), ("2026-04-01", "2027-03-31"), ["2026-06-25", "2026-09-25"], True, "短期目標の期間が終わるための見直し"),
        ("2026-09-26", "2026-10-01", ("2026-10-01", "2027-03-31"), ("2026-04-01", "2027-03-31"), [], False, "短期目標の期間が終わるための見直し"),
    ]

RESULTS = [("一部", "少しずつできてきている。続けて様子を見る。"), ("達成", "目標どおりにできている。"), ("まだ", "体調や気分によってできない日がある。かかわり方を工夫する。")]

def make_plans(r):
    c = C[r["id"]]
    unit = r["unit_id"]
    plans = []
    sch = schedule(r)
    prev = None
    for vi, (created, consented, (sf, st), (lf, lt), mons, review_at_end, reason) in enumerate(sch):
        ver = vi + 1
        meet = s(add(d(created), 2)) if d(created) < d(consented) else created
        if d(meet) > d(consented): meet = created
        explained = s(add(d(consented), -1)) if d(consented) > d(meet) else consented
        needs = []
        for (need, lg, sg, svcs) in c["needs"]:
            needs.append({"id": nid(), "need": need, "long_goal": lg, "long_from": lf, "long_to": lt,
                          "short_goal": sg, "short_from": sf, "short_to": st,
                          "services": [{"id": nid(), "content": a, "who": b, "frequency": f} for (a, b, f) in svcs]})
        mon_list = []
        for mi, md in enumerate(mons):
            last = mi == len(mons) - 1
            items = []
            for ni, n in enumerate(needs):
                res, note = RESULTS[(r["id"] + ni + mi) % 3]
                items.append({"need_id": n["id"], "result": res, "note": note})
            need_review = review_at_end and last
            mon_list.append({"id": nid(), "date": md, "by": CM, "items": items,
                             "review_needed": "見直し必要" if need_review else "継続（見直し不要）",
                             "note": ("短期目標の期間が近いため、次の計画で目標を見直す。" if need_review else "今の計画を続ける。")})
        plan = {
            "id": nid(), "resident_id": r["id"], "version": ver, "status": "実施中",
            "created_at": created, "created_by": CM,
            "assessment": {"person_wish": c["person"], "family_wish": c["family"], "strengths": c["strengths"], "issues": c["issues"], "summary_id": None},
            "policy": c["policy"], "needs": needs,
            "meetings": [{"id": nid(), "date": meet,
                          "attendees": f"{CM}（計画作成担当者）、{NURSE}（看護師）、{LEADER[unit]}（ユニットリーダー）、{CARE[unit]}（介護職員）",
                          "opinions": ("今の暮らしの様子と、本人・家族の希望を共有した。目標とサービス内容はこの案で進める。体調の変化は看護師へすぐ伝える。"),
                          "recorded_by": CM}],
            "consent": {"explained_on": explained, "explained_to": "本人・家族", "relation": relation(r), "consented_on": consented, "delivered_on": consented},
            "monitorings": mon_list, "ended_at": "", "end_reason": "", "edit_history": [],
        }
        if prev is not None:
            plan["review_reason"] = reason
            plan["previous_version_id"] = prev["id"]
            plan["edit_history"] = [{"edited_at": created + " 10:00", "edited_by": CM,
                                     "reason": f"第{prev['version']}版からの見直し作成（理由: {reason}）", "before": {"previous_version": prev["version"]}}]
            prev["status"] = "終了"
            prev["ended_at"] = consented
            prev["end_reason"] = f"第{ver}版の実施開始に伴い終了（見直し理由: {reason}）"
        plans.append(plan)
        prev = plan
    # 死亡退所
    for dc in roster.DISCHARGE:
        if dc["rid"] == r["id"] and plans:
            plans[-1]["status"] = "終了"
            plans[-1]["ended_at"] = dc["date"]
            plans[-1]["end_reason"] = f"{dc['reason']}（{dc['date']}）"
    return plans

def generate():
    out = []
    for r in roster.R:
        out.extend(make_plans(r))
    out.sort(key=lambda p: (p["resident_id"], -p["version"]))
    return out

if __name__ == "__main__":
    ps = generate()
    print(len(ps), "plans;", sum(1 for p in ps if p["status"] == "実施中"), "active")
