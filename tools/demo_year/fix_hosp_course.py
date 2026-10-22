# デモの入院4件で「なぜ入院したか」の経過がわかるように、記録を書き直す
# あなた「何故入院しましたって個人記録は残っていない。ふつうは熱がこんだけあって緊急で受診、そのまま入院となるみたいな記録は残っていない」
# - 毎日同じ「看護師が状態を確認し主治医へ連絡。指示に従い経過をみる。」を、その日の数字・指示・家族への連絡の入った記録に書き換える
# - 土日（看護師が休み）に介護職員の名前で「看護」の記録があったのを、オンコールの看護師へ電話した介護職員の「連絡」に直す
# - 中島さんの転倒（事故報告書は 2:40 発見）なのに、朝まで「安眠中・異常なし」の巡視や朝食の記録が残っていたのを直す
# - 受診で出かけた時刻より後の、その日の記録（食事・服薬・巡視など）を外す
# - 搬送・受診に出たこと・入院が決まったことは「特変」で残す（業務日誌の特記にも出る）。あなた「特変で搬送されたとかもよ、あと経過がたどれるのはいいけど、記録にも残してね特変とかで」
# - 医療の判断は書かない。書くのは、測った数字・見た様子・看護師へ報告・主治医の指示・病院から受けた説明（看護師が聞いた）・家族への連絡
# 使い方: python fix_hosp_course.py data/portal_database.json （サーバーを止めてから）
import sys, os, json, datetime as DT
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gen_daily as G

path = sys.argv[1]
d = json.load(open(path, encoding="utf-8-sig"))
RES = {int(r["id"]): r for r in d["residents"]}
_seq = [1795100000000]
def nid():
    _seq[0] += 1
    return _seq[0]
def D(s): return DT.date.fromisoformat(s)
def unit(rid): return int(RES[rid]["unit_id"])
def care_staff(rid, day, hhmm): return G.who(unit(rid), D(day), hhmm)
def nurse_on(day): return G.nurse(D(day))
def oncall(day): return G.NURSES[D(day).toordinal() % 2]
def family(rid):
    ec = RES[rid].get("emergency_contact") or ""
    rel = ec.split("・")[0] if "・" in ec else "ご家族"
    return {"妻": "奥様", "夫": "ご主人"}.get(rel, rel + "様")
def vital(rid, day, before="23:59"):
    vs = [v for v in d["vitals"] if int(v["resident_id"]) == rid and v["date"] == day and (v.get("time") or "") <= before]
    vs.sort(key=lambda v: v.get("time") or "")
    return vs[-1] if vs else None
def vtxt(v, spo2=True):
    if not v: return ""
    t = f"体温{v['temperature']}℃"
    if spo2 and v.get("spo2") is not None: t += f"・SpO2 {v['spo2']}%"
    return t

def rtime(x):
    """記録の時刻（HH:MM）。わからないものは None"""
    for k in ("recorded_at", "done_at", "consumed_at"):
        if x.get(k) and len(x[k]) >= 16: return x[k][11:16]
    if x.get("time"): return x["time"]
    if x.get("given_time"): return x["given_time"]
    slot = (x.get("slot") or x.get("timing") or "")
    for key, t in (("朝", "08:00"), ("昼", "12:00"), ("夕", "18:00"), ("眠", "21:00"), ("就寝", "21:00")):
        if key in slot: return t
    return None
def rday(x):
    for k in ("date",):
        if x.get(k): return x[k][:10]
    for k in ("recorded_at", "done_at", "consumed_at"):
        if x.get(k): return x[k][:10]
    return None

COLS = ["care_records", "vitals", "meals", "excretions", "oral_cares", "meds", "baths", "groomings", "turns", "topical_records", "linens"]
removed = 0
def drop_after(rid, day, hhmm):
    """その日の hhmm より後の記録を外す（出かけたあとなので書けない記録）"""
    global removed
    for c in COLS:
        lst = d.get(c) or []
        keep = []
        for x in lst:
            if int(x.get("resident_id") or -1) == rid and rday(x) == day:
                t = rtime(x)
                if t is None or t > hhmm:
                    removed += 1
                    continue
            keep.append(x)
        d[c] = keep
