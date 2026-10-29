# デモの毎日の記録を、発表の日の前の日まで延ばす
# あなた「１から順番につめていってください…１～５をどんどん進めてください」（2. 毎日の記録を発表の日まで延ばすスクリプト。12/7用は12/6まで、2月用は前日まで）
#
# 使い方（サーバーを止めてから）:
#   python tools/demo_year/extend_demo.py data/portal_database.json --to 2026-12-06
#   python tools/demo_year/extend_demo.py data/portal_database.json --to 2027-02-04     （2月の発表が 2/5 のとき）
#   python tools/demo_year/extend_demo.py data/portal_database.json --until "2026-12-07 08:30"   （発表の日の朝 8:30 までの記録も入れる。夜勤の巡視・起床・朝食・朝の服薬など）
#     ※ --until を使ったあとにもっと先へ延ばすと、発表の日の残り（8:30 より後）は入らない
#   --out 別のファイル  … 書き出し先を変える（ふだんは同じファイルに上書き。前の中身は .before_extend_日付 に残す）
#
# すること
# - 今のデータの最後の日（バイタル・食事などの最後の日）の次の日から --to の日まで、gen_daily・gen_facility と同じ決まりで記録を足す
#   （勤務表は前から入っている 2027-02 までの表と同じ。記録を書くのはその日に出勤している職員だけ。年末年始 12/29〜1/3 は入浴なし・看護師はオンコール）
# - 前の日までの記録はさわらない（手で直した記録・発表用に直した入院の経過もそのまま）
# - 入院中の前田 勝 様（9）は 2026-11-04 に退院（--to がそれより前なら入院のまま）
# - 業務日誌の一日の流れ（add_daily_schedules）、物品の使用・発注（add_supply_demo）を、延ばした日まで入れ直す
# - 予防接種（2026-11-11 の予定 → 接種済）、ケアプランのモニタリング・見直し、委員会・避難訓練、認定の更新、次の受診日、預り金の残高もそろえる
# - 2回目に --to をもっと先にして動かすと、その続きだけ足す（同じ --to でもう一度動かしても増えない）
import sys, os, json, shutil, argparse, datetime as DT, runpy, collections

HERE = os.path.dirname(os.path.abspath(__file__))
ap = argparse.ArgumentParser()
ap.add_argument("path")
ap.add_argument("--to", default=None, help="最後の日（発表の前の日）YYYY-MM-DD")
ap.add_argument("--until", default=None, help="発表の日の朝まで入れるとき: 'YYYY-MM-DD HH:MM'（その日のその時刻より後の記録は入れない）")
ap.add_argument("--out", default=None)
a = ap.parse_args()
if not a.to and not a.until: ap.error("--to か --until のどちらかを入れてください")
CUT = None
if a.until:
    CUT = a.until.strip().replace("T", " ")
    TO = DT.date.fromisoformat(CUT[:10])
else:
    TO = DT.date.fromisoformat(a.to)
OUT = a.out or a.path

d = json.load(open(a.path, encoding="utf-8-sig"))
LAST = max(DT.date.fromisoformat(x["date"][:10]) for x in d.get("vitals", []) if x.get("date"))
print("今のデータの最後の日:", LAST, " → 延ばす先:", TO)
if TO <= LAST:
    print("すでにその日まで入っています。何もしません。"); sys.exit(0)

os.environ["CP_DEMO_TO"] = TO.isoformat()
sys.path.insert(0, HERE)
import roster, gen_daily as G, gen_facility
assert G.REC_END == TO
if TO > G.ROSTER_END:
    print("勤務表は", G.ROSTER_END, "までです。--to はそれより前にしてください。"); sys.exit(1)

# ---- 入院中の方の退院 ----
MAEDA_BACK = "2026-11-04"
for h in roster.HOSP:
    if h["rid"] == 9 and h["end"] is None and TO.isoformat() >= MAEDA_BACK:
        h["end"] = MAEDA_BACK

def rec_date(x):
    for k in ("date", "recorded_at", "occurred_at", "created_at", "consumed_at", "timestamp", "received_at"):
        v = x.get(k)
        if isinstance(v, str) and len(v) >= 10: return v[:10]
    return None

