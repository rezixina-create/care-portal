# 1年分デモ: 毎日の記録を作る（利用者ごとの特徴・季節・出来事から文章を組み立てる）
import datetime as DT, random, json, math, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import roster

START = DT.date(2025, 10, 18)
END = DT.date(2026, 10, 17)
# 記録を作る最後の日。ふだんは END と同じ。発表の日まで延ばすとき（extend_demo.py）は CP_DEMO_TO で前の日まで
# 勤務表（ROSTER）は END のまま（前から入っている 2027-02 までの勤務表と同じ人が記録を書くように）
REC_END = DT.date.fromisoformat(os.environ["CP_DEMO_TO"]) if os.environ.get("CP_DEMO_TO") else END
DAYS = [(START + DT.timedelta(days=i)) for i in range((REC_END - START).days + 1)]
# 勤務表だけ先まで作る（加算・減算の確認用。発表 2026-12-07・2027-02 上旬まで）
ROSTER_END = DT.date(2027, 2, 28)
ROSTER_DAYS = [(START + DT.timedelta(days=i)) for i in range((ROSTER_END - START).days + 1)]
# 行事の日は職員全員参加: 夜勤・明け以外は全員「日」（gen_facility の行事と同じ日。新年会 1/2 は年始で人が少ないので入れない）
STAFF_EVENT_DAYS = {(2, 3), (3, 3), (4, 6), (5, 5), (7, 7), (8, 15), (9, 15), (10, 10), (12, 24)}
def is_staff_event(d): return (d.month, d.day) in STAFF_EVENT_DAYS
# 年末年始（12/29〜1/3）: 介護職はぎりぎりの人数で回し、入浴はしない。事務・看護は休み（看護師はオンコール）
def is_newyear(d): return (d.month == 12 and d.day >= 29) or (d.month == 1 and d.day <= 3)
# 年末年始（END より後だけ）: 介護職員は1人1日、12/30〜1/4 のどこかを希望休に。事務・看護は 12/29〜1/3 休み
def hope_offs():
    """END より後の希望休 {(名前, 日付): 理由}"""
    out = {}
    # 1人1日ずつ、12/30・12/31・1/1・1/3・1/4 に順に割り振る（1日に休める人数には限りがあるため。1/2 は新年会で全員出る）
    ny = [DT.date(2026, 12, 30), DT.date(2026, 12, 31), DT.date(2027, 1, 1), DT.date(2027, 1, 3), DT.date(2027, 1, 4)]
    for unit, members in STAFF_UNIT.items():
        for i, m in enumerate(members):
            out[(m, ny[(i + unit) % len(ny)])] = "年末年始の休み"
    out[("小林 亮", DT.date(2026, 10, 25))] = "冠婚葬祭"   # 前から入っている希望休
    return out
RES = {r["id"]: r for r in roster.R}

def ds(d): return d.isoformat()
def parse(s): return DT.date.fromisoformat(s)

# ---------- いる・いない ----------
HOSP = roster.HOSP
DIS = {x["rid"]: x for x in roster.DISCHARGE}
def stay(rid, d):
    """その日の在所: 'full'=1日中いる, 'am'=午前だけ（入院・退所の日）, 'pm'=午後から（退院の日・入居の日）, None=いない"""
    r = RES[rid]
    if d < parse(r["admission_date"]): return None
    if rid in DIS:
        dd = parse(DIS[rid]["date"])
        if d > dd: return None
        if d == dd: return "am"
    for h in HOSP:
        if h["rid"] != rid: continue
        s = parse(h["start"]); e = parse(h["end"]) if h["end"] else None
        if d == s: return "am"
        if s < d and (e is None or d < e): return None
        if e and d == e: return "pm"
    if d == parse(r["admission_date"]): return "pm"
    return "full"
def here(rid, d, hhmm):
    st = stay(rid, d)
    if st is None: return False
    if st == "am": return hhmm < "10:30"
    if st == "pm": return hhmm >= "14:00"
    return True

# ---------- 職員 ----------
STAFF_UNIT = {1: ["山田 孝之", "伊藤 翔太", "井上 蓮", "高橋 直樹", "佐藤 健太", "小林 亮", "松田 健二", "清水 翔平"],
              2: ["吉田 誠", "三浦 拓也", "斉藤 翼", "石川 太陽", "中村 大輔", "渡辺 拓也", "野村 拓海"]}
NURSES = ["鈴木 美智子", "加藤 由美"]
_shift_cache = {}
def _build_roster():
    """区分ごとに、毎日 早・日・遅・夜 を1人ずつ。夜勤の次の日は「明」、その次は休みを優先。働く日数をそろえる"""
    for unit, members in STAFF_UNIT.items():
        rr = random.Random(f"roster{unit}")
        worked = {m: 0 for m in members}
        nights = {m: 0 for m in members}
        prev = {}      # 前の日の勤務
        prev2 = {}
        hopes = hope_offs()
        for d in [START - DT.timedelta(days=1)] + ROSTER_DAYS:
            future = d > END
            ake = [m for m in members if prev.get(m) == "夜"]
            free = [m for m in members if m not in ake]
            # 明けの次の日は休み、遅番の次の日は早番にしない
            def score(m, kind):
                sc = worked[m] * 10 + rr.random()
                if kind == "夜": sc += nights[m] * 40
                if prev2.get(m) == "夜": sc += 100
                if kind == "早" and prev.get(m) == "遅": sc += 50
                if kind == "夜" and prev.get(m) in ("夜",): sc += 100
                return sc
            today = {m: "休" for m in members}
            for m in ake: today[m] = "明"
            for kind in ("夜", "早", "遅", "日"):
                cand = sorted([m for m in free if today[m] == "休"], key=lambda m: score(m, kind))
                if future:
                    ok_c = [m for m in cand if (m, d) not in hopes and not (kind == "夜" and (m, d + DT.timedelta(days=1)) in hopes)]
                    if ok_c: cand = ok_c
                if not cand: continue
                today[cand[0]] = kind; worked[cand[0]] += 1
                if kind == "夜": nights[cand[0]] += 1
            _shift_cache[(unit, d)] = {v: k for k, v in today.items() if v in ("早", "日", "遅", "夜")}
            shown = dict(today)
            if is_staff_event(d):
                for m, v in today.items():
                    if v in ("休", "早", "遅"):
                        shown[m] = "日"
                        if future and v == "休": worked[m] += 1   # 先の月は、行事で出た分を後の休みで調整
            _shift_cache[("all", unit, d)] = shown
            prev2, prev = prev, today
def shift(unit, d):
    if not _shift_cache: _build_roster()
    if (unit, d) not in _shift_cache:
        return {"早": STAFF_UNIT[unit][0], "日": STAFF_UNIT[unit][1], "遅": STAFF_UNIT[unit][2], "夜": STAFF_UNIT[unit][3]}
    return _shift_cache[(unit, d)]
