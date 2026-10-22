# 業務日誌の「一日の流れ」を、1年分のデモに入れる（daily_schedules。日付つき）
# あなた「業務日誌、一日の流れを記載するところじゃないの？何時にこれやったとか、個人記録並べられても困ると思うわけ」
# 中身はデモの記録から数える（在所の人数・バイタル・入浴・レク・面会・訪問診療・外出・特変・事故）。担当は勤務表の人
# 使い方: python add_daily_schedules.py data/portal_database.json （サーバーを止めてから。2回当てても増えない）
import sys, os, json, datetime as DT, collections
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gen_daily as G

path = sys.argv[1]
d = json.load(open(path, encoding="utf-8-sig"))
RES = {int(r["id"]): r for r in d["residents"]}
UNIT_NAME = {int(u["id"]): u["name"] for u in d.get("units", [])}
_seq = [1795200000000]
def nid():
    _seq[0] += 1
    return _seq[0]
def short(n): return (n or "").split(" ")[0]
def pair(kind, day):
    return "・".join(f"{UNIT_NAME.get(u, '')} {short(G.shift(u, day)[kind])}" for u in (1, 2))

def by_date(col, key="date"):
    m = collections.defaultdict(list)
    for x in d.get(col, []) or []:
        k = (x.get(key) or x.get("recorded_at") or x.get("occurred_at") or "")[:10]
        if k: m[k].append(x)
    return m
VIT = by_date("vitals"); BATH = by_date("baths"); REC = by_date("recreations"); VEH = by_date("vehicle_logs")
VIS = by_date("visitations", "recorded_at"); INC = by_date("incidents", "occurred_at"); CR = by_date("care_records", "recorded_at")

def present(day):
    ds = day.isoformat()
    n = h = 0
    for rid in RES:
        st = G.stay(rid, day) if rid in G.RES else None
        if st in ("full", "am", "pm"): n += 1
        elif any(x["rid"] == rid and DT.date.fromisoformat(x["start"]) < day and (not x["end"] or day < DT.date.fromisoformat(x["end"])) for x in G.HOSP):
            h += 1
    return n, h

# 前に入れた分（この道具で作ったもの）を外してから入れ直す
d["daily_schedules"] = [s for s in (d.get("daily_schedules") or []) if not s.get("demo_flow")]
out = []
def add(day, time, title, content, staff):
    out.append({"id": nid(), "date": day.isoformat(), "time": time, "title": title, "content": content, "staff_name": staff, "demo_flow": True})

