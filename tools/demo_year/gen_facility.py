# 1年分デモ: ホーム全体の記録（レク・委員会・訓練・連絡ノート・お知らせ・事故・車両・面会・予防接種・預り金・サマリーなど）
import datetime as DT, random, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import roster, gen_daily as G

RES = G.RES
def present_count(d, unit=None):
    return sum(1 for r in roster.R if (unit is None or r["unit_id"] == unit) and G.here(r["id"], d, "14:00"))
def present(d, unit=None):
    return [r for r in roster.R if (unit is None or r["unit_id"] == unit) and G.here(r["id"], d, "14:00")]
def first(name): return name.split()[0] + "様"

def generate():
    rng = random.Random(77)
    o = {k: [] for k in ["recreations", "committees", "fire_drills", "notebooks", "monthly_notices", "incidents", "vehicle_logs",
                         "visitations", "vaccines", "deposits", "consumptions", "care_summaries", "complaints", "care_records_extra"]}
    nid = G.nid
    # ---------------- レク（週2回・行事の日） ----------------
    REC = [("機能訓練体操", "いきいき体操", ["椅子に座ったまま、足踏み・腕回し・グーパー体操。", "タオルを使った体操。肩の高さまで上げる。", "ボールを使って握る・投げる体操。"]),
           ("音楽療法・合唱", "歌の時間", ["季節の唱歌を歌う。", "童謡と演歌を交互に。手拍子で参加される方も。", "鈴やカスタネットで合奏。"]),
           ("脳トレ・クイズ", "ことばあそび", ["ことわざの続きを当てるクイズ。", "都道府県の名物クイズ。", "昔の道具の名前当て。"]),
           ("工作・手芸・絵画", "季節の飾りづくり", ["季節の壁飾りをちぎり絵で作る。", "折り紙で季節の花を折る。", "塗り絵を飾って作品展。"]),
           ("喫茶・リラックス", "ひだまり喫茶", ["ホットケーキを焼いて喫茶。", "コーヒーと紅茶を選んで喫茶。", "季節の和菓子でお茶会。"]),
           ("園芸・屋外散歩", "お散歩と花の手入れ", ["プランターの花に水やり、花がら摘み。", "近くの公園まで散歩（車いすの方も一緒に）。", "ミニトマトの収穫。"])]
    EVT = {(1, 2): ("新年会", "お正月の歌と福笑い。甘酒で乾杯。"), (2, 3): ("節分", "ボールを使った豆まき。鬼のお面の職員に大笑い。"),
           (3, 3): ("ひな祭り", "ひな人形を飾り、ちらし寿司の昼食。"), (4, 6): ("お花見", "近くの公園で桜を見ながらおやつ。"),
           (5, 5): ("こどもの日", "こいのぼりを作り、柏餅を召し上がる。"), (7, 7): ("七夕", "短冊に願いごとを書き、笹に飾る。"),
           (8, 15): ("夏祭り", "輪投げ・ヨーヨーすくい・盆踊り。ご家族も参加。"), (9, 15): ("敬老会", "ご家族を招いてお祝い膳。記念写真。"),
           (10, 10): ("運動会", "玉入れ・パン食い競争（お菓子）。紅白に分かれて応援。"), (12, 24): ("クリスマス会", "ハンドベル演奏とケーキ。")}
    for d in G.DAYS:
        ev = EVT.get((d.month, d.day))
        if ev:
            n = present_count(d)
            o["recreations"].append({"id": nid(), "date": d.isoformat(), "program_type": "季節行事・イベント", "title": ev[0], "participants_count": n,
                                     "content": f"{ev[1]}（参加{n}名・入院中の方を除く全員）", "reaction": rng.choice(["笑顔が多く、ふだん話さない方も声を出しておられた。", "ご家族からも喜びの声。", "疲れた方は途中で休憩しながら参加。"]),
                                     "notes": "", "staff_name": G.shift(1, d)["日"]})
            continue
        if d.weekday() in (1, 4):
            for unit in (1, 2):
                kind = REC[(d.toordinal() // 3 + unit) % len(REC)]
                ps = present(d, unit)
                part = [p for p in ps if p["t"]["mob"] != "寝たきり" and not G.ill_level(p["id"], d)]
                n = max(0, len(part) - rng.randint(0, 2))
                if n == 0: continue
                o["recreations"].append({"id": nid(), "date": d.isoformat(), "program_type": kind[0], "title": f"{kind[1]}（{'東棟' if unit == 1 else '西棟'}）",
                                         "participants_count": n, "content": f"{rng.choice(kind[2])}参加{n}名。",
                                         "reaction": rng.choice(["楽しそうに参加されていた。", "途中で休憩を入れながら。", "ほかの方に教える姿が見られた。", "集中して取り組まれた。"]),
                                         "notes": "", "staff_name": G.shift(unit, d)["日"]})
    # ---------------- 委員会・研修 ----------------
    COM = []
    def com(date, cat, name, att, agenda, content):
        o["committees"].append({"id": nid(), "date": date, "category": cat, "committee_name": name, "attendees": att, "agenda": agenda, "content": content})
    ATT = "木村 健一、山田 孝之、吉田 誠、鈴木 美智子、小林 恵子、佐々木 浩二"
    for ym, ag, ct in [("2025-12-16", "センサーマットの使い方の見直し", "夜間に離床センサーマットを使っている3名について、本人の動きを妨げていないか確認。身体拘束にはあたらないが、目的と使う時間を記録に残すことを確認した。"),
                       ("2026-03-17", "スピーチロック（言葉による行動の制限）の防止", "「ちょっと待って」を言いかえる例を出し合った。緊急やむを得ない場合の三つの要件（切迫性・非代替性・一時性）と手続きを再確認。"),
                       ("2026-06-16", "ベッド柵の使い方", "ベッド柵で囲むことが身体拘束にあたる場合を確認。現在4本柵の方はいない。"),
                       ("2026-09-15", "1年のふりかえり", "今年度、身体拘束は0件。センサーマットの使用は2名に減った。")]:
        com(ym, "法定委員会", "身体拘束適正化委員会", ATT, ag, ct)
    for ym, ag, ct in [("2025-11-11", "冬の感染症への備え", "インフルエンザ・ノロウイルスの流行期に向け、手洗い・換気・嘔吐物の処理の手順を確認。処理セットの置き場所を全職員に周知。"),
                       ("2026-01-13", "インフルエンザの発生（1名）の振り返り", "西棟で1名がインフルエンザの診断。主治医の指示のもと居室で過ごしていただき、ほかの方への広がりはなかった。早く気づけた点（朝のバイタル）を共有。"),
                       ("2026-05-12", "夏の脱水・熱中症の予防", "水分の目安と、おやつの時間の水分のすすめ方を確認。居室の温度・湿度を1日2回確かめる。"),
                       ("2026-09-08", "秋冬の予防接種の予定", "インフルエンザの予防接種の同意書をご家族へ送る。")]:
        com(ym, "法定委員会", "感染症対策委員会", ATT, ag, ct)
    com("2025-12-09", "法定委員会", "事故防止委員会", ATT, "夜間の転倒（104号室）の振り返り", "夜中にトイレへ行こうとして転倒。センサーマットが鳴る前に立ち上がっていた。ベッドの位置・足元の明かり・トイレへの声かけの時間を見直した。")
    com("2026-04-14", "法定委員会", "虐待防止委員会", ATT, "不適切なケアの芽に気づく", "チェックリストで自分のケアをふりかえった。気になる言葉づかいを話し合い、困ったときに相談できる仕組みを確認。")
    com("2026-04-21", "施設内研修", "虐待防止研修", "全職員（2回に分けて実施）", "高齢者虐待防止法と通報の義務", "虐待の種類と、気づいたときの相談・通報の流れを学んだ。")
    com("2026-07-14", "施設内研修", "認知症ケア研修", "全職員（2回に分けて実施）", "夕方に落ち着かなくなる方への対応", "事例をもとに、話を聞く・役割をお願いする・一緒に歩くなどの方法を話し合った。")
    com("2026-02-10", "外部研修", "看取りケア研修（市の研修）", "鈴木 美智子、山田 孝之", "看取りの時期のケアとご家族への支援", "研修で学んだことを職員会議で報告した。")
    # ---------------- 避難訓練 ----------------
    for dt_, typ, scen, n in [("2025-11-20", "昼間想定 避難・消火訓練", "東棟の台所からの出火を想定。全員の避難が4分30秒で完了。", 16),
                              ("2026-02-19", "夜間想定 通報・避難訓練", "夜勤2名を想定し、西棟の居室からの出火。通報と、近い方から順に避難。避難完了7分10秒。課題: 車いすの方の移動の順番。", 15),
                              ("2026-05-21", "昼間想定 避難・消火訓練（消防署立ち会い）", "消防署の方に来ていただき、消火器の使い方を練習。避難完了4分05秒。", 17),
                              ("2026-08-27", "地震想定 避難訓練", "地震のあと火災が起きた想定。まず身を守り、その後に避難。", 17)]:
        o["fire_drills"].append({"id": nid(), "date": dt_, "drill_type": typ, "participants_count": n, "duration": "", "scenario": scen,
                                 "notes": "入院中の方を除く利用者が参加（職員が付き添い）。", "reported_to_fire_dept": 1, "supervisor": "木村 健一"})
    # ---------------- 連絡ノート ----------------
    NB = ["{n}（{room}号室）のご家族から、{item}の差し入れ。居室のたんすへ。", "{n}（{room}号室）の{thing}が少なくなっています。ご家族へ連絡済み。",
          "明日は{n}（{room}号室）の受診日です。9時半に出発。看護師が付き添います。", "{n}（{room}号室）の補聴器の電池を交換しました。" ,
          "{n}（{room}号室）、昨夜は寝つきが悪かったので、日中の様子を見てください。", "洗濯機の調子が悪いので、業者に連絡しました。",
          "来週の水曜は訪問理美容です。希望の方の名前を表に書いてください。", "{n}（{room}号室）のご家族へ、敬老会の案内を送りました。"]
    ITEMS = ["冬物の衣類", "おやつ", "肌着", "写真立て", "好きな飲み物", "新しい靴"]
    THINGS = ["ティッシュ", "歯みがき粉", "ボディソープ", "肌着"]
    stfs = ["木村 健一", "山田 孝之", "吉田 誠", "佐藤 健太", "三浦 拓也", "鈴木 美智子"]
    for d in G.DAYS:
        if d.weekday() not in (0, 2, 4) or rng.random() < 0.3: continue
        ps = present(d)
        if not ps: continue
        p = rng.choice(ps)
        tx = rng.choice(NB).format(n=first(p["name"]), room=p["room_no"], item=rng.choice(ITEMS), thing=rng.choice(THINGS))
        if "補聴器" in tx and not p["t"].get("deaf"): tx = f"{first(p['name'])}（{p['room_no']}号室）の居室の電球を交換しました。"
        st = rng.choice(stfs)
        conf = rng.sample([s for s in G.STAFF_UNIT[1] + G.STAFF_UNIT[2]], 3)
        done = d < G.REC_END - DT.timedelta(days=3)
        o["notebooks"].append({"id": nid(), "date": d.isoformat(), "category": "申し送り", "content": tx, "status": "完了" if done else "未対応",
                               "staff_name": st, "resolved_staff": st if done else "", "confirmed_staff": conf if done else conf[:1],
                               "confirmed_versions": {c: f"{d.isoformat()} 1{i}:00" for i, c in enumerate(conf if done else conf[:1])}})
    # ---------------- 月のお知らせ ----------------
    NOTICE = {1: ("1月の感染対策について", "インフルエンザが流行しています。出勤前の体温測定と、居室に入る前後の手洗いを徹底してください。"),
              2: ("夜間想定の避難訓練", "2月19日に夜間想定の避難訓練を行います。夜勤者は参加してください。"),
              3: ("年度末の書類の確認", "3月末までに、研修の受講記録とケアプランの見直しをすませてください。"),
              4: ("新年度の体制について", "4月から西棟のユニットリーダーは吉田さんです。"),
              5: ("新しく入居される方", "5月18日に203号室へ新しい方が入居されます。入居前の情報は看護師から説明します。"),
              6: ("梅雨どきの衛生", "食品の保管と、ふきんの消毒を徹底してください。"),
              7: ("熱中症の予防", "居室の温度・湿度を1日2回確かめ、おやつの時間に水分をすすめてください。"),
              8: ("夏祭りの準備", "8月15日の夏祭りの係を表に書いてください。"),
              9: ("敬老会について", "9月15日はご家族を招いて敬老会です。お祝い膳の形は看護師と相談済み。"),
              10: ("予防接種の同意書", "インフルエンザの予防接種の同意書が届いた方から、事務へ渡してください。"),
              11: ("冬の感染症への備え", "嘔吐物の処理セットの置き場所を確かめてください。"),
              12: ("年末年始の勤務", "年末年始の勤務表を確かめてください。大みそかは年越しそばです。")}
    for d in G.DAYS:
        if d.day == 1 or d == G.START:
            t_, c_ = NOTICE[d.month]
            o["monthly_notices"].append({"id": nid(), "month": d.isoformat()[:7], "priority": "重要" if d.month in (1, 5, 7) else "通常",
                                         "title": f"{d.month}月 {t_}", "content": c_, "staff_name": "木村 健一", "created_at": f"{d.isoformat()} 09:00",
                                         "confirmed_staff": rng.sample(G.STAFF_UNIT[1] + G.STAFF_UNIT[2], 9 if d < G.REC_END - DT.timedelta(days=10) else 3)})
    # ---------------- 事故・ヒヤリハット ----------------
    INC = [
        ("事故報告書", "2025-12-03 02:40", 6, "居室 (ベッドサイド)", "2時40分、センサーマットの音で訪室すると、ベッドの横で床に座り込んでおられた。右の脚の付け根を痛がり、立てない。看護師へ電話し、主治医の指示で救急車を呼んだ。病院で右大腿骨の骨折と分かり、そのまま入院。",
         "【本人】夜中にトイレへ行こうとして、杖を持たずに立ち上がった。\n【環境】足元の明かりがついていなかった。センサーマットが鳴る前に立ち上がっていた。", "1. 足元の明かりを夜通しつける。\n2. 0時と3時にトイレの声かけをする。\n3. センサーマットの位置をベッドの端に近づける。", "夜間の発見から通報までの対応は適切だった。再発防止策を事故防止委員会で確認すること。"),
        ("ヒヤリハット", "2026-01-18 22:15", 1, "居室 (ベッドサイド)", "センサーマットが鳴り訪室。歩行器を使わずに立ち上がろうとしてふらついたところを、職員が支えた。けがなし。",
         "【本人】夜中に目を覚まし、トイレへ急いだ。\n【環境】歩行器がベッドから少し離れていた。", "1. 寝る前に歩行器をベッドの手の届く所に置く。\n2. 「トイレのときはボタンを押してください」と寝る前に伝える。", "未然に防げた。歩行器の置き場所を申し送りで徹底すること。"),
        ("ヒヤリハット", "2026-03-22 08:05", 10, "食堂", "朝食のため立ち上がった直後にふらつき、職員が支えた。けがなし。",
         "【本人】起立性低血圧があり、急に立ち上がった。", "1. 立つ前にいったん座って足踏みをしてもらう。\n2. 立ち上がりはそばで見守る。", "立ち上がりの見守りを続けること。"),
        ("ヒヤリハット", "2026-06-10 12:20", 14, "食堂", "昼食中、口いっぱいにご飯を入れてむせた。背中をさすり、落ち着かれた。看護師が確認し、呼吸の音に問題なし。",
         "【本人】食べるのが早い。\n【ケア】職員がほかの方の介助をしていて、目が離れた。", "1. 小さめのスプーンを使う。\n2. 席を職員の近くにする。", "看護師の確認まで適切。見守りの席の配置を見直すこと。"),
        ("ヒヤリハット", "2026-08-21 18:35", 13, "食堂", "夕食後の薬を配るとき、となりの方の袋を渡しかけた。名前を読み上げたときに気づき、渡さなかった。",
         "【ケア】2人分の袋を同時に持っていた。", "1. 袋は1人分ずつ持つ。\n2. 名前・日付・時間を声に出して確かめる。", "確認の手順を全職員に再周知すること。"),
        ("ヒヤリハット", "2026-10-02 15:10", 16, "廊下", "車いすで移動中、足がフットレストから落ちかけた。職員が気づいて止めた。けがなし。",
         "【ケア】フットレストに足が乗っているか、動かす前に確かめていなかった。", "1. 動かす前に足の位置を声に出して確かめる。", "基本の確認を徹底すること。"),
    ]
    for (typ, at, rid, place, sit, cause, prev, comment) in INC:
        r = RES[rid]
        o["incidents"].append({"id": nid(), "report_type": typ, "occurred_at": at, "resident_id": rid, "place": place, "situation": sit, "cause": cause,
                               "prevention": prev, "supervisor_comment": comment + "（管理者：木村 健一）", "status": "承認済",
                               "staff_name": G.who(r["unit_id"], DT.date.fromisoformat(at[:10]), at[11:16]), "injury_pins": []})
    # ---------------- 車両の記録（受診・買い物） ----------------
    km = 12000
    for d in G.DAYS:
        if d.weekday() in (1, 3) and rng.random() < 0.6:
            dist = rng.randint(8, 26)
            o["vehicle_logs"].append({"id": nid(), "date": d.isoformat(), "vehicle_name": "キャラバン1号", "driver_name": rng.choice(["山田 孝之", "吉田 誠", "佐々木 浩二"]),
                                      "purpose": rng.choice(["通院の付き添い（眼科）", "通院の付き添い（歯科）", "日用品の買い出し", "通院の付き添い（整形外科）", "散歩・外出（公園）"]),
                                      "start_km": km, "end_km": km + dist, "distance_km": dist, "key_returned": 1, "notes": ""})
            km += dist
    # ---------------- 面会（差し入れ） ----------------
    for d in G.DAYS:
        for r in present(d):
            if rng.random() < 0.012:
                who_ = r["emergency_contact"].split("・")[0]
                items = rng.choice(["季節の衣類", "おやつ（せんべい）", "果物", "肌着", "写真"])
                st = G.who(r["unit_id"], d, "14:30")
                o["visitations"].append({"id": nid(), "recorded_at": f"{d.isoformat()} 14:30", "resident_id": r["id"], "visitor_name": who_, "items": items,
                                         "storage_place": rng.choice(["居室のたんす", "事務所の冷蔵庫（名前を書いて）", "居室の棚"]), "notes": "", "staff_name": st})
                o["care_records_extra"].append({"id": nid(), "recorded_at": f"{d.isoformat()} 14:31", "resident_id": r["id"], "category": "面会",
                                                "content": f"ご面会 ({who_}様)。持参品: {items}。", "staff_name": st})
    # ---------------- 予防接種 ----------------
    for r in roster.R:
        dd = DT.date(2025, 11, 12)
        if G.stay(r["id"], dd):
            o["vaccines"].append({"id": nid(), "resident_id": r["id"], "vaccine_name": "季節性インフルエンザ", "dose": "1回目", "consent": "同意受領済",
                                  "date": "2025-11-12", "doctor": "ひだまり内科クリニック", "lot": "", "reactions": "なし", "status": "接種済"})
        if G.stay(r["id"], G.END) or r["id"] == 19:
            o["vaccines"].append({"id": nid(), "resident_id": r["id"], "vaccine_name": "季節性インフルエンザ", "dose": "1回目",
                                  "consent": "同意受領済" if r["id"] % 3 else "未返送 (確認中)", "date": "2026-11-11", "doctor": "ひだまり内科クリニック",
                                  "lot": "", "reactions": "", "status": "予定"})
    # ---------------- 預り金（訪問理美容・買い物） ----------------
    bal = {r["id"]: 0 for r in roster.R}
    for d in G.DAYS:
        for r in roster.R:
            if d.day == 1 and G.stay(r["id"], d):
                if bal[r["id"]] < 5000:
                    bal[r["id"]] += 10000
                    o["deposits"].append({"id": nid(), "date": d.isoformat(), "resident_id": r["id"], "type": "入金", "category": "預かり補充", "amount": 10000,
                                          "balance": bal[r["id"]], "notes": "ご家族より", "staff_name": "松本 陽子"})
            if d.day == 18 and d.month % 2 == 0 and G.here(r["id"], d, "10:00"):
                bal[r["id"]] -= 1500
                o["deposits"].append({"id": nid(), "date": d.isoformat(), "resident_id": r["id"], "type": "出金", "category": "訪問理美容代", "amount": 1500,
                                      "balance": bal[r["id"]], "notes": "カット", "staff_name": "松本 陽子"})
    # ---------------- 介護サマリー（1人1件。入院した方は退院後に新しく作る） ----------------
    MOB = {"独歩": "歩くのは自分でできる", "杖": "杖で歩く（見守り）", "歩行器": "歩行器で歩く（見守り）", "シルバーカー": "シルバーカーで歩く",
           "見守り歩行": "そばで見守って歩く（立ち上がり直後に注意）", "車いす": "車いす（移るときは介助）", "寝たきり": "ベッドの上で過ごす（体の向きは介助）"}
    TOI = {"自立": "トイレは自分で行ける", "誘導": "声をかけてトイレへ誘導", "おむつ": "おむつを使用（交換は介助）"}
    EAT = {"自立": "自分で食べられる", "見守り": "見守りで食べる（ひと口の量に注意）", "一部介助": "途中から介助", "全介助": "全部介助（飲み込みを確かめながら）"}
    def bpsd(t):
        x = []
        if t.get("sundown"): x.append("夕方に「家に帰る」など落ち着かなくなることがある。話を聞き、役割をお願いすると落ち着く。")
        if t.get("anxious"): x.append("物の置き場所を気にして「財布がない」と探すことがある。一緒に探すと安心される。")
        if t.get("ftd"): x.append("決まった席・日課へのこだわりが強い。いつもの流れを崩さないようにする。")
        if t.get("lewy"): x.append("ないものが見えると話すことがある。否定せずに話を聞き、明かりをつける。")
        if t.get("newcomer"): x.append("入居まもない時期は不安が強かった。")
        return "".join(x) or "大きな混乱は少ない。"
    def summary(r, created, kind, prev_id, extra=""):
        t = r["t"]
        sid = nid()
        o["care_summaries"].append({
            "id": sid, "resident_id": r["id"], "summary_type": kind, "created_at": f"{created} 15:00", "updated_at": f"{created} 15:00",
            "staff_name": "小林 恵子", "previous_id": prev_id,
            "basic_info": f"{r['care_level']}。生年月日: {r['birth_date']}。入居日: {r['admission_date']}。キーパーソン: {r['emergency_contact']}。",
            "background": r["life_history"], "family_info": r["family_wishes"],
            "physical_cognitive": f"病名: {r['diseases']}。{r['paralysis']}。" + extra,
            "adl": f"移動: {MOB[t['mob']]}。排泄: {TOI[t['toilet']]}。食事: {EAT[t['eat']]}。入浴: {'機械浴' if t['bath'] == '特浴' else '一般浴（見守り・一部介助）'}。",
            "meals_hydration": f"食事の形: {r['diet_type']}。" + ("水分は1日1,000mlまで（主治医の指示）。" if r["id"] == 2 else "水分は1日1,200〜1,500mlを目安にすすめる。"),
            "excretion": TOI[t["toilet"]] + "。" + ("便秘がちで、3日出ないときは看護師の指示で頓服を使う。" if t.get("constip") else "排便はおおむね1〜2日に1回。"),
            "sleep": t["night"] + "。", "dementia_behavior": bpsd(t),
            "medical_care": r["dr_instructions"], "meds": "、".join(m[0] for m in r["rx"]) + "（詳しくは処方薬の一覧）",
            "care_notes": r["care_plan_goal"], "future_goals": r["care_plan_goal"]})
        return sid
    for r in roster.R:
        sid = summary(r, max(r["admission_date"], "2025-10-20"), "定期", None)
        for h in roster.HOSP:
            if h["rid"] == r["id"] and h["end"]:
                summary(r, h["end"], "退院後", sid, f"{h['start']}〜{h['end']} {h['hospital']}に入院（{h['reason']}）。退院後は様子をこまめに確かめる。")
    # ---------------- 苦情・要望 ----------------
    o["complaints"].append({"id": nid(), "received_at": "2026-02-14", "claimant": "ご家族（208号室）", "resident_id": 17,
                            "content": "母の名前を書いたカーディガンが見当たらない。", "investigation": "洗濯の仕分けで、ほかの方の棚に入っていた。",
                            "improvement_plan": "洗濯物は居室ごとのかごに分け、たたむときに名前を確かめる。", "reported_at": "2026-02-16", "status": "完了", "staff_name": "佐々木 浩二"})
    return o

if __name__ == "__main__":
    o = generate()
    for k, v in o.items(): print(k, len(v))