OFFICE_STAFF = {"木村 健一": "平日", "佐々木 浩二": "平日", "小林 恵子": "平日", "鈴木 美智子": "平日", "加藤 由美": "平日", "松本 陽子": "平日", "田中 慎一": "月水金"}
def monthly_shifts():
    """記録を書いた職員と同じ勤務表（2025-10〜2027-02。行事の日は夜勤・明け以外が全員「日」）"""
    if not _shift_cache: _build_roster()
    out = {}
    for d in ROSTER_DAYS:
        ym = d.isoformat()[:7]; day = str(d.day)
        mo = out.setdefault(ym, {})
        for unit in STAFF_UNIT:
            for m, v in _shift_cache[("all", unit, d)].items():
                mo.setdefault(m, {})[day] = v
        for m, pat in OFFICE_STAFF.items():
            wd = d.weekday()
            on = (wd < 5) if pat == "平日" else (wd in (0, 2, 4))
            if d > END and is_newyear(d): on = False
            if is_staff_event(d): on = True
            mo.setdefault(m, {})[day] = "日" if on else "休"
    return out
def who(unit, d, hhmm):
    if hhmm < "07:00": return shift(unit, d - DT.timedelta(days=1))["夜"]
    if hhmm < "10:00": return shift(unit, d)["早"]
    if hhmm < "16:00": return shift(unit, d)["日"]
    if hhmm < "21:00": return shift(unit, d)["遅"]
    return shift(unit, d)["夜"]
def nurse(d):
    if d.weekday() >= 5: return None
    if d > END and is_newyear(d): return None   # 年末年始は看護師も休み（オンコール）
    return NURSES[d.toordinal() % 2]

# ---------- 季節 ----------
def season(d):
    m = d.month
    if m in (12, 1, 2): return "冬"
    if m in (3, 4, 5): return "春"
    if m in (6, 7, 8): return "夏"
    return "秋"
def hot(d): return d.month in (7, 8) or (d.month == 6 and d.day > 20) or (d.month == 9 and d.day < 15)

# ---------- 体調の出来事（熱・かぜなど） ----------
# (rid, 始まり, 日数, 種類)
ILL = [
    (7, "2025-11-20", 3, "かぜ"), (16, "2025-12-15", 2, "微熱"), (10, "2026-01-10", 5, "インフル"),
    (13, "2026-02-18", 3, "かぜ"), (18, "2026-04-08", 2, "微熱"), (5, "2026-06-02", 2, "微熱"),
    (17, "2026-08-04", 2, "脱水気味"), (14, "2026-09-12", 2, "かぜ"), (12, "2026-01-28", 4, "かぜ"),
]
# 入院の前ぶれ（入院の前の数日）
PRE = {(h["rid"], h["start"]): h for h in HOSP}
def ill_level(rid, d):
    for (r_, s, n, kind) in ILL:
        if r_ != rid: continue
        s = parse(s)
        if s <= d < s + DT.timedelta(days=n):
            return kind, (d - s).days, n
    for h in HOSP:
        if h["rid"] != rid: continue
        s = parse(h["start"])
        if s - DT.timedelta(days=3) <= d <= s:
            return "入院前", (d - (s - DT.timedelta(days=3))).days, 4
    if rid in DIS:
        dd = parse(DIS[rid]["date"])
        if dd - DT.timedelta(days=21) <= d <= dd:
            return "看取り", (d - (dd - DT.timedelta(days=21))).days, 22
    return None

# ---------- ID ----------
_id = [1790000000000]
def nid():
    _id[0] += 7
    return _id[0]

def tm(rng, base, spread=10):
    h, m = map(int, base.split(":"))
    t = h * 60 + m + rng.randint(-spread, spread)
    t = max(0, min(23 * 60 + 59, t))
    return f"{t // 60:02d}:{t % 60:02d}"

def pick(rng, l): return l[rng.randrange(len(l))]

# =====================================================================
# 文章の部品
# =====================================================================
# ---------- 天気（日ごとに決める） ----------
def weather(d):
    rr = random.Random(f"w{d}")
    m = d.month
    p = rr.random()
    if m in (6, 7) and p < 0.45: return "雨"
    if m in (12, 1, 2) and p < 0.12: return "雪"
    if p < 0.25: return "雨"
    if p < 0.5: return "曇り"
    return "晴れ"

EVENTS = {(1, 1): "元日", (1, 2): "正月", (1, 3): "正月", (2, 3): "節分", (3, 3): "ひな祭り", (4, 5): "花見", (4, 6): "花見",
          (5, 5): "こどもの日", (7, 7): "七夕", (8, 15): "夏祭り", (9, 15): "敬老会", (10, 10): "運動会", (12, 22): "冬至",
          (12, 24): "クリスマス会", (12, 31): "大みそか"}
EV_TEXT = {
    "元日": ["新年のあいさつを交わす。「今年もよろしく」と笑顔で話される。", "おせちの彩りを眺めて「きれいだね」と話される。"],
    "正月": ["お正月の歌を一緒に歌う。", "書き初めに参加。「寿」の字を書かれる。", "福笑いで大笑いされる。"],
    "節分": ["豆まき（ボールを使って）に参加。「鬼は外」と大きな声で。", "鬼のお面をかぶった職員に笑顔。"],
    "ひな祭り": ["ひな人形を眺めて、昔の話をされる。", "ちらし寿司の昼食を楽しまれる。"],
    "花見": ["近くの公園へ花見に出かける。桜を見上げて「きれいだねえ」。", "ホームの庭の桜を見ながらおやつ。"],
    "こどもの日": ["こいのぼりを見て、子どもの頃の話をされる。", "柏餅を召し上がる。"],
    "七夕": ["短冊に願いごとを書かれる。「みんな元気で」と。", "七夕飾りを一緒に作る。"],
    "夏祭り": ["ホームの夏祭りで輪投げに参加。", "盆踊りの曲に合わせて手拍子。"],
    "敬老会": ["敬老会でご家族と記念写真。", "敬老会のお祝い膳を召し上がる。笑顔が多い。"],
    "運動会": ["ホームの運動会で玉入れに参加。", "パン食い競争（お菓子）で盛り上がる。"],
    "冬至": ["ゆず湯の話をされる。", "かぼちゃの煮物を召し上がる。"],
    "クリスマス会": ["クリスマス会でケーキを召し上がる。", "職員のハンドベルを聞いて拍手。"],
    "大みそか": ["年越しそばを召し上がる。", "紅白歌合戦を少し見てから休まれる。"],
}
ACTS = ["塗り絵", "体操", "歌の時間", "テレビ", "洗濯物たたみ", "新聞を読むこと", "折り紙", "パズル", "カルタ", "写真を見ること", "お茶の時間"]

def mates(rid, d, unit):
    return [x for x in roster.R if x["unit_id"] == unit and x["id"] != rid and here(x["id"], d, "12:00")]