# ---- 記録を作って、LAST より後の日のぶんだけ足す ----
daily = G.generate()
fac = gen_facility.generate()
daily["care_records"].extend(fac.pop("care_records_extra"))
all_ids = set()
for k, v in d.items():
    if isinstance(v, list):
        for x in v:
            if isinstance(x, dict) and x.get("id") is not None: all_ids.add(x["id"])
_seq = [max([i for i in all_ids if isinstance(i, int) and 1796000000000 <= i < 1797000000000] + [1796000000000])]
def nid():
    _seq[0] += 1
    while _seq[0] in all_ids: _seq[0] += 1
    all_ids.add(_seq[0])
    return _seq[0]

lastS, toS = LAST.isoformat(), TO.isoformat()
added = collections.Counter()
# 前からある「定期」のサマリー（退院後のサマリーの前の版としてつなぐ）
sum_by_res = {}
for s in sorted(d.get("care_summaries", []), key=lambda s: s.get("created_at", "")):
    sum_by_res[s["resident_id"]] = s["id"]
SKIP = {"vaccines", "complaints", "incidents", "committees", "fire_drills", "consumptions"}   # 決まった日の一覧（下で別に扱う）・物品は add_supply_demo で
for src in (daily, fac):
    for k, lst in src.items():
        if k in SKIP: continue
        keep = []
        for x in lst:
            ds_ = rec_date(x)
            if ds_ is None and k == "monthly_notices": ds_ = x["month"] + "-01"
            if ds_ is None or not (lastS < ds_ <= toS): continue
            x = dict(x); x["id"] = nid()
            if k == "care_summaries":
                x["previous_id"] = sum_by_res.get(x["resident_id"])
                sum_by_res[x["resident_id"]] = x["id"]
            keep.append(x)
        if keep:
            d.setdefault(k, []).extend(keep)
            added[k] += len(keep)

# ---- 前の最後の日のころ「まだ」だった連絡ノート・お知らせ（その後の日に済んだことにする） ----
for nb in d.get("notebooks", []):
    if nb.get("status") == "未対応" and nb.get("date", "") <= lastS and DT.date.fromisoformat(nb["date"]) < TO - DT.timedelta(days=3):
        nb["status"] = "完了"; nb["resolved_staff"] = nb.get("staff_name", "")
        conf = list(nb.get("confirmed_staff") or [])
        for s in G.STAFF_UNIT[1] + G.STAFF_UNIT[2]:
            if len(conf) >= 3: break
            if s not in conf and G.shift(1 if s in G.STAFF_UNIT[1] else 2, DT.date.fromisoformat(nb["date"]) + DT.timedelta(days=1)):
                conf.append(s)
        nb["confirmed_staff"] = conf
        nb["confirmed_versions"] = {c: nb.get("confirmed_versions", {}).get(c) or f"{nb['date']} 1{i}:00" for i, c in enumerate(conf)}
for mn in d.get("monthly_notices", []):
    if len(mn.get("confirmed_staff") or []) < 9 and mn.get("created_at", "")[:10] <= lastS and DT.date.fromisoformat(mn["created_at"][:10]) < TO - DT.timedelta(days=10):
        conf = list(mn.get("confirmed_staff") or [])
        for s in G.STAFF_UNIT[1] + G.STAFF_UNIT[2]:
            if len(conf) >= 9: break
            if s not in conf: conf.append(s)
        mn["confirmed_staff"] = conf

# ---- 利用者（前田様の退院・入院の期間リスト・預り金の残高・認定の更新・次の受診日） ----
RES = {r["id"]: r for r in d["residents"]}
NOW = f"{toS} 18:00"
for h in roster.HOSP:
    r = RES.get(h["rid"])
    if not r or h["start"] > toS: continue
    lst = r.get("hospitalizations") if isinstance(r.get("hospitalizations"), list) else []
    end = h["end"] if (h["end"] and h["end"] <= toS) else ""
    hit = next((x for x in lst if x.get("admission_date") == h["start"]), None)
    if hit is None:
        lst.append({"id": nid(), "resident_id": r["id"], "admission_date": h["start"], "discharge_date": end, "hospital_name": h["hospital"],
                    "reason": h["reason"], "created_by": "鈴木 美智子", "created_at": f"{h['start']} 12:00"})
    elif end and not hit.get("discharge_date"):
        hit["discharge_date"] = end
    r["hospitalizations"] = sorted(lst, key=lambda x: x.get("admission_date", ""))
    ongoing = [x for x in r["hospitalizations"] if not x.get("discharge_date") and not x.get("voided")]
    latest = r["hospitalizations"][-1]
    r["hospital_date"] = latest["admission_date"]; r["hospital_name"] = latest["hospital_name"]; r["hospital_reason"] = latest["reason"]
    if not ongoing and r.get("status") == "入院中": r["status"] = "在所"