for day in G.DAYS:
    ds = day.isoformat()
    n, h = present(day)
    nurse = G.nurse(day)
    add(day, "06:30", "起床・着替え・整容", f"在所 {n}名" + (f"（入院中 {h}名）" if h else "") + "。起床の声かけ、着替え・洗面の介助。", pair("早", day))
    add(day, "07:30", "朝食・朝の服薬・口腔ケア", "食堂で朝食。食後の服薬と口腔ケア。", pair("早", day))
    night = [x for x in CR.get(ds, []) if x.get("category") == "特変" and (x.get("recorded_at") or "")[11:16] < "09:00"]
    add(day, "09:00", "申し送り（夜勤→日勤）", "夜間の様子を申し送り。" + (f"夜間・早朝の特変 {len(night)}件（下の特記）。" if night else "夜間は特に変わりなし。"), pair("夜", day - DT.timedelta(days=1)) + "／" + pair("日", day))
    vs = VIT.get(ds, [])
    am = [v for v in vs if (v.get("time") or "") < "12:00"]
    if am:
        unusual = sum(1 for v in am if v.get("is_unusual"))
        add(day, "09:30", "バイタル測定", f"{len({v['resident_id'] for v in am})}名を測定。" + (f"いつもの範囲を超えた方 {unusual}名（看護師へ報告）。" if unusual else "いつもの範囲を超えた方はなし。"), (short(nurse) + "（看護師）・" if nurse else "") + pair("日", day))
    for v in VEH.get(ds, []):
        add(day, "10:00", "外出・送迎", f"{v.get('purpose')}（{v.get('vehicle_name')}、{v.get('distance_km')}km）。", short(v.get("driver_name")))
    for r in REC.get(ds, []):
        add(day, "10:30" if r.get("program_type") != "季節行事・イベント" else "14:00", "レク・行事: " + (r.get("title") or ""), f"{r.get('content') or ''}", short(r.get("staff_name")))
    add(day, "12:00", "昼食・昼の服薬", "食堂で昼食。食後の服薬。", pair("日", day))
    doc = [x for x in CR.get(ds, []) if "訪問診療" in (x.get("content") or "")]
    if doc:
        add(day, "13:30", "訪問診療", f"主治医の訪問診療（{len(doc)}名）。結果は各利用者の記録。", short(nurse) + "（看護師）" if nurse else "看護師")
    bs = BATH.get(ds, [])
    done = [b for b in bs if b.get("bath_type") not in ("見合わせ", "清拭")]
    if bs:
        sp = sum(1 for b in done if b.get("bath_type") == "特浴")
        stop = len(bs) - len(done)
        add(day, "14:00", "入浴", f"入浴 {len(done)}名" + (f"（機械浴 {sp}名）" if sp else "") + (f"、見合わせ・清拭 {stop}名" if stop else "") + "。", pair("日", day))
    elif G.is_newyear(day):
        add(day, "14:00", "入浴", "年末年始のため入浴なし。", pair("日", day))
    vis = VIS.get(ds, [])
    if vis:
        add(day, "14:30", "面会", f"ご家族の面会 {len(vis)}件。差し入れは各利用者の記録。", "・".join(sorted({short(v.get("staff_name")) for v in vis if v.get("staff_name")})))
    for hp in G.HOSP:
        rn = short(RES[hp["rid"]]["name"])
        if hp["start"] == ds:
            go = [x for x in CR.get(ds, []) if int(x.get("resident_id") or 0) == hp["rid"] and x.get("category") in ("連絡", "特変") and ("出発" in (x.get("content") or "") or "搬送" in (x.get("content") or ""))]
            t = (go[0]["recorded_at"][11:16]) if go else "10:00"
            add(day, t, "受診・入院", f"{rn}様、{hp['hospital']}へ。そのまま入院（経過は個人記録）。", short(go[0]["staff_name"]) if go else "")
        if hp["end"] == ds:
            add(day, "14:00", "退院", f"{rn}様、{hp['hospital']}から退院し帰所。", short(nurse) + "（看護師）" if nurse else "")
    for rid, r in RES.items():
        if r.get("admission_date") == ds and ds > G.DAYS[0].isoformat():
            add(day, "14:00", "入居", f"{short(r['name'])}様が入居。", pair("日", day))
    add(day, "15:00", "おやつ・水分補給", "おやつと飲み物。", pair("日", day))
    for i in INC.get(ds, []):
        rn = RES.get(int(i.get("resident_id") or 0), {}).get("name", "")
        add(day, (i.get("occurred_at") or "")[11:16] or "00:00", i.get("report_type") or "事故・ヒヤリハット", f"{short(rn)}様（{i.get('place') or ''}）。報告書あり。", short(i.get("staff_name")))
    add(day, "16:30", "申し送り（日勤→遅番・夜勤）", "日中の様子を申し送り。", pair("日", day) + "／" + pair("遅", day))
    add(day, "18:00", "夕食・夕の服薬・口腔ケア", "食堂で夕食。食後の服薬と口腔ケア。", pair("遅", day))
    add(day, "20:30", "就寝介助", "着替え・トイレ・就寝前の服薬。", pair("遅", day) + "／" + pair("夜", day))
    add(day, "22:00", "夜間巡視（2時間ごと）", "居室を回って様子を確かめる。体位変換の必要な方は2時間ごと。", pair("夜", day))

d["daily_schedules"] += out
if isinstance(d.get("_rev"), int): d["_rev"] += 1
tmp = path + ".tmp_write"
with open(tmp, "w", encoding="utf-8-sig", newline="") as f:
    f.write(json.dumps(d, ensure_ascii=False, separators=(",", ":")))
os.replace(tmp, path)
print("一日の流れ:", len(out), "件（", G.DAYS[0], "〜", G.DAYS[-1], "）")