def morning_text(rng, r, d, ill):
    t = r["t"]
    if ill:
        kind = ill[0]
        if kind in ("かぜ", "微熱", "インフル"): return pick(rng, ["朝からややだるそうな表情。", "起床時、顔が少し赤い。", "声かけにいつもより反応がゆっくり。", "「寒気がする」と話される。毛布を足す。"])
        if kind == "入院前": return pick(rng, ["朝から元気がなく、うとうとしている。", "起床時からいつもより呼吸が浅い様子。", "朝食前から表情が乏しい。"])
        if kind == "看取り": return pick(rng, ["朝の声かけに、まぶたを動かして応えられる。", "穏やかな表情で目を閉じて過ごされている。", "口元の保湿を行うと、少しうなずかれる。"])
        if kind == "脱水気味": return "朝、口の中が乾いている。水分を少しずつすすめる。"
    w = weather(d); mob = t["mob"]; mm = rng.randint(0, 5) * 5 + 30
    wake = {
        "独歩": [f"6時{mm}分ごろ自分で起きられる。", "職員の声かけで起床。", "早くに目を覚まし、カーテンを開けておられた。", f"6時{mm}分、自分で身支度を整えて食堂へ。"],
        "車いす": ["職員2人で車いすへ移る。", "起き上がりを手伝い、車いすへ。", "起床介助。座る姿勢を整える。"],
        "寝たきり": ["ベッドを起こして目覚めを促す。", "朝の声かけにうっすら目を開けて応じられる。", "ベッド上で顔を拭き、髪を整える。"],
    }.get(mob, [f"声かけで起床。{mob}で洗面所へ。", f"ベッドの端に座って少し休んでから、{mob}で食堂へ。", f"{mob}の位置を確かめてから立ち上がる。"])
    mood = ["表情はおだやか。", "「よく眠れた」と話される。", "少し眠そう。", "「おはよう」と笑顔。", "職員の名前を呼んであいさつしてくださる。", ""]
    if w == "雨": mood += ["雨の音で早く目が覚めたと話される。", "「今日は雨だね」と窓の外を見ておられる。"]
    if w == "雪": mood += ["窓の外の雪を見て「積もるかね」と話される。"]
    if w == "晴れ" and season(d) in ("春", "秋"): mood += ["「いい天気だね」と窓の外を眺められる。"]
    if season(d) == "冬": mood += ["「今朝は冷えるね」と話される。ひざ掛けを用意。"]
    if hot(d): mood += ["朝から暑いので、起きてすぐお茶をすすめる。"]
    extra = []
    if t.get("lewy") and rng.random() < 0.08: extra.append("「部屋に子どもがいる」と話される。否定せずに話を聞き、明かりをつけると落ち着かれた。")
    if t.get("parkinson") and rng.random() < 0.2: extra.append("朝は体のこわばりが強い。お薬のあと少しずつ動きやすくなる。")
    if t.get("back") and rng.random() < 0.1: extra.append("「腰が少し重い」と話される。湿布を貼る。")
    if t.get("knee") and rng.random() < 0.1: extra.append("立ち上がりのとき膝をさすっておられる。ゆっくり立つよう声かけ。")
    if t.get("deaf"): extra.append(pick(rng, ["補聴器をつける。", "補聴器の電池を確かめてからつける。", "補聴器をつけると「よく聞こえる」と。"]))
    if t.get("hf") and rng.random() < 0.3: extra.append(pick(rng, ["足のむくみは目立たない。", "両足首に軽いむくみ。看護師へ伝える。", "むくみを確かめる。いつもと変わらない。"]))
    if t.get("dm") and rng.random() < 0.1: extra.append("朝食前、冷や汗やふるえがないことを確かめる。")
    return pick(rng, wake) + pick(rng, mood) + "".join(extra)

def day_text(rng, r, d, ill, _):
    t = r["t"]
    if ill:
        kind = ill[0]
        if kind == "看取り": return pick(rng, ["ベッドを少し起こし、好きな音楽を小さく流す。表情おだやか。", "ご家族が来られ、手を握って声をかけておられた。", "口腔ケアと保湿。呼吸は浅いが苦しそうな様子はない。看護師が様子を確かめる。", "ハーモニカの曲を流すと、まぶたが少し動く。"])
        return pick(rng, ["居室で休まれる。こまめに様子を見に行く。", "日中は横になって過ごされる。水分を少しずつすすめる。", "レクは見合わせ、居室で静かに過ごされる。"])
    ev = EVENTS.get((d.month, d.day))
    if ev and rng.random() < 0.8: return pick(rng, EV_TEXT[ev])
    m = mates(r["id"], d, r["unit_id"])
    mate = pick(rng, m)["name"].split()[0] + "様" if m else "ほかの方"
    l = pick(rng, t["like"]); a = pick(rng, ACTS)
    w = weather(d); s = season(d)
    pool = [
        f"午前は{l}を楽しまれる。", f"{mate}と{l}の話で笑顔。", f"{a}に参加。{pick(rng, ['集中して取り組まれる。', '途中で休みながら。', '「楽しかった」と話される。', 'ほかの方に教えておられた。'])}",
        f"{mate}と並んで{a}。{pick(rng, ['会話がはずむ。', '静かに過ごされる。', 'ときどき笑い声。'])}",
        f"昼食後は居室で{pick(rng, ['少し横になられる。', 'ラジオを聞いて過ごされる。', '昼寝。30分ほどで起きられる。'])}",
        f"おやつの時間に{l}の話をしてくださる。",
    ]
    if "洗濯物たたみ" in t["like"] or t["mood"] in ("働き者", "きれい好き", "気配り", "面倒見がよい"):
        pool += ["洗濯物たたみを手伝ってくださる。「助かります」と伝えると笑顔。", "テーブル拭きを引き受けてくださる。", f"{mate}にお茶を運んでくださる。"]
    if t["mob"] in ("独歩", "杖", "歩行器", "シルバーカー") and w == "晴れ" and s in ("春", "秋"):
        pool += ["天気がよく、職員と玄関前を散歩。「気持ちいいね」。", "庭のプランターに水やり。花の名前を教えてくださる。"]
    if w == "雨": pool += ["雨のため外に出られず、食堂でゆっくり過ごされる。"]
    if hot(d): pool += ["暑い日のため、エアコンの効いた食堂で過ごされる。水分を多めにすすめる。"]
    if s == "冬": pool += [f"こたつのある和室で{mate}とみかんを食べながら過ごされる。"]
    if t.get("sundown") and rng.random() < 0.25:
        return pick(rng, [
            "夕方「家に帰らなきゃ」と玄関に向かわれる。一緒にお茶を飲みながら話を聞くと、落ち着かれた。",
            "16時ごろ落ち着かない様子。好きな話題に切りかえ、洗濯物たたみをお願いすると集中される。",
            "夕方そわそわされる。家族の写真を一緒に見て、「また来てくれるね」と安心された様子。",
            "夕方「店を開けなきゃ」と話される。夕食の準備を一緒にしていただくと笑顔に。" if "料理の手伝い" in t["like"] else "夕方、玄関の前を何度か行き来される。職員がそばで一緒に歩くと落ち着かれた。"])
    if t.get("anxious") and rng.random() < 0.12: return "「財布がない」と探される。一緒に探して引き出しの中で見つかり、安心される。"
    if t.get("ftd") and rng.random() < 0.1: return "いつもの席にほかの方が座っておられ、強い口調になる。いつもの席に案内すると落ち着かれた。"
    if t.get("newcomer"):
        adm = parse(r["admission_date"])
        if (d - adm).days < 30 and rng.random() < 0.5:
            return pick(rng, ["入居まもないため、ホームの中を一緒に歩いて案内する。", "「ここはどこ？」と不安そう。職員がそばで話を聞き、お茶を一緒に飲む。", f"{mate}に紹介し、一緒に洗濯物たたみをする。少し表情がやわらいだ。"])
    return pick(rng, pool)