dep = collections.defaultdict(list)
for p in d.get("deposits", []): dep[p["resident_id"]].append(p)
for rid, ps in dep.items():
    if rid in RES: RES[rid]["deposit_balance"] = sorted(ps, key=lambda p: (p["date"], p["id"]))[-1]["balance"]
def add_months(x, n):
    m = x.month - 1 + n
    y, m = x.year + m // 12, m % 12 + 1
    import calendar
    return DT.date(y, m, min(x.day, calendar.monthrange(y, m)[1]))
for r in d["residents"]:
    if r.get("status") == "退所": continue
    ex = r.get("care_expiry_date")
    if ex and ex <= toS:   # 有効期間が終わる前に更新の申請をした（同じ介護度で12か月）
        r["care_expiry_date"] = add_months(DT.date.fromisoformat(ex), 12).isoformat()
        added["認定の更新"] += 1
    nc = r.get("next_clinic_date")
    if nc and nc <= toS:
        r["next_clinic_date"] = (TO + DT.timedelta(days=[5, 9, 20, 26, 33, 40][r["id"] % 6])).isoformat()

# ---- 予防接種（2026-11-11 の予定 → 接種済。その日ホームにいる方） ----
VD = "2026-11-11"
if toS >= VD:
    vday = DT.date.fromisoformat(VD)
    vac = d.setdefault("vaccines", [])
    for r in d["residents"]:
        here = G.here(r["id"], vday, "10:00") if r["id"] in G.RES else False
        v = next((x for x in vac if x["resident_id"] == r["id"] and x.get("date") == VD), None)
        if v is None and here:
            v = {"id": nid(), "resident_id": r["id"], "vaccine_name": "季節性インフルエンザ", "dose": "1回目", "date": VD, "doctor": "ひだまり内科クリニック", "lot": ""}
            vac.append(v); added["vaccines"] += 1
        if v is None: continue
        if here:
            v.update({"consent": "同意受領済", "reactions": "なし", "status": "接種済"})
        elif v.get("status") == "予定":
            v.update({"status": "未接種", "reactions": "", "notes": "接種の日に入院中のため、退院後に主治医と相談"})

# ---- 委員会・研修・避難訓練（決まった日） ----
def com_attendees(dt_str, is_promo=False):
    ym = dt_str[:7]
    d_str = str(int(dt_str[8:10]))
    shifts = d.get("monthly_shifts", {}).get(ym, {})
    working = [staff for staff, days in shifts.items() if days.get(d_str) in ("日", "早", "遅")]
    if is_promo:
        promo_mgmt = ["木村 健一", "小林 恵子", "佐々木 浩二"]
        facility_att = [s for s in promo_mgmt if s in working]
        return "、".join(facility_att) + "、利用者のご家族、地域の方（自治会）、地域包括支援センターの職員"
    prio_mgmt = ["木村 健一", "佐々木 浩二", "小林 恵子", "鈴木 美智子", "加藤 由美"]
    selected_mgmt = [s for s in prio_mgmt if s in working][:4]
    selected_care = [s for s in working if s not in prio_mgmt][:3]
    facility_att = selected_mgmt + selected_care
    return "、".join(facility_att)

