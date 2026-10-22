# デモの1年分に、物品の使用（誰に・誰が・何を）と、発注→承認→納品→受け取り の流れを入れる
# あなた「施設で働いてた時は、誰に出したって記載してましたけどね」（手袋・オムツなど）
# - 使った量は、デモの排泄の記録から数える（おむつ交換・パッド交換の回数）。袋・箱を開けたときに「使用」として記録する
#   テープ止めオムツ 20枚/袋（おむつ交換2回に1枚）、尿取りパッド 30枚/袋（交換1回に1枚）、リハビリパンツ 20枚/袋（1日1枚）、
#   手袋 100枚/箱（交換1回に2枚。おむつ・パッドの方は居室に1箱ずつ）、とろみ調整剤 1kg（約25日）、手指消毒用アルコール（各棟10日で1本）
# - 個人請求の品物（オムツ・パッド・とろみ）は、月末の請求の明細（consumptions）にも入る。手袋・アルコールは施設負担（使った記録だけ）
# - 在庫が安全在庫を下回った次の平日に、事務員が発注 → 管理者が承認 → 2平日後に納品、事務員が受け取り
# - 前の版の試しの発注（2026-10 の13件）は入れ替える
# 使い方: python add_supply_demo.py data/portal_database.json （2回当てても同じになる）
import sys, os, json, datetime as DT, collections
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gen_daily as G

path = sys.argv[1]
d = json.load(open(path, encoding="utf-8-sig"))
RES = {int(r["id"]): r for r in d["residents"]}
INV = {int(i["id"]): i for i in d["inventory"]}
BYNAME = {i["name"]: i for i in d["inventory"]}
CLERK, BOSS = "松本 陽子", "木村 健一"
UNIT_NAME = {int(u["id"]): u["name"] for u in d.get("units", [])}
_seq = [1795300000000]
def nid():
    _seq[0] += 1
    return _seq[0]

for i in d["inventory"]:
    if not i.get("normal_stock"): i["normal_stock"] = int(i.get("safety_stock") or 5) * 2
PIECES = {"テープ止めオムツ L": 20, "テープ止めオムツ M": 20, "尿取りパッド": 30, "リハビリパンツ S": 20, "リハビリパンツ M": 20, "リハビリパンツ L": 20,
          "ワイドパッド": 30, "使い捨てプラスチック手袋 M": 100, "使い捨てプラスチック手袋 S": 100, "使い捨てプラスチック手袋 L": 100}

# 排泄の記録から、利用者ごと・日ごとの交換の回数（と、その記録の職員・時刻）
ex = collections.defaultdict(list)
for x in d["excretions"]:
    n = x.get("notes") or ""
    kind = "おむつ" if "おむつ" in n else ("パッド" if "パッド" in n else None)
    if kind: ex[(int(x["resident_id"]), x["date"])].append((x.get("time") or "12:00", x.get("staff_name"), kind))
users = collections.defaultdict(collections.Counter)
for (rid, _), lst in ex.items():
    for _, _, k in lst: users[rid][k] += 1
def is_male(rid): return str(RES[rid].get("gender")) == "1"
def plan(rid):
    """その方が使う品物"""
    c = users.get(rid)
    if not c: return []
    if c["おむつ"] > 0:
        return ["テープ止めオムツ L" if is_male(rid) else "テープ止めオムツ M", "尿取りパッド", "使い捨てプラスチック手袋 L" if is_male(rid) else "使い捨てプラスチック手袋 M"]
    return ["リハビリパンツ L" if is_male(rid) else "リハビリパンツ M", "尿取りパッド", "使い捨てプラスチック手袋 M"]
THICK = [rid for rid, r in RES.items() if "とろみ" in (r.get("diet_type") or "")]