def evening_text(rng, r, d, ill):
    t = r["t"]
    if ill:
        if ill[0] == "看取り": return pick(rng, ["夜は照明を少し落とし、静かに過ごしていただく。呼吸の様子をこまめに確かめる。", "就寝前、口腔ケアと体の向きを変える。苦しそうな様子はない。"])
        return pick(rng, ["早めに休まれる。熱は看護師の指示どおりこまめに測る。", "夕食後すぐ横になられる。水分を少し取っていただく。"])
    hh = pick(rng, ["20時", "20時半", "21時", "21時15分"])
    m = mates(r["id"], d, r["unit_id"])
    mate = pick(rng, m)["name"].split()[0] + "様" if m else "ほかの方"
    tv = pick(rng, ["歌番組", "時代劇", "ニュース", "クイズ番組", "旅番組", "動物の番組"])
    pool = [f"夕食後は{tv}を見てくつろがれる。", f"{hh}ごろ床につかれる。", f"夕食後、{mate}と談笑。{hh}に居室へ。",
            f"就寝前に歯みがきとトイレをすませ、{hh}ごろ休まれる。", f"{tv}を見ながら「懐かしいね」と話される。"]
    if "大相撲中継" in t["like"] or "相撲" in t["like"]:
        if d.month in (1, 3, 5, 7, 9, 11) and 8 <= d.day <= 24: pool = ["夕方は大相撲中継を熱心に見ておられる。ひいきの力士が勝つと笑顔。", "相撲中継を見ながら、決まり手を教えてくださる。"]
    if "野球中継" in t["like"] and 4 <= d.month <= 9: pool.append("野球中継を見て、ひいきのチームを応援される。")
    if t.get("deaf"): pool.append("就寝前に補聴器を外し、電池を確かめてケースへ。")
    if t["denture"]: pool.append("就寝前に入れ歯を外して洗い、洗浄液につける。")
    if t.get("prostate"): pool.append("就寝前にトイレへ。本人の話では尿の出はいつもどおり。")
    if t.get("anxious") and rng.random() < 0.2: pool.append("「眠れるかしら」と不安そう。温かいお茶を飲みながら話を聞くと、22時ごろ眠られた。")
    return pick(rng, pool)

FOOD_SEASON = {
    1: ["お雑煮（やわらかく切ったお餅なし）", "七草がゆ", "ぶり大根"], 2: ["恵方巻き（細く切って）", "けんちん汁", "鍋焼きうどん"],
    3: ["ちらし寿司", "はまぐりのお吸い物", "菜の花のおひたし"], 4: ["たけのこご飯", "桜餅", "春キャベツの煮びたし"],
    5: ["柏餅", "新じゃがの煮物", "かつおのたたき"], 6: ["あじの南蛮漬け", "冷やし茶わん蒸し", "梅のゼリー"],
    7: ["そうめん", "うなぎのちらし（土用）", "すいか"], 8: ["冷やしうどん", "夏野菜カレー", "かき氷"],
    9: ["栗ご飯", "さんまの塩焼き", "おはぎ"], 10: ["きのこご飯", "さつまいもの煮物", "秋鮭のホイル焼き"],
    11: ["炊き込みご飯", "けんちん汁", "柿"], 12: ["かぼちゃの煮物（冬至）", "年越しそば", "クリームシチュー"],
}

def meal_note(rng, r, d, mt, main):
    t = r["t"]
    if main <= 4: return pick(rng, ["食欲がない様子。好きな物から少しずつすすめる。", "半分ほど残される。水分は取れている。", "箸が進まない。看護師へ伝える。"])
    if t["eat"] in ("全介助",): return pick(rng, ["姿勢を整え、ひと口ずつ介助。むせなく食べられる。", "とろみをつけたお茶でのどを潤してから介助。", "ゆっくりペースで介助し、飲み込みを確かめながら。"])
    if t["eat"] in ("一部介助",): return pick(rng, ["途中まで自分で食べられ、後半を介助。", "スプーンを手渡すと自分で口へ運ばれる。", "疲れが見えたところで介助に切りかえる。"])
    if t["eat"] == "見守り": return pick(rng, ["ひと口の量が多くならないよう声をかける。むせなし。", "食べるペースが早いので、途中でお茶をすすめる。"])
    f = pick(rng, FOOD_SEASON[d.month])
    return pick(rng, [f"{f}を「おいしい」と召し上がる。", "完食。", "よく噛んで召し上がる。", f"{f}が出て季節の話がはずむ。", ""])