COM = [
    ("2026-11-10", "法定委員会", "感染症対策委員会", "infection_committee", "冬の感染症への備え", "インフルエンザ・ノロウイルスの流行期に向け、手洗い・換気・嘔吐物の処理の手順を確認。予防接種の結果を共有した。"),
    ("2026-11-26", "施設内研修", "感染対策研修", "infection_training", "冬期感染症対策と嘔吐物処理手順の徹底", "ノロウイルス流行期を前に、防護具の確実な着脱と汚染拡大防止の初動手順を再確認した。"),
    ("2026-12-10", "訓練", "感染症対策訓練", "infection_drill", "夜間発生を想定した感染症隔離訓練", "夜間帯の発熱者発生を想定し、少人数でのゾーニングと応援要請手順の実技訓練を実施した。"),
    ("2026-12-15", "法定委員会", "身体拘束適正化委員会", "restraint_committee", "冬の夜間の見守り", "夜が長くなり、夜間の離床が増える時期。センサーマットを使っている方が、本人の動きを妨げていないか確認。今期も身体拘束は0件。"),
    ("2026-12-17", "会議", "運営推進会議", "promotion_meeting", "冬期の生活環境と感染症・防火対策について", "冬期の暖房・加湿状況とインフルエンザ予防接種の実施状況を報告。年末年始の面会ルールについて協議した。"),
    ("2027-01-12", "法定委員会", "感染症対策委員会", "infection_committee", "年末年始の振り返り", "年末年始に発熱した方はいなかった。面会の方にも手指の消毒と体調の確認をお願いすることを続ける。"),
    ("2027-01-21", "施設内研修", "業務継続計画（BCP）研修", "bcp_training", "感染症まん延時における業務継続と優先度判定", "職員の複数感染を想定した最小人員体制と、食事・排泄など生命維持に直結する優先ケアの整理を行った。"),
    ("2027-02-18", "会議", "運営推進会議", "promotion_meeting", "外部評価の活用と新年度に向けた地域連携", "今年度の外部評価結果および事業改善の進捗を報告。地域行事との連携やボランティア受入れについて意見交換を行った。"),
    ("2027-02-25", "訓練", "業務継続計画（BCP）訓練", "bcp_drill", "非常用電源立ち上げ及び安否確認システム訓練", "停電時を想定した発電機稼働訓練と、職員緊急連絡網を用いた安否確認の実地テストを行った。")
]
for (dt_, cat, name, ikey, ag, ct) in COM:
    if lastS < dt_ <= toS and not any(c.get("date") == dt_ and (c.get("item_key") == ikey or c.get("committee_name") == name) for c in d.get("committees", [])):
        att = com_attendees(dt_, is_promo=(ikey == "promotion_meeting"))
        d.setdefault("committees", []).append({
            "id": nid(), "date": dt_, "category": cat, "committee_name": name, "item_key": ikey,
            "attendees": att, "agenda": ag, "content": ct
        })
        added["committees"] += 1
FD = [("2026-11-19", "昼間想定 避難・消火訓練", "西棟の台所からの出火を想定。全員の避難が4分20秒で完了。", 16),
      ("2027-02-18", "夜間想定 通報・避難訓練", "夜勤2名を想定し、東棟の居室からの出火。通報と、近い方から順に避難。避難完了6分50秒。", 17)]
for (dt_, typ, scen, n) in FD:
    if lastS < dt_ <= toS and not any(f.get("date") == dt_ for f in d.get("fire_drills", [])):
        d.setdefault("fire_drills", []).append({"id": nid(), "date": dt_, "drill_type": typ, "participants_count": n, "duration": "", "scenario": scen,
                                                "notes": "入院中の方を除く利用者が参加（職員が付き添い）。", "reported_to_fire_dept": 1, "supervisor": "木村 健一"})
        added["fire_drills"] += 1

# ---- ケアプラン（モニタリングは3か月ごとの25日。短期目標の期間が終わる前に見直して次の版） ----
RESULTS = [("一部", "少しずつできてきている。続けて様子を見る。"), ("達成", "目標どおりにできている。"), ("まだ", "体調や気分によってできない日がある。かかわり方を工夫する。")]
def mon_dates(sf, st):
    out = []; x = add_months(DT.date.fromisoformat(sf).replace(day=1), 2).replace(day=25)
    while x.isoformat() < st:
        out.append(x.isoformat()); x = add_months(x, 3)
    return out