def drop_generic(rid, days):
    """毎日同じ文の 看護・連絡、重なっている特変（「朝から熱が…看護師が主治医へ連絡」）、看護師でない人の看護の記録を外す"""
    global removed
    keep = []
    for x in d["care_records"]:
        if int(x.get("resident_id") or -1) == rid and (x.get("recorded_at") or "")[:10] in days:
            c = x.get("content") or ""
            if x.get("category") in ("看護", "連絡") and ("指示に従い経過をみる" in c or "そのまま入院" in c or "バイタルの記録を確認" in c):
                removed += 1; continue
            if x.get("category") == "特変" and ("看護師が主治医へ連絡" in c or "朝から熱が" in c or "朝から息苦しさ" in c or "夜間に居室で転倒" in c):
                removed += 1; continue
        keep.append(x)
    d["care_records"] = keep
added = 0
def add(rid, day, hhmm, cat, text, staff):
    global added
    d["care_records"].append({"id": nid(), "resident_id": rid, "category": cat, "content": text,
                              "recorded_at": f"{day} {hhmm}", "staff_name": staff})
    added += 1

def go_out(rid, day, hhmm, nurse_name, dest="あおば総合病院"):
    add(rid, day, hhmm, "特変", f"{dest}へ受診のため出発（施設の車、生活相談員が運転、看護師（{nurse_name}）が付き添い）。お薬手帳・保険証・介護サマリーを持参。", nurse_name)

# ---------------- 中島 正雄（6）2025-12-03 夜間の転倒 ----------------
rid, day = 6, "2025-12-03"
drop_generic(rid, {day})
drop_after(rid, day, "02:30")
nt = care_staff(rid, "2025-12-02", "23:00")   # 12/02 の夜勤
oc = oncall(day)
add(rid, day, "02:40", "特変", "センサーマットの音で訪室。ベッドの横の床に座り込んでおられる。右の脚の付け根を強く痛がり、立ち上がれない。頭は打っていないと話される。無理に動かさず、毛布をかけて声をかけ続ける。", nt)
add(rid, day, "02:45", "連絡", f"オンコールの看護師（{oc}）へ電話で報告。看護師が主治医へ連絡し、救急車を呼ぶよう指示を受ける。", nt)
add(rid, day, "02:48", "連絡", "119番へ通報。管理者（木村）へ電話で報告。", nt)
add(rid, day, "02:52", "家族", f"{family(rid)}へ電話。転倒して救急車で病院へ向かうことを伝える。病院へ向かうとのこと。", nt)
add(rid, day, "03:05", "特変", "救急車が到着。お薬手帳・保険証・介護サマリーの写しを救急隊へ渡し、あおば総合病院へ搬送。オンコールの看護師が病院で合流。", nt)
add(rid, day, "05:50", "特変", f"病院の医師から、右大腿骨の骨折のため入院し、手術をする予定と説明を受けた（{family(rid)}同席）。看護師は6時半に施設へ戻る。", oc)
for inc in d.get("incidents", []):
    if int(inc.get("resident_id") or -1) == rid and (inc.get("occurred_at") or "").startswith(day):
        inc["staff_name"] = nt

# ---------------- 鈴木 一郎（3）2026-01-19〜22 発熱 → 受診・入院 ----------------
rid = 3
days = ["2026-01-19", "2026-01-20", "2026-01-21", "2026-01-22"]
drop_generic(rid, set(days))
for x in d["care_records"]:   # 1/21 の訪問診療の文に「むくみ」が入っていた
    if int(x.get("resident_id") or -1) == rid and (x.get("recorded_at") or "").startswith("2026-01-21 15:00"):
        x["content"] = "訪問診療。主治医が胸の音を聴いて診察。明日の朝も熱とSpO2が良くならなければ、病院を受診するよう指示。"