# =====================================================================
def generate():
    rng = random.Random(20261018)
    out = {k: [] for k in ["vitals", "meals", "excretions", "oral_cares", "meds", "baths", "groomings", "turns",
                           "weight_records", "linens", "care_records", "topical_records"]}
    # 体重のすじ（利用者ごとの1年の変化）
    weight_now = {rid: r["t"]["weight"] for rid, r in RES.items()}
    last_stool = {rid: None for rid in RES}
    for d in DAYS:
        dstr = ds(d)
        wd = d.weekday()
        for rid, r in RES.items():
            st = stay(rid, d)
            if st is None:
                continue
            t = r["t"]; unit = r["unit_id"]
            rr = random.Random(f"{rid}-{dstr}")
            ill = ill_level(rid, d)
            add = lambda k, rec: out[k].append(rec)
            def care(time, cat, content, staff=None):
                if not content: return
                if not here(rid, d, time): return
                add("care_records", {"id": nid(), "recorded_at": f"{dstr} {time}", "resident_id": rid, "category": cat,
                                     "content": content, "staff_name": staff or who(unit, d, time)})

            # ---------------- バイタル ----------------
            vt = tm(rr, "09:00", 25)
            if here(rid, d, vt):
                bp_b, bp_l = t["bp"]
                w = 4 if season(d) == "冬" else (-3 if hot(d) else 0)
                v = {"temperature": round(rr.gauss(t["temp"], 0.18), 1), "bp_high": int(rr.gauss(bp_b + w, 7)),
                     "bp_low": int(rr.gauss(bp_l + w / 2, 5)), "pulse": int(rr.gauss(t["pulse"], 5)), "spo2": min(99, int(round(rr.gauss(t["spo2"], 0.8))))}
                if ill:
                    kind, day_i, n = ill
                    if kind in ("かぜ", "インフル"): v["temperature"] = round(37.6 + rr.random() * (1.0 if kind == "インフル" else 0.5) - day_i * 0.15, 1); v["pulse"] += 10
                    elif kind == "微熱": v["temperature"] = round(37.3 + rr.random() * 0.4, 1)
                    elif kind == "脱水気味": v["temperature"] = round(37.2 + rr.random() * 0.3, 1); v["pulse"] += 12; v["bp_high"] -= 12
                    elif kind == "入院前":
                        if rid == 3 or rid == 9: v["temperature"] = round(37.4 + day_i * 0.35 + rr.random() * 0.3, 1); v["spo2"] = t["spo2"] - 1 - day_i; v["pulse"] += 8 + day_i * 3
                        if rid == 2: v["spo2"] = t["spo2"] - 1 - day_i; v["pulse"] += 6 + day_i * 3; v["bp_high"] += 8
                        if rid == 6: pass
                    elif kind == "看取り":
                        v["bp_high"] = int(t["bp"][0] - day_i * 1.5 + rr.gauss(0, 5)); v["bp_low"] = int(t["bp"][1] - day_i + rr.gauss(0, 3))
                        v["spo2"] = int(t["spo2"] - day_i * 0.15 + rr.gauss(0, 1)); v["pulse"] = int(t["pulse"] + day_i * 0.8 + rr.gauss(0, 4))
                staff = nurse(d) if (nurse(d) and rr.random() < 0.5) else who(unit, d, vt)
                rec = {"id": nid(), "date": dstr, "time": vt, "resident_id": rid, **v, "is_unusual": 0, "staff_name": staff}
                lim = r
                unusual = (v["temperature"] > float(lim["temp_max"]) or v["bp_high"] > int(lim["bp_high_max"]) or v["bp_high"] < int(lim["bp_high_min"])
                           or v["spo2"] < int(lim["spo2_min"]) or v["pulse"] > int(lim["pulse_max"]) or v["pulse"] < int(lim["pulse_min"]))
                rec["is_unusual"] = 1 if unusual else 0
                add("vitals", rec)
                if unusual:
                    what = []
                    if v["temperature"] > float(lim["temp_max"]): what.append(f"体温{v['temperature']}℃")
                    if v["bp_high"] > int(lim["bp_high_max"]) or v["bp_high"] < int(lim["bp_high_min"]): what.append(f"血圧{v['bp_high']}/{v['bp_low']}")
                    if v["spo2"] < int(lim["spo2_min"]): what.append(f"SpO2 {v['spo2']}%")
                    if v["pulse"] > int(lim["pulse_max"]) or v["pulse"] < int(lim["pulse_min"]): what.append(f"脈{v['pulse']}")
                    t2 = tm(rr, vt, 3); t2 = f"{int(t2[:2]):02d}:{min(59, int(t2[3:]) + 5):02d}"
                    care(t2, "特変", f"朝のバイタルで{'・'.join(what)}（いつもの範囲を超える）。10分後に測り直し、看護師へ報告。")
                    nn = nurse(d)
                    resp = {
                        "かぜ": "看護師が様子を確認。主治医へ連絡し、指示により水分を多めにとって経過をみる。熱は2時間ごとに測る。",
                        "インフル": "看護師が主治医へ連絡。往診で検査を受け、インフルエンザの診断。主治医の指示で薬を開始し、居室で過ごしていただく。感染対策（マスク・手洗い・居室の換気）を職員に周知。",
                        "微熱": "看護師が確認。ほかの症状なし。看護師の指示で水分を多めにし、午後にもう一度測る。",
                        "脱水気味": "看護師が確認。主治医の指示により水分をこまめにすすめ、午後に再検。",
                        "入院前": "看護師が状態を確認し主治医へ連絡。指示に従い経過をみる。",
                        "看取り": "看護師が確認。看取りの方針どおり、苦痛がないように過ごしていただく。ご家族へ様子を連絡。",
                    }
                    if ill and ill[0] in resp:
                        care(f"{int(t2[:2]):02d}:{min(59, int(t2[3:]) + 10):02d}", "看護", resp[ill[0]], nn or who(unit, d, "12:00"))
                    elif not ill:
                        care(f"{int(t2[:2]):02d}:{min(59, int(t2[3:]) + 10):02d}", "看護", pick(rr, [
                            "看護師が再検。少し下がり、ほかに変わった様子なし。看護師の指示で午後にもう一度測る。",
                            "看護師が確認。本人は「なんともない」と話される。看護師の指示で経過をみる。",
                        ]), nn or who(unit, d, "12:00"))
                if ill and ill[0] in ("かぜ", "インフル", "入院前", "脱水気味"):
                    vt2 = tm(rr, "15:00", 20)
                    if here(rid, d, vt2):
                        v2 = dict(v); v2["temperature"] = round(v["temperature"] - 0.2 + rr.random() * 0.3, 1)
                        rec2 = {"id": nid(), "date": dstr, "time": vt2, "resident_id": rid, **v2, "is_unusual": 0, "staff_name": who(unit, d, vt2)}
                        rec2["is_unusual"] = 1 if (v2["temperature"] > float(lim["temp_max"]) or v2["spo2"] < int(lim["spo2_min"])) else 0
                        add("vitals", rec2)

            # ---------------- 食事・水分 ----------------
            limit_water = 1000 if t.get("hf") and rid == 2 else None
            for mt, base_t, water in (("朝食", "07:45", 180), ("おやつ", "10:00", 150), ("昼食", "12:00", 200), ("おやつ", "15:00", 180), ("夕食", "18:00", 180)):
                mtime = tm(rr, base_t, 8)
                if not here(rid, d, mtime): continue
                if ill and ill[0] == "看取り" and ill[1] > 14 and mt == "おやつ" and base_t == "10:00": continue
                if mt == "おやつ":
                    main = rr.choice([8, 10, 10, 10]) if not ill else rr.choice([3, 5])
                    side = 0
                else:
                    bm = {"自立": 9, "見守り": 10, "一部介助": 8, "全介助": 7}[t["eat"]]
                    main = max(0, min(10, int(round(rr.gauss(bm, 1.1)))))
                    side = max(0, min(10, int(round(rr.gauss(bm - 0.5, 1.3)))))
                    if ill:
                        kind, di, n = ill
                        cut = {"かぜ": 4, "インフル": 5, "微熱": 2, "脱水気味": 3, "入院前": 4 + di, "看取り": 3 + di // 3}.get(kind, 2)
                        main = max(0, main - cut); side = max(0, side - cut)
                wml = int(round(rr.gauss(water, 25) / 10) * 10)
                if hot(d): wml += 30
                if limit_water: wml = min(wml, {"朝食": 200, "昼食": 200, "夕食": 200, "おやつ": 150}[mt])
                if ill and ill[0] == "看取り": wml = int(wml * max(0.2, 1 - ill[1] / 22))
                rec = {"id": nid(), "date": dstr, "time": mtime, "meal_type": mt, "resident_id": rid, "main_dish_ratio": main,
                       "side_dish_ratio": side, "water_ml": max(0, wml), "staff_name": who(unit, d, mtime)}
                add("meals", rec)
                if mt != "おやつ" and main <= 4 and rr.random() < 0.7:
                    care(f"{int(mtime[:2]):02d}:{min(59, int(mtime[3:]) + 30):02d}", "介護", f"{mt}は主食{main}割・副食{side}割。{meal_note(rr, r, d, mt, main)}")
                elif mt != "おやつ" and rr.random() < 0.06:
                    note = meal_note(rr, r, d, mt, main)
                    if note: care(f"{int(mtime[:2]):02d}:{min(59, int(mtime[3:]) + 30):02d}", "介護", f"{mt}：{note}")

            # ---------------- 排泄 ----------------
            if t["toilet"] == "自立": times = ["07:00", "13:30", "20:30"]
            elif t["toilet"] == "誘導": times = ["06:30", "10:30", "13:30", "16:00", "19:30", "22:00"]
            else: times = ["06:00", "10:00", "14:00", "18:00", "22:00", "02:00"]
            gap = (d - last_stool[rid]).days if last_stool[rid] else 1
            stool_today = False
            if t.get("constip"): stool_today = rr.random() < (0.25 if gap == 1 else 0.45 if gap == 2 else 0.9 if gap >= 4 else 0.3)
            else: stool_today = rr.random() < (0.55 if gap == 1 else 0.85)
            if ill and ill[0] == "看取り": stool_today = rr.random() < 0.2
            stool_slot = rr.randrange(len(times)) if stool_today else -1
            # 3日目に便が出ていなければ頓服（看護師の指示）
            prn_laxative = None
            if t.get("constip") and gap >= 3 and not stool_today:
                lax = [m for m in r["rx"] if m[3] and "便" in m[3][1]]
                if lax: prn_laxative = lax[0]
            for i, bt in enumerate(times):
                et = tm(rr, bt, 15)
                if not here(rid, d, et): continue
                rec = {"id": nid(), "date": dstr, "time": et, "resident_id": rid, "urine_flag": 1, "stool_amount": "なし", "stool_condition": "なし",
                       "notes": "", "staff_name": who(unit, d, et)}
                if i == stool_slot:
                    amt = pick(rr, ["少量", "中量", "中量", "多量"]) if gap < 3 else pick(rr, ["中量", "多量"])
                    cond = "硬便" if (gap >= 3 and rr.random() < 0.6) else pick(rr, ["普通便", "普通便", "普通便", "軟便"])
                    if last_stool.get(("lax", rid)) == d - DT.timedelta(days=1): cond = pick(rr, ["軟便", "普通便"]); amt = "多量"
                    rec["stool_amount"], rec["stool_condition"] = amt, cond
                    last_stool[rid] = d
                if t["toilet"] == "誘導":
                    rec["notes"] = pick(rr, ["声かけでトイレへ。", "トイレ誘導。自分で手すりを持って立たれる。", "誘導し排尿あり。", "", "", "パッド交換。汚れ少量。"])
                elif t["toilet"] == "おむつ":
                    rec["notes"] = pick(rr, ["おむつ交換。皮膚の赤みなし。", "おむつ交換。陰部を洗浄。", "パッド交換。", "", "体の向きを変えて交換。仙骨部の皮膚を確かめる。"])
                    if bt == "02:00" and rr.random() < 0.3: rec["urine_flag"] = 1
                else:
                    rec["notes"] = pick(rr, ["本人から「出た」と聞き取り。", "", "", "自分でトイレへ。"])
                if i == stool_slot and rec["notes"] == "": rec["notes"] = pick(rr, ["排便あり。", "排便を確かめる。"])
                add("excretions", rec)
            if prn_laxative and here(rid, d, "19:30"):
                nm_, unit_, _, prn, _ = prn_laxative
                care("19:40", "頓服服用", f"3日間排便なし。看護師の指示で{nm_}（{prn[0]}{unit_}）を夕食後に使用。", nurse(d) or who(unit, d, "19:40"))
                last_stool[("lax", rid)] = d

            # ---------------- 口腔ケア ----------------
            for tk, bt in (("朝食後", "08:20"), ("昼食後", "12:40"), ("夕食後", "18:40")):
                ot = tm(rr, bt, 8)
                if not here(rid, d, ot): continue
                den = 1 if t["denture"] else 0
                notes = ""
                if rr.random() < 0.25:
                    if den: notes = pick(rr, ["入れ歯を外して洗浄。うがい良好。", "入れ歯洗浄。歯ぐきの赤みなし。", "部分入れ歯を外してブラシで洗う。"])
                    elif t["eat"] in ("全介助", "一部介助"): notes = pick(rr, ["口の中に残った物を確かめ、スポンジで清拭。", "歯みがきを介助。出血なし。", "口の中を保湿。"])
                    else: notes = pick(rr, ["自分で歯みがき。仕上げみがきを手伝う。", "歯みがきの声かけ。自分でできる。"])
                add("oral_cares", {"id": nid(), "date": dstr, "timing": tk, "resident_id": rid, "oral_done": 1, "denture_done": den,
                                   "notes": notes, "staff_name": who(unit, d, ot)})

            # ---------------- 服薬（処方薬の時間帯ごと） ----------------
            slots = {}
            for (name, u, tim, prn, _) in r["rx"]:
                for k, c in tim.items():
                    slots.setdefault(k, {}); slots[k][u] = slots[k].get(u, 0) + c
            SLOT = {"起床時": ("起床時", "06:30"), "朝食前": ("朝食前", "07:30"), "朝食後": ("朝", "08:00"), "昼食前": ("昼食前", "11:30"),
                    "昼食後": ("昼", "12:30"), "夕食前": ("夕食前", "17:30"), "夕食後": ("夕", "18:30"), "眠前": ("眠前", "20:30")}
            for k in ["起床時", "朝食前", "朝食後", "昼食前", "昼食後", "夕食前", "夕食後", "眠前"]:
                if k not in slots: continue
                slot, base = SLOT[k]
                gt = tm(rr, base, 10)
                if not here(rid, d, gt): continue
                bag = "・".join(f"{n}{u}" for u, n in slots[k].items())
                status = "済"
                if rr.random() < 0.0015: status = "数が合わない"
                rec = {"id": nid(), "date": dstr, "slot": slot, "timing_key": k, "resident_id": rid, "status": status,
                       "staff_name": who(unit, d, gt), "recorded_at": f"{dstr} {gt}", "bag": bag}
                if status == "済": rec["given_time"] = gt; rec["given_on_time"] = True
                add("meds", rec)
                if status == "数が合わない":
                    care(gt, "連絡", f"服薬（{k}）: 袋の中の数が合わない（予定 {bag}）。看護師へ報告。")
                    care(f"{gt[:3]}{min(59, int(gt[3:]) + 20):02d}", "看護", "看護師が確認。薬局の一包化の袋の数え違いと分かり、薬局へ連絡。正しい薬を服用していただいた。", nurse(d) or who(unit, d, "12:00"))
            for (mname, eye, eslots, dose, doc, why) in r.get("eye", []):
                for es in eslots:
                    base = {"朝": "08:10", "昼": "12:40", "夕": "18:40", "眠前": "20:40"}[es]
                    et = tm(rr, base, 8)
                    if not here(rid, d, et): continue
                    add("meds", {"id": nid(), "date": dstr, "slot": f"点眼({es})", "resident_id": rid, "status": "済",
                                 "staff_name": who(unit, d, et), "eye": eye, "medicine_name": mname})

            # ---------------- 入浴（週2回）・塗り薬 ----------------
            bath_days = {1: (0, 3), 2: (1, 4)}[unit] if rid % 2 else ({1: (2, 5), 2: (0, 3)}[unit])
            bath_today = wd in bath_days and not is_newyear(d)   # 年末年始は入浴なし
            if bath_today:
                btt = tm(rr, "14:00", 40)
                if here(rid, d, btt):
                    if ill and ill[0] != "看取り":
                        add("baths", {"id": nid(), "date": dstr, "time": btt, "resident_id": rid, "bath_type": "見合わせ",
                                      "ointment_notes": "発熱のため入浴見合わせ。看護師の指示で体を拭く（清拭）。", "staff_name": who(unit, d, btt)})
                    elif ill and ill[0] == "看取り":
                        add("baths", {"id": nid(), "date": dstr, "time": btt, "resident_id": rid, "bath_type": "清拭",
                                      "ointment_notes": "看護師と相談し、ベッド上で温かいタオルで体を拭く。表情おだやか。", "staff_name": who(unit, d, btt)})
                    else:
                        btype = t["bath"]
                        notes = []
                        for (cat, site, item, freq) in r.get("topical", []):
                            if "入浴後" in freq: notes.append(f"入浴後、{site}に{item}を塗る。")
                        if btype == "特浴": notes.append(pick(rr, ["機械浴。職員2人で介助。湯温39度。", "機械浴。皮膚の状態を確かめる。赤みなし。"]))
                        else: notes.append(pick(rr, ["手すりを持って湯船へ。「いい湯だね」と話される。", "洗身は自分でできる所は自分で。背中を介助。", "見守りで入浴。皮膚トラブルなし。", "ゆず湯を楽しまれる。" if (d.month == 12 and d.day >= 20) else "湯温40度。ゆっくり温まられる。"]))
                        add("baths", {"id": nid(), "date": dstr, "time": btt, "resident_id": rid, "bath_type": btype,
                                      "ointment_notes": "".join(notes), "staff_name": who(unit, d, btt)})
            for pi, (cat, site, item, freq) in enumerate(r.get("topical", [])):
                tims = []
                if "入浴後" in freq and bath_today and not ill: tims.append("入浴後")
                if "1日1回" in freq: tims.append("朝")
                if "1日2回" in freq: tims += ["朝", "就寝前"]
                if "おむつ交換" in freq: tims += ["朝", "夕"]
                for tt in tims:
                    base = {"朝": "09:30", "昼": "12:30", "夕": "18:30", "就寝前": "20:30", "入浴後": "14:40"}[tt]
                    tt_ = tm(rr, base, 10)
                    if not here(rid, d, tt_): continue
                    add("topical_records", {"id": nid(), "date": dstr, "resident_id": rid, "pin_id": rid * 100 + pi + 1, "category": {"湿布": "湿布", "保湿": "軟膏塗布", "保護": "軟膏塗布"}[cat],
                                            "site_name": site, "item_name": item, "timing": tt, "done_at": f"{dstr} {tt_}", "staff_name": who(unit, d, tt_)})

            # ---------------- 整容 ----------------
            male = rid in (1, 3, 6, 9, 12, 15, 18)
            if (d.toordinal() + rid) % 7 == 0 or (male and (d.toordinal() + rid) % 3 == 0):
                gt = tm(rr, "10:30", 30)
                if here(rid, d, gt) and not ill:
                    nail = 1 if (d.toordinal() + rid) % 14 == 0 else 0
                    ear = 1 if (d.toordinal() + rid) % 28 == 0 else 0
                    shave = 1 if male else 0
                    if nail or ear or shave:
                        n = []
                        if nail: n.append(pick(rr, ["手足の爪切り。巻き爪なし。", "爪切り。足の爪は入浴後でやわらかい時に。"]))
                        if shave: n.append(pick(rr, ["電気シェーバーでひげそり。", "ひげそりを自分で。仕上げを手伝う。"]))
                        if ear: n.append("耳の入り口を綿棒で清拭。")
                        add("groomings", {"id": nid(), "date": dstr, "resident_id": rid, "nail_done": nail, "shave_done": shave, "ear_done": ear,
                                          "notes": "".join(n), "staff_name": who(unit, d, gt)})

            # ---------------- シーツ交換（週1回・汚れたとき） ----------------
            if wd == (rid % 5):
                lt = tm(rr, "10:30", 20)
                if here(rid, d, lt):
                    add("linens", {"id": nid(), "date": dstr, "resident_id": rid, "exchange_type": "定期交換", "notes": "", "staff_name": who(unit, d, lt)})
            if t["toilet"] == "おむつ" and rr.random() < 0.03:
                lt = tm(rr, "05:30", 30)
                if here(rid, d, lt):
                    add("linens", {"id": nid(), "date": dstr, "resident_id": rid, "exchange_type": "臨時汚染交換", "notes": "尿漏れによる交換。", "staff_name": who(unit, d, lt)})

            # ---------------- 体重（毎月15日） ----------------
            if d.day == 15 and here(rid, d, "10:00"):
                w = weight_now[rid]
                drift = rr.gauss(0, 0.35)
                if rid == 12: drift = -0.6 + rr.gauss(0, 0.2)
                if rid == 6 and d.month == 1: drift = -2.0
                if rid == 2 and d.month == 7: drift = 1.4
                if rid == 2 and d.month == 8: drift = -1.6
                if rid == 19 and (d - parse(r["admission_date"])).days < 60: drift = -0.3
                w = round(w + drift, 1)
                prev = weight_now[rid]
                weight_now[rid] = w
                diff = round(w - prev, 1)
                add("weight_records", {"id": nid(), "date": dstr, "month": dstr[:7], "resident_id": rid, "weight": w,
                                       "diff_prev": (f"+{diff:.1f}kg" if diff >= 0 else f"{diff:.1f}kg"), "staff_name": who(unit, d, "10:00")})
                if abs(diff) >= 1.5:
                    care("10:20", "看護", f"体重が先月より{abs(diff):.1f}kg{'増えた' if diff > 0 else '減った'}。看護師が主治医へ報告し、指示に従う。", nurse(d) or who(unit, d, "12:00"))

            # ---------------- 夜間の巡視・体の向き（22・0・2・4・6時） ----------------
            turn = t.get("turn") or (ill and ill[0] == "看取り")
            pos = ["左側臥位", "仰臥位", "右側臥位"]
            for i, nt in enumerate(["22:00", "00:00", "02:00", "04:00", "06:00"]):
                dd_ = d if nt >= "12:00" else d + DT.timedelta(days=1)  # 0〜6時は次の日の日付
                if dd_ > REC_END: continue
                if not here(rid, dd_, nt): continue
                if turn: action = pos[(i + d.toordinal()) % 3]
                elif t["toilet"] == "おむつ" and nt in ("00:00", "04:00"): action = "おむつ交換"
                else: action = "安眠中"
                stf = who(unit, d, "22:00")
                note = ""
                if not turn and action == "安眠中" and rr.random() < 0.05:
                    note = pick(rr, ["目を覚まされ、トイレへ誘導。すぐに再入眠。", "「今何時？」と聞かれる。時間を伝えると安心して眠られた。", "寝言で大きな声。声をかけると落ち着かれる。" if t.get("lewy") else "布団をかけ直す。"])
                add("turns", {"id": nid(), "date": ds(dd_), "time": nt, "resident_id": rid, "action": action, "note": note, "staff_name": stf})
                tpl = {"安眠中": "【{time} 定時巡視】訪室確認。静かに安眠中、呼吸状態安定。掛物の乱れを整え、ナースコールを手元に確認。異常なし。",
                       "左側臥位": "【{time} 定時巡視・体位変換】訪室確認。仰臥位から左側臥位へ体位変換実施。背部にクッションを当て、除圧と良肢位の保持を確認。",
                       "右側臥位": "【{time} 定時巡視・体位変換】訪室確認。右側臥位へ体位変換実施。骨突出部の除圧を確認し、安楽な姿勢に整えた。",
                       "仰臥位": "【{time} 定時巡視・体位変換】訪室確認。仰臥位へ体位変換実施。踵部の除圧を確認し、掛物を整えた。",
                       "おむつ交換": "【{time} 定時巡視・おむつ交換】訪室確認。おむつ交換実施。陰部・臀部の皮膚状態に発赤なく、清潔保持を確認。"}[action]
                content = tpl.replace("{time}", nt) + (f" 【様子】{note}" if note else "")
                add("care_records", {"id": nid(), "recorded_at": f"{ds(dd_)} {nt}", "resident_id": rid, "category": "巡視", "content": content,
                                     "staff_name": stf, "auto_night_turn": True})

            # ---------------- 介護記録（朝・日中・夕方） ----------------
            care(tm(rr, "07:20", 15), "介護", morning_text(rr, r, d, ill) if rr.random() < 0.55 or ill else "")
            care(tm(rr, "14:30", 60), "介護", day_text(rr, r, d, ill, None) if rr.random() < 0.6 or ill else "")
            care(tm(rr, "19:30", 30), "介護", evening_text(rr, r, d, ill) if rr.random() < 0.35 or ill else "")
            # 看護師の定期の確認（週1回）・訪問診療（2週ごと）
            if nurse(d) and (d.toordinal() + rid) % 7 == 0:
                care(tm(rr, "11:00", 30), "看護", pick(rr, [
                    "看護師が皮膚・むくみ・お薬の飲み込みを確認。変わりなし。",
                    "看護師がバイタルの記録を確認。いつもの範囲内。",
                    "看護師が足の爪と皮膚の乾燥を確認。保湿を続ける。",
                ] + (["看護師が両足のむくみと体重の記録を確認。主治医の指示どおり水分は1日1,000mlまでを続ける。"] if rid == 2 else [])
                  + (["看護師が飲み込みの様子を確認。食事の形は今のままでよいと判断。"] if t["eat"] == "全介助" else [])), nurse(d))
            if wd == 2 and (d.toordinal() // 7) % 2 == unit % 2:
                care("14:00" if unit == 1 else "15:00", "看護", pick(rr, [
                    "訪問診療（ひだまり内科クリニック）。主治医の診察。処方の変更なし。",
                    "訪問診療。主治医が胸の音とむくみを診察。今の治療を続ける。",
                    "訪問診療。主治医の診察。次回も2週間後。",
                ]), nurse(d) or who(unit, d, "12:00"))
            # 家族の面会・電話
            if rr.random() < (0.12 if "妻の面会" in t["like"] or "娘さんの面会" in t["like"] else 0.04):
                care(tm(rr, "14:00", 60), "家族", pick(rr, [
                    f"{r['emergency_contact'].split('・')[0]}が面会。お菓子を一緒に食べながら話される。",
                    f"{r['emergency_contact'].split('・')[0]}が面会。最近の様子を伝える。「元気そうで安心した」と話される。",
                    f"{r['emergency_contact'].split('・')[0]}より電話。最近の様子と体調をお伝えする。",
                ]))
            # 体操・リハビリ
            if t["mob"] in ("独歩", "杖", "歩行器", "シルバーカー", "見守り歩行") and wd in (0, 2, 4) and rr.random() < 0.35 and not ill:
                care(tm(rr, "10:15", 10), "リハビリ", pick(rr, [
                    "午前の体操に参加。座ったまま足踏みと腕回し。",
                    "歩行練習。廊下を往復2回、休みながら。",
                    "立ち上がりの練習を5回。ふらつきなし。",
                ]))
        # 入院・退院・退所・入居の日の記録
        for h in HOSP:
            rid = h["rid"]; r = RES[rid]; unit = r["unit_id"]
            if ds(d) == h["start"]:
                out["care_records"].append({"id": nid(), "recorded_at": f"{ds(d)} 09:40", "resident_id": rid, "category": "特変",
                    "content": {3: "朝から熱が38.2℃、痰がからみ、SpO2 90%。看護師が主治医へ連絡。",
                                2: "朝から息苦しさの訴えあり、両足のむくみが強い。体重が3日で2.0kg増えている。看護師が主治医へ連絡。",
                                6: "夜間に居室で転倒しているところを発見。右の脚の付け根の痛みが強く、立てない。看護師へ連絡し、主治医の指示で救急車を呼ぶ。",
                                9: "朝から熱が38.0℃、SpO2 90%、呼吸が速い。看護師が主治医へ連絡。"}.get(rid, "看護師が主治医へ連絡。"),
                    "staff_name": who(unit, d, "09:40")})
                out["care_records"].append({"id": nid(), "recorded_at": f"{ds(d)} 10:20", "resident_id": rid, "category": "連絡",
                    "content": f"主治医の指示により{h['hospital']}を受診し、そのまま入院（{h['reason']}）。ご家族へ連絡し、病院で合流していただいた。お薬手帳・保険証・介護サマリーを持参。",
                    "staff_name": nurse(d) or who(unit, d, "12:00")})
            if h["end"] and ds(d) == h["end"]:
                out["care_records"].append({"id": nid(), "recorded_at": f"{ds(d)} 14:30", "resident_id": rid, "category": "連絡",
                    "content": f"{h['hospital']}を退院し、ホームへ戻られる。看護師が退院時の情報（お薬の変更・注意すること）を受け取り、職員に伝えた。",
                    "staff_name": nurse(d) or who(unit, d, "12:00")})
                out["care_records"].append({"id": nid(), "recorded_at": f"{ds(d)} 15:30", "resident_id": rid, "category": "介護",
                    "content": pick(rng, ["「やっぱりここがいい」と笑顔。疲れが見えるので居室で休まれる。", "久しぶりのホームに少し戸惑った様子。なじみの職員が声をかけると安心された。"]),
                    "staff_name": who(unit, d, "15:30")})
        for x in roster.DISCHARGE:
            if ds(d) == x["date"]:
                rid = x["rid"]; r = RES[rid]; unit = r["unit_id"]
                out["care_records"].append({"id": nid(), "recorded_at": f"{ds(d)} 05:40", "resident_id": rid, "category": "特変",
                    "content": "5時の巡視で呼吸の間が長くなっていることに気づき、看護師へ連絡。ご家族へ連絡し、来ていただく。", "staff_name": who(unit, d, "05:40")})
                out["care_records"].append({"id": nid(), "recorded_at": f"{ds(d)} 07:10", "resident_id": rid, "category": "看護",
                    "content": "ご家族が見守る中、穏やかに呼吸が止まられた。主治医が来所し確認。看取りの方針どおり、苦痛のない最期だった。職員一同でお見送り。",
                    "staff_name": "鈴木 美智子"})
        for rid, r in RES.items():
            if ds(d) == r["admission_date"]:
                out["care_records"].append({"id": nid(), "recorded_at": f"{ds(d)} 14:30", "resident_id": rid, "category": "介護",
                    "content": "本日入居。長男さんと来られる。居室になじみの家具と写真を置き、ホームの中を案内。少し緊張した表情だが、お茶の時間にはほかの方と話される。",
                    "staff_name": who(r["unit_id"], d, "14:30")})
    return out

if __name__ == "__main__":
    o = generate()
    for k, v in o.items(): print(k, len(v))