CM = "小林 恵子"
plans = d.get("care_plans", [])
for rid in sorted({p["resident_id"] for p in plans}):
    r = RES.get(rid)
    if not r or r.get("status") == "退所": continue
    while True:
        cur = max((p for p in plans if p["resident_id"] == rid and p.get("status") == "実施中"), key=lambda p: p["version"], default=None)
        if cur is None: break
        sf, st = cur["needs"][0]["short_from"], cur["needs"][0]["short_to"]
        have = {m["date"] for m in cur.get("monitorings", [])}
        mds = mon_dates(sf, st)
        for mi, md in enumerate(mds):
            if md in have or not (lastS < md <= toS): continue
            if not G.here(rid, DT.date.fromisoformat(md), "10:00"): continue
            last = mi == len(mds) - 1
            items = [{"need_id": n["id"], "result": RESULTS[(rid + ni + mi) % 3][0], "note": RESULTS[(rid + ni + mi) % 3][1]} for ni, n in enumerate(cur["needs"])]
            cur.setdefault("monitorings", []).append({"id": nid(), "date": md, "by": CM, "items": items,
                "review_needed": "見直し必要" if last else "継続（見直し不要）",
                "note": "短期目標の期間が近いため、次の計画で目標を見直す。" if last else "今の計画を続ける。"})
            added["モニタリング"] += 1
        # 短期目標の終わる日の5日前に作り、次の日から実施
        new_from = (DT.date.fromisoformat(st) + DT.timedelta(days=1))
        created = (new_from - DT.timedelta(days=6))
        if created.isoformat() > toS: break
        ver = cur["version"] + 1
        nf = new_from.isoformat(); nt = (add_months(new_from, 6) - DT.timedelta(days=1)).isoformat()
        lf, lt = cur["needs"][0]["long_from"], cur["needs"][0]["long_to"]
        if lt < nt: lf, lt = nf, (add_months(new_from, 12) - DT.timedelta(days=1)).isoformat()
        needs = [{**{k: v for k, v in n.items() if k not in ("id", "services")}, "id": nid(), "short_from": nf, "short_to": nt, "long_from": lf, "long_to": lt,
                  "services": [{**s, "id": nid()} for s in n.get("services", [])]} for n in cur["needs"]]
        reason = "短期目標の期間が終わるための見直し"
        meet = (created + DT.timedelta(days=2)).isoformat()
        consented = nf
        np_ = {k: v for k, v in cur.items() if k not in ("needs", "monitorings", "meetings", "consent", "edit_history")}
        np_.update({"id": nid(), "version": ver, "status": "実施中", "created_at": created.isoformat(), "created_by": CM, "needs": needs, "monitorings": [],
                    "meetings": [{**cur["meetings"][0], "id": nid(), "date": meet}] if cur.get("meetings") else [],
                    "consent": {**cur.get("consent", {}), "explained_on": (new_from - DT.timedelta(days=1)).isoformat(), "consented_on": consented, "delivered_on": consented},
                    "ended_at": "", "end_reason": "", "review_reason": reason, "previous_version_id": cur["id"],
                    "edit_history": [{"edited_at": created.isoformat() + " 10:00", "edited_by": CM, "reason": f"第{cur['version']}版からの見直し作成（理由: {reason}）",
                                      "before": {"previous_version": cur["version"]}}]})
        cur["status"] = "終了"; cur["ended_at"] = consented; cur["end_reason"] = f"第{ver}版の実施開始に伴い終了（見直し理由: {reason}）"
        plans.append(np_); added["ケアプランの新しい版"] += 1
plans.sort(key=lambda p: (p["resident_id"], -p["version"]))