v = vital(rid, "2026-01-19", "09:05"); n = nurse_on("2026-01-19")
add(rid, "2026-01-19", "09:05", "看護", f"{vtxt(v, False)}。痰がからむ咳が少しある。主治医へ電話で報告。水分をこまめにとり、体温とSpO2を朝・昼・夕に測って様子をみるよう指示。変わりがあればすぐ連絡。", n)
v = vital(rid, "2026-01-20", "09:25"); n = nurse_on("2026-01-20")
add(rid, "2026-01-20", "09:25", "看護", f"{vtxt(v)}。痰がからみ、食事は2割ほど。主治医へ報告。明日の訪問診療で診察するので、それまで水分と体温・SpO2の確認を続けるよう指示。", n)
add(rid, "2026-01-20", "10:00", "家族", f"{family(rid)}へ電話。熱が続いていること、明日の訪問診療で診てもらうことを伝える。", n)
v = vital(rid, "2026-01-21", "09:05"); n = nurse_on("2026-01-21")
add(rid, "2026-01-21", "09:05", "看護", f"{vtxt(v)}。痰が多い。主治医へ報告し、午後の訪問診療で診てもらうことになった。", n)
add(rid, "2026-01-21", "16:00", "家族", f"{family(rid)}へ電話。訪問診療の結果と、明朝も良くならなければ受診することを伝える。", n)
day = "2026-01-22"; v = vital(rid, day, "09:31"); n = nurse_on(day)
add(rid, day, "09:31", "特変", f"看護師が状態を確認。{vtxt(v)}、呼吸が速く痰がからむ。主治医へ連絡し、あおば総合病院を受診するよう指示を受ける。", n)
add(rid, day, "09:40", "家族", f"{family(rid)}へ電話。これから受診することを伝える。病院で合流していただく。", n)
drop_after(rid, day, "10:00")
go_out(rid, day, "10:00", n)
add(rid, day, "12:40", "特変", f"病院の医師から、誤嚥性肺炎のため入院と説明を受けた（{family(rid)}同席）。看護師は13時半に施設へ戻る。", n)

# ---------------- 田中 ハナ（2）2026-07-05〜08 むくみ・息切れ → 受診・入院 ----------------
rid = 2
days = ["2026-07-05", "2026-07-06", "2026-07-07", "2026-07-08"]
drop_generic(rid, set(days))
# 体重（毎朝）: 3日で2.0kg増えた、を記録で確かめられるように
base = 47.4
for i, (dd, w) in enumerate([("2026-07-05", 47.4), ("2026-07-06", 48.1), ("2026-07-07", 48.8), ("2026-07-08", 49.4)]):
    d.setdefault("weight_records", []).append({"id": nid(), "date": dd, "month": dd[:7], "resident_id": rid, "weight": w,
                                               "diff_prev": round(w - (base if i == 0 else [47.4, 48.1, 48.8][i - 1]), 1),
                                               "staff_name": care_staff(rid, dd, "07:00")})
for x in d["care_records"]:   # 田中さんは熱ではなく、むくみと息切れ
    if int(x.get("resident_id") or -1) == rid and (x.get("recorded_at") or "")[:10] in days and "熱は看護師の指示どおりこまめに測る" in (x.get("content") or ""):
        x["content"] = x["content"].replace("熱は看護師の指示どおりこまめに測る", "息苦しさとむくみの様子を、看護師の指示どおりこまめに見る")