events = []   # (日付, 時刻, 品物名, 利用者 or None, 職員, 数)
used = collections.defaultdict(float)
for day in G.DAYS:
    ds = day.isoformat()
    for rid in sorted(RES):
        lst = sorted(ex.get((rid, ds), []))
        if not lst: continue
        items = plan(rid)
        for (t, st, kind) in lst:
            for it in items:
                if it.startswith("テープ止め"): per = 0.5 if kind == "おむつ" else 0
                elif it == "尿取りパッド": per = 1
                elif it.startswith("リハビリパンツ"): per = 0
                elif it.startswith("使い捨てプラスチック手袋"): per = 2
                else: per = 0
                if not per: continue
                before = used[(rid, it)]
                used[(rid, it)] += per
                if int(before // PIECES[it]) != int(used[(rid, it)] // PIECES[it]) or before == 0:
                    events.append((ds, t, it, rid, st, 1))
        # リハビリパンツは1日1枚（朝の交換のとき）
        for it in items:
            if it.startswith("リハビリパンツ"):
                before = used[(rid, it)]; used[(rid, it)] += 1
                if before == 0 or int(before // PIECES[it]) != int(used[(rid, it)] // PIECES[it]):
                    t, st, _ = lst[0]; events.append((ds, t, it, rid, st, 1))
    for rid in THICK:
        if G.stay(rid, day) == "full" and (day - G.START).days % 25 == 3 + rid % 5:
            events.append((ds, "11:50", "とろみ調整剤 1kg", rid, G.who(int(RES[rid]["unit_id"]), day, "11:50"), 1))
    for unit in (1, 2):
        if (day - G.START).days % 10 == unit * 3:
            events.append((ds, f"09:1{unit}", "手指消毒用アルコール 1L", None, G.who(unit, day, "09:10"), 1))
events.sort()

# 在庫・発注の流れ
stock = {name: int(i["normal_stock"]) for name, i in BYNAME.items()}
pending = {}   # 品物名 → 発注（まだ届いていない）
orders, logs, cons = [], [], []
def biz_after(day, n):
    x = day
    while n > 0:
        x += DT.timedelta(days=1)
        if x.weekday() < 5 and not G.is_newyear(x): n -= 1   # 年末年始（12/29〜1/3）は事務・業者も休み
    return x
by_day = collections.defaultdict(list)
for e in events: by_day[e[0]].append(e)
for day in G.DAYS:
    ds = day.isoformat()
    # 届く日の朝に受け取り
    for name, o in list(pending.items()):
        if o["_arrive"] == ds:
            it = BYNAME[name]; stock[name] += o["quantity"]
            o.update({"status": "納品完了", "received_at": ds, "received_by": CLERK})
            logs.append({"id": nid(), "timestamp": f"{ds} 10:30", "item_id": it["id"], "item_name": name, "action_type": "入庫",
                         "change_qty": o["quantity"], "after_qty": stock[name], "resident_id": None, "resident_name": "",
                         "staff_name": CLERK, "reason": f"発注の納品（{o['ordered_at']} 発注）", "consumption_id": None})
            del pending[name]
    for (_, t, name, rid, st, q) in by_day.get(ds, []):
        it = BYNAME[name]
        stock[name] -= q
        personal = bool(it.get("is_personal_billable")) and rid is not None
        cid = None
        if personal:
            cid = nid()
            cons.append({"id": cid, "consumed_at": f"{ds} {t}", "resident_id": rid, "item_id": it["id"], "item_name": name, "quantity": q,
                         "unit_price": it["unit_price"], "subtotal": it["unit_price"] * q, "staff_name": st, "billing_basis": "品物の設定"})
        logs.append({"id": nid(), "timestamp": f"{ds} {t}", "item_id": it["id"], "item_name": name, "action_type": "消費", "change_qty": -q,
                     "after_qty": stock[name], "resident_id": rid, "resident_name": RES[rid]["name"] if rid else "",
                     "staff_name": st, "reason": "現場ケア時使用" if rid else ("フロア共通（" + UNIT_NAME.get(int(t[-1]), "") + "）"), "consumption_id": cid})
    # 夕方の確かめ: 安全在庫を下回ったら、次の平日に発注
    for name, it in BYNAME.items():
        if name in pending: continue
        if stock[name] <= int(it["safety_stock"]):
            od = day + DT.timedelta(days=1)
            while od.weekday() >= 5 or G.is_newyear(od): od += DT.timedelta(days=1)
            qty = max(1, int(it["normal_stock"]) - stock[name])
            o = {"id": nid(), "ordered_at": od.isoformat(), "order_date": od.isoformat(), "supplier_id": it.get("supplier_id") or 1,
                 "supplier_name": it.get("supplier_name") or "ケアサポート商事", "item_name": name, "quantity": qty, "unit_price": it["unit_price"],
                 "total_price": it["unit_price"] * qty, "reason": f"安全在庫（{it['safety_stock']}{it['unit']}）を下回ったため、平常の数（{it['normal_stock']}{it['unit']}）まで補充（発注時の在庫 {stock[name]}{it['unit']}）",
                 "applicant": CLERK, "status": "承認済", "approver": BOSS, "approved_at": od.isoformat(), "_arrive": biz_after(od, 2).isoformat()}
            orders.append(o); pending[name] = o
# 期間の終わりにまだ届いていない発注は、そのまま（承認済 → 届いたら受け取り）。最後の日に出した発注は申請中にする
for o in orders:
    if o["ordered_at"] > G.REC_END.isoformat():
        o.update({"status": "申請中", "approver": None, "approved_at": None})
    o.pop("_arrive", None)
for name, it in BYNAME.items(): it["current_stock"] = stock[name]
neg = [n for n, s in stock.items() if s < 0]

d["orders"] = sorted(orders, key=lambda o: o["ordered_at"], reverse=True)
d["inventory_logs"] = sorted(logs, key=lambda l: l["timestamp"], reverse=True)
d["consumptions"] = sorted([c for c in (d.get("consumptions") or []) if not str(c.get("id", "")).startswith("17953")] + cons, key=lambda c: c["consumed_at"], reverse=True)
if isinstance(d.get("_rev"), int): d["_rev"] += 1
tmp = path + ".tmp_write"
with open(tmp, "w", encoding="utf-8-sig", newline="") as f:
    f.write(json.dumps(d, ensure_ascii=False, separators=(",", ":")))
os.replace(tmp, path)
print("使用の記録", sum(1 for l in logs if l["action_type"] == "消費"), "件・個人請求", len(cons), "件・発注", len(orders), "件・入庫", sum(1 for l in logs if l["action_type"] == "入庫"), "件")
print("最後の在庫", {n: s for n, s in stock.items()}, "マイナス:", neg)