import fix_on_duty
added["連絡ノート・運転の人を出勤の人に"] = fix_on_duty.apply(d)
# 利用者への請求書: 前からある請求書で、入金待ちのものは、翌月27日ごろ（事務員の出勤日）の口座振替・振込で入金済にする
# （延ばした月の請求書は作らない。発表のときに画面で「確定」するところを見せられるように）
for inv in d.get("invoices", []) or []:
    if inv.get("voided") or [p for p in inv.get("payments", []) if not p.get("voided")]: continue
    y, m = map(int, inv["ym"].split("-")); y, m = (y + 1, 1) if m == 12 else (y, m + 1)
    day = DT.date(y, m, 27)
    for _ in range(15):
        if day.weekday() < 5 and not G.is_newyear(day) and (((d.get("monthly_shifts") or {}).get(day.isoformat()[:7], {}).get("松本 陽子", {}) or {}).get(str(day.day)) in ("早", "日", "遅")): break
        day += DT.timedelta(days=1)
    if day.isoformat() > toS: continue
    inv.setdefault("payments", []).append({"id": nid(), "date": day.isoformat(), "amount": inv["total"], "method": "振込" if int(inv["resident_id"]) % 5 == 0 else "口座振替",
                                           "recorded_by": "松本 陽子", "recorded_at": day.isoformat() + " 15:00"})
    added["請求書の入金"] += 1
import fix_vehicles
fix_vehicles.apply(d)   # 車を2台に分けて、メーターをつなげ直す（足した日の分も）
if isinstance(d.get("_rev"), int): d["_rev"] += 1
if OUT == a.path:
    bk = a.path + ".before_extend_" + DT.date.today().strftime("%Y%m%d")
    if not os.path.exists(bk): shutil.copy2(a.path, bk)
tmp = OUT + ".tmp_write"
with open(tmp, "w", encoding="utf-8-sig", newline="") as f:
    f.write(json.dumps(d, ensure_ascii=False, separators=(",", ":")))
os.replace(tmp, OUT)
print("足したもの:", dict(added))

# ---- 一日の流れ・物品（同じ道具を、延ばした日まで動かし直す。どちらも2回当てても増えない） ----
for tool in ("add_daily_schedules.py", "add_supply_demo.py"):
    sys.argv = [tool, OUT]
    runpy.run_path(os.path.join(HERE, tool), run_name="__main__")

# ---- 発表の日の朝まで（--until）: その日のその時刻より後の記録を外す ----
# 時刻のない記録（身だしなみ・シーツ・体重・連絡ノート・レク・車両・預り金など）は、その日の分を入れない。口腔ケア・塗り薬は「朝食後」「朝」だけ残す
if CUT:
    cday, ctime = CUT[:10], CUT[11:16]
    MORNING = {"oral_cares": ("朝食後",), "topical_records": ("朝",)}
    def rec_time(k, x):
        if x.get("time"): return x["time"]
        if x.get("given_time"): return x["given_time"]
        for f in ("recorded_at", "done_at", "timestamp", "consumed_at", "occurred_at", "created_at"):
            v = x.get(f)
            if isinstance(v, str) and len(v) >= 16: return v[11:16]
        if k in MORNING: return "08:30" if x.get("timing") in MORNING[k] else "23:59"
        return None
    dd = json.load(open(OUT, encoding="utf-8-sig"))
    cut_n = 0
    undo = {}   # 外した在庫の出し入れ（品物名 → 戻す数）
    for k, lst in list(dd.items()):
        if not isinstance(lst, list): continue
        keep = []
        for x in lst:
            if isinstance(x, dict):
                ds_ = rec_date(x) or (x.get("ordered_at") or "")[:10]
                drop = False
                if ds_ == cday:
                    t = rec_time(k, x)
                    drop = (t is None or t > ctime)
                elif ds_ and ds_ > cday: drop = True
                if drop:
                    cut_n += 1
                    if k == "inventory_logs" and isinstance(x.get("change_qty"), (int, float)):
                        undo[x.get("item_name")] = undo.get(x.get("item_name"), 0) - x["change_qty"]
                    continue
            keep.append(x)
        dd[k] = keep
    # 在庫の数は、外した使用・入庫の分を戻す（その時刻より後の出し入れは、まだないことにする）
    for it in dd.get("inventory", []):
        if it.get("name") in undo: it["current_stock"] = int(it.get("current_stock") or 0) + int(undo[it["name"]])
    tmp = OUT + ".tmp_write"
    with open(tmp, "w", encoding="utf-8-sig", newline="") as f:
        f.write(json.dumps(dd, ensure_ascii=False, separators=(",", ":")))
    os.replace(tmp, OUT)
    print(f"{cday} の {ctime} より後の記録を外した:", cut_n, "件")
print("できました:", OUT)