n = nurse_on("2026-07-06")
add(rid, "2026-07-06", "10:00", "看護", "両足首のむくみが前より強い。体重を毎朝測るよう介護職員へ伝える。主治医へ電話で報告し、むくみと体重、息苦しさの様子を見て、変わりがあれば連絡するよう指示。", n)
v = vital(rid, "2026-07-07", "09:05"); n = nurse_on("2026-07-07")
add(rid, "2026-07-07", "09:05", "看護", f"{vtxt(v)}。体重48.8kg（2日で1.4kg増）、両足のむくみが強い。主治医へ報告。今日は横になって休み、明日の朝の様子で受診を決めると指示。", n)
add(rid, "2026-07-07", "10:00", "家族", f"{family(rid)}へ電話。むくみと体重が増えていること、明日受診するかもしれないことを伝える。", n)
day = "2026-07-08"; v = vital(rid, day, "09:05"); n = nurse_on(day)
add(rid, day, "09:05", "特変", f"看護師が状態を確認。{vtxt(v)}、息苦しさの訴えがあり、両足のむくみが強い。体重49.4kg（3日で2.0kg増）。主治医へ連絡し、あおば総合病院を受診するよう指示を受ける。", n)
add(rid, day, "09:15", "家族", f"{family(rid)}へ電話。これから受診することを伝える。病院で合流していただく。", n)
drop_after(rid, day, "09:40")
go_out(rid, day, "09:40", n)
add(rid, day, "12:30", "特変", f"病院の医師から、心不全の悪化のため入院と説明を受けた（{family(rid)}同席）。看護師は13時に施設へ戻る。", n)

# ---------------- 前田 勝（9）2026-10-09〜12 発熱（土日は看護師が休み）→ 受診・入院 ----------------
rid = 9
days = ["2026-10-09", "2026-10-10", "2026-10-11", "2026-10-12"]
drop_generic(rid, set(days))
v = vital(rid, "2026-10-09", "10:00"); n = nurse_on("2026-10-09")
add(rid, "2026-10-09", "09:05", "看護", f"{vtxt(v, False)}。軽い咳がある。主治医へ電話で報告。水分をこまめにとり、体温とSpO2を朝・昼・夕に測るよう指示。土日はオンコールの看護師へ電話で報告するよう介護職員へ伝える。", n)
for dd, hh in (("2026-10-10", "09:05"), ("2026-10-11", "09:25")):
    v = vital(rid, dd, hh); st = care_staff(rid, dd, hh); oc = oncall(dd)
    extra = "息苦しそうなときや、熱が上がり続けるときは救急で受診すると指示。" if dd == "2026-10-11" else ""
    add(rid, dd, hh, "連絡", f"{vtxt(v)}。オンコールの看護師（{oc}）へ電話で報告。看護師が主治医へ連絡し、水分と体温・SpO2の確認を続けるよう指示を受けた。{extra}", st)
add(rid, "2026-10-11", "10:00", "家族", f"{family(rid)}へ電話。熱が3日続いていること、明日の朝に受診するかもしれないことを伝える。", care_staff(rid, "2026-10-11", "10:00"))
day = "2026-10-12"; v = vital(rid, day, "09:36"); n = nurse_on(day)
add(rid, day, "09:36", "特変", f"看護師が状態を確認。{vtxt(v)}、呼吸が速い。主治医へ連絡し、あおば総合病院を受診するよう指示を受ける。", n)
add(rid, day, "09:45", "家族", f"{family(rid)}へ電話。これから受診することを伝える。病院で合流していただく。", n)
drop_after(rid, day, "10:00")
go_out(rid, day, "10:00", n)
add(rid, day, "12:50", "特変", f"病院の医師から、肺炎の疑いで入院と説明を受けた（{family(rid)}同席）。看護師は13時半に施設へ戻る。", n)

if isinstance(d.get("_rev"), int): d["_rev"] += 1
tmp = path + ".tmp_write"
with open(tmp, "w", encoding="utf-8-sig", newline="") as f:
    f.write(json.dumps(d, ensure_ascii=False, separators=(",", ":")))
os.replace(tmp, path)
print("外した記録", removed, "件・足した記録", added, "件")
