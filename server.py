# -*- coding: utf-8 -*-
"""
介護施設 統合業務ポータルシステム (Care Portal) - 完全版バックエンド
- 完全契約不要（月額0円）・施設内Wi-Fi専用
- Python標準ライブラリのみで動作 (追加インストール不要)
- SQLite3 データベース & 自動3重バックアップ機能
- 全42項目（現場ケア10種、カルテ、私物行追加、スクショ保管、備品、レク、勤務表A4印刷、
  車両運行管理簿、非常食2週間前、前月誕生日、優しい「修正」ボタン、棚卸し実数合わせなど）
"""

import os
import sys
import json
import sqlite3
import shutil
from datetime import datetime, date, timedelta
from http.server import HTTPServer, SimpleHTTPRequestHandler
import urllib.parse

PORT = 8000
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")
DB_PATH = os.path.join(BASE_DIR, "care_portal.db")
BACKUP_DIR_1 = os.path.join(BASE_DIR, "backup_1")
BACKUP_DIR_2 = os.path.join(BASE_DIR, "backup_2")
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")

os.makedirs(BACKUP_DIR_1, exist_ok=True)
os.makedirs(BACKUP_DIR_2, exist_ok=True)
os.makedirs(STATIC_DIR, exist_ok=True)
os.makedirs(UPLOAD_DIR, exist_ok=True)

def perform_triple_backup():
    """自動3重バックアップ：メインDBを2箇所のバックアップフォルダへミラーリング複製"""
    try:
        if os.path.exists(DB_PATH):
            shutil.copy2(DB_PATH, os.path.join(BACKUP_DIR_1, "care_portal_backup.db"))
            shutil.copy2(DB_PATH, os.path.join(BACKUP_DIR_2, "care_portal_backup.db"))
    except Exception as e:
        print(f"[Backup Error] {e}")

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db_connection()
    c = conn.cursor()

    # 1. 利用者マスタ (フェイスシート・基本台帳)
    c.execute("""
    CREATE TABLE IF NOT EXISTS residents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        room_no TEXT,
        care_level TEXT,
        status TEXT DEFAULT '在所', -- 在所, 入院中, 外泊中, 退所
        birth_date TEXT,            -- 生年月日 (YYYY-MM-DD)
        policy_stamp TEXT DEFAULT '看取り', -- 看取り, 緊急搬送
        sensor_alert TEXT,          -- 見守り注意書き (例: ⚠️ 離床センサーマット使用中)
        emergency_contact TEXT,     -- 続柄・氏名・電話・住所
        family_wishes TEXT,         -- 家族からのご要望
        life_history TEXT,          -- 生活歴・仕事・趣味・こだわり
        paralysis TEXT,             -- 身体状況・麻痺 (右麻痺, 左麻痺等)
        allergies TEXT,             -- アレルギー
        diet_type TEXT,             -- 食事形態 (普通, きざみ, 極小刻み, とろみ等)
        oral_state TEXT,            -- 口腔状態 (残歯, 総義歯, 上下部分義歯等)
        diseases TEXT,              -- 病歴・既往歴 (カンマ区切り)
        care_plan_goal TEXT,        -- ケアマネのケアプラン目標・注意事項
        dr_instructions TEXT,       -- 往診医・受診時指示
        next_clinic_date TEXT,      -- 次回受診・往診予定日
        care_expiry_date TEXT,      -- 要介護認定有効期限
        deposit_balance INTEGER DEFAULT 0 -- 預かり金残高
    )
    """)

    # 2. 介護記録 (文字検索用)
    c.execute("""
    CREATE TABLE IF NOT EXISTS care_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        recorded_at TEXT NOT NULL, -- YYYY-MM-DD HH:MM
        resident_id INTEGER,
        category TEXT,
        content TEXT NOT NULL,
        staff_name TEXT,
        FOREIGN KEY(resident_id) REFERENCES residents(id)
    )
    """)

    # 3. バイタルチェック表
    c.execute("""
    CREATE TABLE IF NOT EXISTS vitals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        time TEXT NOT NULL,
        resident_id INTEGER,
        temperature REAL,
        bp_high INTEGER,
        bp_low INTEGER,
        pulse INTEGER,
        spo2 INTEGER,
        is_unusual INTEGER DEFAULT 0,
        staff_name TEXT,
        FOREIGN KEY(resident_id) REFERENCES residents(id)
    )
    """)

    # 4. 排泄チェック表 (15分刻み・微小中大・水様便)
    c.execute("""
    CREATE TABLE IF NOT EXISTS excretions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        time TEXT NOT NULL,
        resident_id INTEGER,
        urine_flag INTEGER DEFAULT 1,
        stool_amount TEXT,
        stool_condition TEXT,
        notes TEXT,
        staff_name TEXT,
        FOREIGN KEY(resident_id) REFERENCES residents(id)
    )
    """)

    # 5. 食事・水分チェック表
    c.execute("""
    CREATE TABLE IF NOT EXISTS meals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        meal_type TEXT NOT NULL,
        resident_id INTEGER,
        main_dish_ratio INTEGER,
        side_dish_ratio INTEGER,
        water_ml INTEGER,
        notes TEXT,
        staff_name TEXT,
        FOREIGN KEY(resident_id) REFERENCES residents(id)
    )
    """)

    # 6. 口腔ケア・義歯洗浄チェック
    c.execute("""
    CREATE TABLE IF NOT EXISTS oral_cares (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        timing TEXT NOT NULL,
        resident_id INTEGER,
        oral_done INTEGER DEFAULT 0,
        denture_done INTEGER DEFAULT 0,
        notes TEXT,
        staff_name TEXT,
        FOREIGN KEY(resident_id) REFERENCES residents(id)
    )
    """)

    # 7. 入浴チェック表 (備考欄に必要な薬・塗布後メモ自由記載)
    c.execute("""
    CREATE TABLE IF NOT EXISTS baths (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        resident_id INTEGER,
        bath_type TEXT,
        ointment_notes TEXT,
        staff_name TEXT,
        FOREIGN KEY(resident_id) REFERENCES residents(id)
    )
    """)

    # 8. 服薬・点眼チェック表 (ワンタップ)
    c.execute("""
    CREATE TABLE IF NOT EXISTS medication_checks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        slot TEXT NOT NULL,
        resident_id INTEGER,
        status TEXT DEFAULT '未',
        staff_name TEXT,
        FOREIGN KEY(resident_id) REFERENCES residents(id)
    )
    """)

    # 9. 夜勤・体位変換チェック表 (個人記録へ自動転記)
    c.execute("""
    CREATE TABLE IF NOT EXISTS night_turns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        time TEXT NOT NULL,
        resident_id INTEGER,
        action TEXT,
        staff_name TEXT,
        FOREIGN KEY(resident_id) REFERENCES residents(id)
    )
    """)

    # 10. 月次 体重測定表
    c.execute("""
    CREATE TABLE IF NOT EXISTS weight_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        year_month TEXT NOT NULL,
        resident_id INTEGER,
        weight REAL,
        diff_weight REAL,
        staff_name TEXT,
        FOREIGN KEY(resident_id) REFERENCES residents(id)
    )
    """)

    # 11. シーツ・リネン交換チェック表
    c.execute("""
    CREATE TABLE IF NOT EXISTS linen_checks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        resident_id INTEGER,
        exchange_type TEXT DEFAULT '定期交換', -- 定期交換, 臨時汚染交換
        notes TEXT,
        staff_name TEXT,
        FOREIGN KEY(resident_id) REFERENCES residents(id)
    )
    """)

    # 12. 身だしなみチェック表 (爪切り・髭剃り・耳掃除等)
    c.execute("""
    CREATE TABLE IF NOT EXISTS grooming_checks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        resident_id INTEGER,
        nail_done INTEGER DEFAULT 0,
        shave_done INTEGER DEFAULT 0,
        ear_done INTEGER DEFAULT 0,
        notes TEXT,
        staff_name TEXT,
        FOREIGN KEY(resident_id) REFERENCES residents(id)
    )
    """)

    # 13. 私物・持ち込み品管理 (品名と個数の行追加テーブル)
    c.execute("""
    CREATE TABLE IF NOT EXISTS resident_belongings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        resident_id INTEGER,
        category TEXT DEFAULT '衣類', -- 衣類・日用品, 家具・家電・私物
        item_name TEXT NOT NULL,
        quantity TEXT NOT NULL,       -- 例: 4枚, 1台
        marked INTEGER DEFAULT 1,     -- 記名確認
        notes TEXT,
        FOREIGN KEY(resident_id) REFERENCES residents(id)
    )
    """)

    # 14. 同意書・写真スクショ保管 (個人写真＆重要書類、年月自動整理)
    c.execute("""
    CREATE TABLE IF NOT EXISTS resident_files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        resident_id INTEGER,
        folder_type TEXT NOT NULL,    -- 個人写真, 重要書類
        year_month TEXT NOT NULL,     -- YYYY-MM
        title TEXT NOT NULL,
        file_url TEXT,
        notes TEXT,
        uploaded_at TEXT NOT NULL,
        FOREIGN KEY(resident_id) REFERENCES residents(id)
    )
    """)

    # 15. 備品・福祉用具チェック (施設備品 / 個人レンタル / 個人購入)
    c.execute("""
    CREATE TABLE IF NOT EXISTS resident_equipments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        resident_id INTEGER,
        equipment_name TEXT NOT NULL, -- 車椅子, エアマット, 歩行器等
        ownership_type TEXT NOT NULL, -- 施設備品, 個人レンタル, 個人購入
        notes TEXT,
        FOREIGN KEY(resident_id) REFERENCES residents(id)
    )
    """)

    # 16. レク被り防止 (日付と内容の履歴)
    c.execute("""
    CREATE TABLE IF NOT EXISTS recreation_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        title TEXT NOT NULL,
        content TEXT,
        staff_name TEXT
    )
    """)

    # 17. 面会・差し入れ記録 (個人記録自動転記)
    c.execute("""
    CREATE TABLE IF NOT EXISTS visitations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        recorded_at TEXT NOT NULL,
        resident_id INTEGER,
        visitor_name TEXT,
        items TEXT,
        storage_place TEXT,
        notes TEXT,
        staff_name TEXT,
        FOREIGN KEY(resident_id) REFERENCES residents(id)
    )
    """)

    # 18. 連絡帳 ＆ 【認】名前スタンプ (時間なし)
    c.execute("""
    CREATE TABLE IF NOT EXISTS notebooks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        category TEXT,
        content TEXT NOT NULL,
        status TEXT DEFAULT '未対応',
        resolved_staff TEXT,
        staff_name TEXT
    )
    """)
    c.execute("""
    CREATE TABLE IF NOT EXISTS notebook_stamps (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        staff_name TEXT NOT NULL,
        UNIQUE(date, staff_name)
    )
    """)
    c.execute("""
    CREATE TABLE IF NOT EXISTS staff_stamps (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        role TEXT
    )
    """)

    # 19. 定型文マスター
    c.execute("""
    CREATE TABLE IF NOT EXISTS phrase_templates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category TEXT,
        label TEXT NOT NULL,
        phrase TEXT NOT NULL
    )
    """)

    # 20. ヒヤリハット ＆ 事故報告書 (独立修正可能)
    c.execute("""
    CREATE TABLE IF NOT EXISTS incident_reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        report_type TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        resident_id INTEGER,
        place TEXT,
        situation TEXT,
        cause TEXT,
        prevention TEXT,
        supervisor_comment TEXT,
        status TEXT DEFAULT '作成中',
        staff_name TEXT,
        FOREIGN KEY(resident_id) REFERENCES residents(id)
    )
    """)

    # 21. 取引先マスタ (商品名・単価連動)
    c.execute("""
    CREATE TABLE IF NOT EXISTS suppliers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        phone TEXT,
        contact_person TEXT,
        items_json TEXT
    )
    """)

    # 22. 在庫マスタ (小分けバラ単位・棚卸し修正対応)
    c.execute("""
    CREATE TABLE IF NOT EXISTS inventory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        category TEXT,
        current_stock INTEGER DEFAULT 0,
        safety_stock INTEGER DEFAULT 5,
        unit TEXT DEFAULT '個',
        unit_price INTEGER DEFAULT 0,
        is_personal_billable INTEGER DEFAULT 1, -- 1:個人請求対象(オムツ等), 0:施設負担(手袋等)
        supplier_id INTEGER,
        FOREIGN KEY(supplier_id) REFERENCES suppliers(id)
    )
    """)

    # 23. 在庫入出庫履歴 (対応者名付きログ)
    c.execute("""
    CREATE TABLE IF NOT EXISTS inventory_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        item_id INTEGER,
        item_name TEXT,
        action_type TEXT, -- 消費, 納品, 棚卸し修正, 修正取消
        change_qty INTEGER,
        after_qty INTEGER,
        resident_id INTEGER,
        resident_name TEXT,
        staff_name TEXT NOT NULL,
        reason TEXT
    )
    """)

    # 24. 利用者個人消費明細 (請求用小計・合計連動、優しい「修正」対応)
    c.execute("""
    CREATE TABLE IF NOT EXISTS resident_consumptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        consumed_at TEXT NOT NULL,
        resident_id INTEGER,
        item_id INTEGER,
        item_name TEXT,
        quantity INTEGER,
        unit_price INTEGER,
        subtotal INTEGER,
        staff_name TEXT,
        FOREIGN KEY(resident_id) REFERENCES residents(id),
        FOREIGN KEY(item_id) REFERENCES inventory(id)
    )
    """)

    # 25. 発注・上司承認ワークフロー
    c.execute("""
    CREATE TABLE IF NOT EXISTS purchase_orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ordered_at TEXT NOT NULL,
        supplier_id INTEGER,
        supplier_name TEXT,
        item_name TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        unit_price INTEGER,
        total_price INTEGER,
        reason TEXT,
        status TEXT DEFAULT '申請中',
        applicant TEXT,
        approver TEXT,
        approved_at TEXT,
        FOREIGN KEY(supplier_id) REFERENCES suppliers(id)
    )
    """)

    # 26. 預かり金・小遣い出納帳 (理美容代・売店)
    c.execute("""
    CREATE TABLE IF NOT EXISTS deposit_transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        resident_id INTEGER,
        type TEXT NOT NULL,
        category TEXT,
        amount INTEGER NOT NULL,
        balance INTEGER NOT NULL,
        notes TEXT,
        staff_name TEXT,
        FOREIGN KEY(resident_id) REFERENCES residents(id)
    )
    """)

    # 27. 苦情・ご要望 受付簿 (家族手書き対応・監査必須)
    c.execute("""
    CREATE TABLE IF NOT EXISTS complaints (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        received_at TEXT NOT NULL,
        claimant TEXT NOT NULL,
        resident_id INTEGER,
        content TEXT NOT NULL,
        investigation TEXT,
        improvement_plan TEXT,
        reported_at TEXT,
        status TEXT DEFAULT '対応中',
        staff_name TEXT,
        FOREIGN KEY(resident_id) REFERENCES residents(id)
    )
    """)

    # 28. 勤務表・シフト管理 (年月の変更履歴・A4印刷)
    c.execute("""
    CREATE TABLE IF NOT EXISTS shift_schedules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        year_month TEXT NOT NULL, -- YYYY-MM
        staff_name TEXT NOT NULL,
        day_1 TEXT, day_2 TEXT, day_3 TEXT, day_4 TEXT, day_5 TEXT,
        day_6 TEXT, day_7 TEXT, day_8 TEXT, day_9 TEXT, day_10 TEXT,
        day_11 TEXT, day_12 TEXT, day_13 TEXT, day_14 TEXT, day_15 TEXT,
        day_16 TEXT, day_17 TEXT, day_18 TEXT, day_19 TEXT, day_20 TEXT,
        day_21 TEXT, day_22 TEXT, day_23 TEXT, day_24 TEXT, day_25 TEXT,
        day_26 TEXT, day_27 TEXT, day_28 TEXT, day_29 TEXT, day_30 TEXT, day_31 TEXT,
        updated_at TEXT
    )
    """)

    # 29. 公用車・送迎車の車両運行管理簿 (メーターkm・運転者・目的・鍵管理)
    c.execute("""
    CREATE TABLE IF NOT EXISTS vehicle_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        vehicle_name TEXT NOT NULL, -- キャラバン1号, タント2号
        driver_name TEXT NOT NULL,
        purpose TEXT NOT NULL,      -- 受診送迎, 買い物買い出し等
        start_km INTEGER NOT NULL,
        end_km INTEGER NOT NULL,
        distance_km INTEGER NOT NULL, -- 自動計算
        key_returned INTEGER DEFAULT 1, -- 鍵返却確認
        notes TEXT
    )
    """)

    # 30. ワクチン予防接種管理 (同意書有無・接種日・料金連動)
    c.execute("""
    CREATE TABLE IF NOT EXISTS vaccine_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        year TEXT NOT NULL,         -- 2026年度
        resident_id INTEGER,
        vaccine_name TEXT NOT NULL, -- インフルエンザ, 新型コロナ
        consent_status TEXT DEFAULT '同意書受領済', -- 同意書未受領, 同意書受領済, 接種辞退
        vaccinated_date TEXT,
        fee INTEGER DEFAULT 0,
        staff_name TEXT,
        FOREIGN KEY(resident_id) REFERENCES residents(id)
    )
    """)

    # 31. 消防・避難訓練の実施記録 (年2回・法令義務)
    c.execute("""
    CREATE TABLE IF NOT EXISTS fire_drills (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        drill_type TEXT NOT NULL, -- 昼間想定避難訓練, 夜間想定通報・消火訓練
        participants_count INTEGER,
        scenario TEXT,
        notes TEXT,
        supervisor TEXT
    )
    """)

    # 32. 法定委員会・研修の議事録記録 (虐待防止・感染対策・身体拘束・事故再発)
    c.execute("""
    CREATE TABLE IF NOT EXISTS committee_meetings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        committee_name TEXT NOT NULL, -- 虐待防止委員会, 感染症対策委員会, 身体拘束廃止委員会, 事故防止委員会
        attendees TEXT,
        agenda TEXT,
        content TEXT NOT NULL
    )
    """)

    # 33. 非常食・防災備蓄 (独立管理 ＆ 残り2週間で消費促進告知)
    c.execute("""
    CREATE TABLE IF NOT EXISTS emergency_supplies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        unit TEXT DEFAULT '食',
        expiry_date TEXT NOT NULL, -- 賞味期限 (YYYY-MM-DD)
        notes TEXT
    )
    """)

    # 34. 利用・入退所予定スケジュール (ショート/デイ/受診)
    c.execute("""
    CREATE TABLE IF NOT EXISTS schedule_plans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        start_date TEXT NOT NULL,
        end_date TEXT,
        resident_id INTEGER,
        plan_type TEXT NOT NULL, -- ショートステイ入退所, 外泊, 病院受診
        notes TEXT,
        FOREIGN KEY(resident_id) REFERENCES residents(id)
    )
    """)

    conn.commit()

    # 初期シードデータ投入
    c.execute("SELECT COUNT(*) FROM residents")
    if c.fetchone()[0] == 0:
        seed_complete_data(conn)

    conn.close()
    perform_triple_backup()

def seed_complete_data(conn):
    c = conn.cursor()
    # 職員スタンプ
    stamps = [("山田", "介護リーダー"), ("佐藤", "介護職員"), ("鈴木", "看護師"), ("田中", "事務員"), ("施設長", "管理者")]
    c.executemany("INSERT INTO staff_stamps (name, role) VALUES (?, ?)", stamps)

    # 定型文マスター
    templates = [
        ("巡視", "安眠中", "訪室確認。安眠中。呼吸状態安定。"),
        ("巡視", "左側臥位", "確認のため訪室。左側臥位にて入眠中。"),
        ("巡視", "ナースコール対応", "ナースコールあり訪室。排泄介助実施。"),
        ("食事", "全量摂取", "主食・副食ともに全量摂取。むせ込みなし。"),
        ("排泄", "普通便中量", "トイレ誘導にて排尿あり。普通便中等量排便あり。"),
        ("入浴", "軟膏塗布", "一般浴実施。背部・両下腿に保湿軟膏塗布。皮膚状態異常なし。")
    ]
    c.executemany("INSERT INTO phrase_templates (category, label, phrase) VALUES (?, ?, ?)", templates)

    # 利用者 (来月誕生日、見守りセンサー注意書き含む)
    residents = [
        ("佐藤 太郎", "101", "要介護3", "在所", "1940-10-15", "看取り", "⚠️ 離床センサーマット使用中 (ベッド脇)", "長男: 佐藤 一郎 (090-1111-2222)", "本人が穏やかに過ごせるようにお願いします。", "元大工職人。相撲観戦が大好き。頑固だが笑顔が優しい。", "右片麻痺 (左側からの介助推奨)", "卵アレルギー", "普通食 (一口大)", "上部義歯 (下残歯あり)", "糖尿病, 脳梗塞後遺症", "歩行器での安全な移動。食事時のむせ込み予防。", "次回採血予定。低血糖症状に留意。", "2026-10-14", "2026-11-15", 35000),
        ("田中 ハナ", "102", "要介護2", "在所", "1938-11-20", "緊急搬送", "⚠️ ナースコール常時手元配置", "長女: 田中 美咲 (090-3333-4444)", "足元の冷えを気にするので温かくしてください。", "元教員。読書と手芸が趣味。几帳面な性格。", "麻痺なし (膝痛あり)", "なし", "軟飯・一口刻み", "総義歯", "心不全, 高血圧", "下肢の浮腫チェック。水分管理 (1日1200ml程度)。", "利尿剤の継続。体重増加時は連絡。", "2026-10-07", "2026-10-25", 28000),
        ("鈴木 一郎", "103", "要介護4", "在所", "1935-02-15", "看取り", "⚠️ 車椅子移乗時全介助", "妻: 鈴木 和子 (090-5555-6666)", "できるだけ居室で静かに休ませてあげてください。", "元農業。穏やかな性格。家族思い。", "左片麻痺", "そばアレルギー", "極小刻み (とろみ中)", "残歯のみ", "誤嚥性肺炎, パーキンソン病", "食後30分は座位保持。小刻みな歩行に付き添い。", "抗パーキンソン薬の定時内服厳守。", "2026-10-20", "2027-04-30", 42000),
        ("高橋 トメ", "105", "要介護1", "入院中", "1942-08-01", "緊急搬送", "特記なし", "長男: 高橋 健 (090-7777-8888)", "退院時期が決まったらすぐ連絡します。", "元商店経営。明るく社交的。", "麻痺なし", "なし", "普通食", "総義歯", "骨粗鬆症", "転倒予防の見守り。", "大腿骨経過観察中。", "2026-10-10", "2027-01-15", 15000)
    ]
    c.executemany("""
    INSERT INTO residents (name, room_no, care_level, status, birth_date, policy_stamp, sensor_alert, emergency_contact, family_wishes, life_history, paralysis, allergies, diet_type, oral_state, diseases, care_plan_goal, dr_instructions, next_clinic_date, care_expiry_date, deposit_balance)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, residents)

    # 取引先
    suppliers = [
        ("ケアサポート商事", "03-1234-5678", "佐々木", json.dumps([
            {"name": "テープ止めオムツ L", "unit_price": 2600, "unit": "パック"},
            {"name": "テープ止めオムツ M", "unit_price": 2400, "unit": "パック"},
            {"name": "尿取りパッド 4回分", "unit_price": 1400, "unit": "パック"},
            {"name": "使い捨てプラスチック手袋 M", "unit_price": 650, "unit": "箱"}
        ], ensure_ascii=False)),
        ("メディカル薬品", "03-9876-5432", "木村", json.dumps([
            {"name": "ヒルドイドソフト軟膏 100g", "unit_price": 1800, "unit": "本"},
            {"name": "手指消毒用アルコール 1L", "unit_price": 1200, "unit": "本"},
            {"name": "とろみ調整剤 1kg", "unit_price": 2800, "unit": "袋"}
        ], ensure_ascii=False))
    ]
    c.executemany("INSERT INTO suppliers (name, phone, contact_person, items_json) VALUES (?, ?, ?, ?)", suppliers)

    # 在庫 (オムツは個人請求対象1、手袋・消毒は施設負担0)
    inventory = [
        ("テープ止めオムツ L", "オムツ・パッド", 2, 5, "パック", 2600, 1, 1),
        ("テープ止めオムツ M", "オムツ・パッド", 8, 5, "パック", 2400, 1, 1),
        ("尿取りパッド 4回分", "オムツ・パッド", 3, 6, "パック", 1400, 1, 1),
        ("使い捨てプラスチック手袋 M", "衛生用品", 15, 10, "箱", 650, 0, 1),
        ("手指消毒用アルコール 1L", "消毒", 4, 3, "本", 1200, 0, 2),
        ("とろみ調整剤 1kg", "食事関連", 6, 4, "袋", 2800, 1, 2)
    ]
    c.executemany("""
    INSERT INTO inventory (name, category, current_stock, safety_stock, unit, unit_price, is_personal_billable, supplier_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, inventory)

    # 非常食 (賞味期限が2週間後のものを含めてアラート確認可能に)
    supplies = [
        ("保存水 2L (6本入)", 30, "箱", "2028-09-30", "地下備蓄庫"),
        ("アルファ米 白飯 50食", 10, "箱", "2026-10-10", "賞味期限間近・おやつ等で順次消費推奨"),
        ("缶詰パン チョコ味", 40, "缶", "2027-03-31", "1階備蓄庫")
    ]
    c.executemany("""
    INSERT INTO emergency_supplies (name, quantity, unit, expiry_date, notes) VALUES (?, ?, ?, ?, ?)
    """, supplies)

    # 私物管理 (品名と個数の行追加テーブル)
    belongings = [
        (1, "衣類・日用品", "長袖シャツ", "5枚", 1, "全品記名あり"),
        (1, "衣類・日用品", "ズボン", "4本", 1, "ウエストゴム"),
        (1, "家具・家電・私物", "液晶テレビ 24型", "1台", 1, "居室テレビ台設置"),
        (2, "衣類・日用品", "カーディガン", "3着", 1, "娘様持参品")
    ]
    c.executemany("""
    INSERT INTO resident_belongings (resident_id, category, item_name, quantity, marked, notes) VALUES (?, ?, ?, ?, ?, ?)
    """, belongings)

    # 備品・福祉用具チェック
    equipments = [
        (1, "標準自走式車椅子", "施設備品", "ノーパンクタイヤ"),
        (1, "エアマット (ここちあ)", "個人レンタル", "床ずれ防止用・介護保険レンタル"),
        (2, "歩行器 (四輪)", "施設備品", "歩行訓練用")
    ]
    c.executemany("""
    INSERT INTO resident_equipments (resident_id, equipment_name, ownership_type, notes) VALUES (?, ?, ?, ?)
    """, equipments)

    # レク履歴 (被り防止)
    recs = [
        ("2026-09-28", "風船バレー大会", "1階食堂にて開催。参加12名。大いに盛り上がる。", "山田"),
        ("2026-09-29", "秋の歌 音楽療法", "紅葉、赤とんぼ等の合唱。鈴やカスタネット演奏。", "佐藤")
    ]
    c.executemany("INSERT INTO recreation_logs (date, title, content, staff_name) VALUES (?, ?, ?, ?)", recs)

    # 車両運行管理簿
    vlogs = [
        ("2026-09-29", "キャラバン1号", "山田", "佐藤様・田中様 眼科受診送迎", 14520, 14535, 15, 1, "給油なし・異常なし")
    ]
    c.executemany("""
    INSERT INTO vehicle_logs (date, vehicle_name, driver_name, purpose, start_km, end_km, distance_km, key_returned, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, vlogs)

    # 消防訓練
    c.execute("""
    INSERT INTO fire_drills (date, drill_type, participants_count, scenario, notes, supervisor)
    VALUES ('2026-05-20', '昼間想定 避難・消火訓練', 14, '1階厨房からの出火想定。全員避難完了タイム4分12秒。', '消火器放射訓練実施。', '施設長')
    """)

    # 法定委員会
    c.execute("""
    INSERT INTO committee_meetings (date, committee_name, attendees, agenda, content)
    VALUES ('2026-09-15', '身体拘束廃止委員会', '施設長、山田、鈴木、田中', 'スピーチロックの防止とセンサーマット適切な使用', '不要な拘束ゼロの継続確認。各ケース検討。')
    """)

    # 連絡帳 & スタンプ
    today_str = datetime.now().strftime("%Y-%m-%d")
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M")

    c.execute("""
    INSERT INTO notebooks (date, category, content, status, staff_name)
    VALUES (?, '特変申し送り', '佐藤様 14:00頃 体温37.8度の発熱あり。夕方の検温と水分摂取に要留意。', '未対応', '山田')
    """, (today_str,))
    c.execute("""
    INSERT INTO notebooks (date, category, content, status, staff_name)
    VALUES (?, '依頼事項', '田中様のご家族より面会時に靴下の差し入れ預かり。居室へ保管済。', '完了', '佐藤')
    """, (today_str,))
    c.execute("INSERT OR IGNORE INTO notebook_stamps (date, staff_name) VALUES (?, '山田')", (today_str,))

    # 介護記録サンプル
    c.execute("""
    INSERT INTO care_records (recorded_at, resident_id, category, content, staff_name)
    VALUES (?, 1, 'バイタル', '体温 37.8度。少し悪寒の訴えあり。水分補給を促しクーリング実施。', '山田')
    """, (now_str,))
    c.execute("""
    INSERT INTO care_records (recorded_at, resident_id, category, content, staff_name)
    VALUES (?, 2, '特変', '居室にて立ち上がり時にふらつきあり。転倒はなし。見守りを強化。', '佐藤')
    """, (now_str,))

    conn.commit()


# ==============================================================
# HTTP Request Handler (API & Static File Server)
# ==============================================================
class CarePortalHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=STATIC_DIR, **kwargs)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        query = urllib.parse.parse_qs(parsed.query)

        if path.startswith("/api/"):
            self.handle_api_get(path, query)
        else:
            super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length).decode("utf-8") if content_length > 0 else "{}"
        try:
            payload = json.loads(body)
        except Exception:
            payload = {}

        if path.startswith("/api/"):
            self.handle_api_post(path, payload)
        else:
            self.send_error(404, "Not Found")

    def send_json(self, data, status=200):
        resp = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(resp)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(resp)

    def handle_api_get(self, path, query):
        conn = get_db_connection()
        c = conn.cursor()
        try:
            if path == "/api/initial-data":
                residents = [dict(r) for r in c.execute("SELECT * FROM residents ORDER BY room_no ASC").fetchall()]
                inventory = [dict(r) for r in c.execute("""
                    SELECT i.*, s.name as supplier_name 
                    FROM inventory i 
                    LEFT JOIN suppliers s ON i.supplier_id = s.id 
                    ORDER BY i.id ASC
                """).fetchall()]
                suppliers = [dict(r) for r in c.execute("SELECT * FROM suppliers").fetchall()]
                for s in suppliers:
                    s["items"] = json.loads(s["items_json"]) if s.get("items_json") else []
                stamps = [dict(r) for r in c.execute("SELECT * FROM staff_stamps").fetchall()]
                templates = [dict(r) for r in c.execute("SELECT * FROM phrase_templates").fetchall()]
                recs = [dict(r) for r in c.execute("SELECT * FROM recreation_logs ORDER BY date DESC LIMIT 20").fetchall()]
                emergency_supplies = [dict(r) for r in c.execute("SELECT * FROM emergency_supplies ORDER BY expiry_date ASC").fetchall()]

                self.send_json({
                    "residents": residents,
                    "inventory": inventory,
                    "suppliers": suppliers,
                    "stamps": stamps,
                    "templates": templates,
                    "recreations": recs,
                    "emergency_supplies": emergency_supplies
                })

            elif path == "/api/calendar-dates":
                year_month = query.get("month", [datetime.now().strftime("%Y-%m")])[0]
                pattern = f"{year_month}%"
                c.execute("""
                    SELECT DISTINCT substr(recorded_at, 1, 10) as dt FROM care_records WHERE recorded_at LIKE ?
                    UNION
                    SELECT DISTINCT date as dt FROM vitals WHERE date LIKE ?
                    UNION
                    SELECT DISTINCT date as dt FROM excretions WHERE date LIKE ?
                    UNION
                    SELECT DISTINCT date as dt FROM meals WHERE date LIKE ?
                    UNION
                    SELECT DISTINCT date as dt FROM notebooks WHERE date LIKE ?
                """, (pattern, pattern, pattern, pattern, pattern))
                dates = [row["dt"] for row in c.fetchall() if row["dt"]]
                self.send_json({"dates": dates})

            elif path == "/api/records-by-date":
                dt = query.get("date", [datetime.now().strftime("%Y-%m-%d")])[0]
                care_records = [dict(r) for r in c.execute("""
                    SELECT cr.*, res.name as resident_name, res.room_no
                    FROM care_records cr
                    JOIN residents res ON cr.resident_id = res.id
                    WHERE cr.recorded_at LIKE ?
                    ORDER BY cr.recorded_at DESC
                """, (f"{dt}%",)).fetchall()]
                vitals = [dict(r) for r in c.execute("SELECT * FROM vitals WHERE date = ?", (dt,)).fetchall()]
                excretions = [dict(r) for r in c.execute("SELECT * FROM excretions WHERE date = ? ORDER BY time ASC", (dt,)).fetchall()]
                meals = [dict(r) for r in c.execute("SELECT * FROM meals WHERE date = ?", (dt,)).fetchall()]
                oral_cares = [dict(r) for r in c.execute("SELECT * FROM oral_cares WHERE date = ?", (dt,)).fetchall()]
                baths = [dict(r) for r in c.execute("SELECT * FROM baths WHERE date = ?", (dt,)).fetchall()]
                meds = [dict(r) for r in c.execute("SELECT * FROM medication_checks WHERE date = ?", (dt,)).fetchall()]
                turns = [dict(r) for r in c.execute("SELECT * FROM night_turns WHERE date = ? ORDER BY time ASC", (dt,)).fetchall()]
                linens = [dict(r) for r in c.execute("SELECT * FROM linen_checks WHERE date = ?", (dt,)).fetchall()]
                groomings = [dict(r) for r in c.execute("SELECT * FROM grooming_checks WHERE date = ?", (dt,)).fetchall()]
                notebooks = [dict(r) for r in c.execute("SELECT * FROM notebooks WHERE date = ? ORDER BY id ASC", (dt,)).fetchall()]
                stamps = [r["staff_name"] for r in c.execute("SELECT staff_name FROM notebook_stamps WHERE date = ?", (dt,)).fetchall()]

                self.send_json({
                    "date": dt,
                    "care_records": care_records,
                    "vitals": vitals,
                    "excretions": excretions,
                    "meals": meals,
                    "oral_cares": oral_cares,
                    "baths": baths,
                    "meds": meds,
                    "turns": turns,
                    "linens": linens,
                    "groomings": groomings,
                    "notebooks": notebooks,
                    "notebook_stamps": stamps
                })

            elif path == "/api/search":
                q = query.get("q", [""])[0]
                pattern = f"%{q}%"
                results = [dict(r) for r in c.execute("""
                    SELECT cr.id, cr.recorded_at, cr.category, cr.content, cr.staff_name,
                           res.name as resident_name, res.room_no
                    FROM care_records cr
                    JOIN residents res ON cr.resident_id = res.id
                    WHERE cr.content LIKE ? OR cr.category LIKE ? OR res.name LIKE ?
                    ORDER BY cr.recorded_at DESC LIMIT 50
                """, (pattern, pattern, pattern)).fetchall()]
                self.send_json({"results": results})

            elif path == "/api/resident-details":
                res_id = int(query.get("id", [1])[0])
                belongings = [dict(r) for r in c.execute("SELECT * FROM resident_belongings WHERE resident_id = ?", (res_id,)).fetchall()]
                files = [dict(r) for r in c.execute("SELECT * FROM resident_files WHERE resident_id = ? ORDER BY year_month DESC", (res_id,)).fetchall()]
                equipments = [dict(r) for r in c.execute("SELECT * FROM resident_equipments WHERE resident_id = ?", (res_id,)).fetchall()]
                self.send_json({
                    "belongings": belongings,
                    "files": files,
                    "equipments": equipments
                })

            elif path == "/api/office-data":
                orders = [dict(r) for r in c.execute("SELECT * FROM purchase_orders ORDER BY id DESC").fetchall()]
                complaints = [dict(r) for r in c.execute("""
                    SELECT cmp.*, res.name as resident_name 
                    FROM complaints cmp LEFT JOIN residents res ON cmp.resident_id = res.id 
                    ORDER BY cmp.id DESC
                """).fetchall()]
                deposits = [dict(r) for r in c.execute("""
                    SELECT dep.*, res.name as resident_name 
                    FROM deposit_transactions dep JOIN residents res ON dep.resident_id = res.id 
                    ORDER BY dep.id DESC LIMIT 100
                """).fetchall()]
                consumptions = [dict(r) for r in c.execute("""
                    SELECT rc.*, res.name as resident_name 
                    FROM resident_consumptions rc JOIN residents res ON rc.resident_id = res.id 
                    ORDER BY rc.consumed_at DESC
                """).fetchall()]
                incidents = [dict(r) for r in c.execute("""
                    SELECT inc.*, res.name as resident_name 
                    FROM incident_reports inc LEFT JOIN residents res ON inc.resident_id = res.id 
                    ORDER BY inc.id DESC
                """).fetchall()]
                inventory_logs = [dict(r) for r in c.execute("SELECT * FROM inventory_logs ORDER BY id DESC LIMIT 50").fetchall()]
                vehicle_logs = [dict(r) for r in c.execute("SELECT * FROM vehicle_logs ORDER BY id DESC LIMIT 50").fetchall()]
                vaccines = [dict(r) for r in c.execute("""
                    SELECT vac.*, res.name as resident_name 
                    FROM vaccine_records vac JOIN residents res ON vac.resident_id = res.id 
                    ORDER BY vac.id DESC
                """).fetchall()]
                fire_drills = [dict(r) for r in c.execute("SELECT * FROM fire_drills ORDER BY id DESC").fetchall()]
                committees = [dict(r) for r in c.execute("SELECT * FROM committee_meetings ORDER BY id DESC").fetchall()]

                self.send_json({
                    "orders": orders,
                    "complaints": complaints,
                    "deposits": deposits,
                    "consumptions": consumptions,
                    "incidents": incidents,
                    "inventory_logs": inventory_logs,
                    "vehicle_logs": vehicle_logs,
                    "vaccines": vaccines,
                    "fire_drills": fire_drills,
                    "committees": committees
                })

            else:
                self.send_json({"error": "Unknown endpoint"}, status=404)

        except Exception as e:
            self.send_json({"error": str(e)}, status=500)
        finally:
            conn.close()

    def handle_api_post(self, path, payload):
        conn = get_db_connection()
        c = conn.cursor()
        now_str = datetime.now().strftime("%Y-%m-%d %H:%M")
        today_str = datetime.now().strftime("%Y-%m-%d")

        try:
            # 1. 介護記録
            if path == "/api/care-record":
                rec_at = payload.get("recorded_at") or now_str
                c.execute("""
                INSERT INTO care_records (recorded_at, resident_id, category, content, staff_name)
                VALUES (?, ?, ?, ?, ?)
                """, (rec_at, payload["resident_id"], payload.get("category", "介護記録"), payload["content"], payload.get("staff_name", "職員")))
                conn.commit()
                self.send_json({"success": True})

            # 2. バイタル
            elif path == "/api/vitals":
                dt = payload.get("date") or today_str
                tm = payload.get("time") or datetime.now().strftime("%H:%M")
                staff = payload.get("staff_name", "職員")
                c.execute("""
                INSERT INTO vitals (date, time, resident_id, temperature, bp_high, bp_low, pulse, spo2, is_unusual, staff_name)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (dt, tm, payload["resident_id"], payload.get("temperature"), payload.get("bp_high"), payload.get("bp_low"), payload.get("pulse"), payload.get("spo2"), 1 if payload.get("is_unusual") else 0, staff))

                res_name = c.execute("SELECT name FROM residents WHERE id = ?", (payload["resident_id"],)).fetchone()["name"]
                vital_text = f"バイタル測定: 体温{payload.get('temperature', '-')}℃, 血圧{payload.get('bp_high', '-')}/{payload.get('bp_low', '-')}, 脈拍{payload.get('pulse', '-')}, SpO2 {payload.get('spo2', '-')}%"
                c.execute("""
                INSERT INTO care_records (recorded_at, resident_id, category, content, staff_name)
                VALUES (?, ?, 'バイタル', ?, ?)
                """, (f"{dt} {tm}", payload["resident_id"], vital_text, staff))

                if payload.get("is_unusual"):
                    c.execute("""
                    INSERT INTO notebooks (date, category, content, status, staff_name)
                    VALUES (?, '特変申し送り', ?, '未対応', ?)
                    """, (dt, f"【特変】{res_name}様 {vital_text} (通常値と差異あり)", staff))

                conn.commit()
                self.send_json({"success": True})

            # 3. 排泄
            elif path == "/api/excretions":
                c.execute("""
                INSERT INTO excretions (date, time, resident_id, urine_flag, stool_amount, stool_condition, notes, staff_name)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, (payload["date"], payload["time"], payload["resident_id"], payload.get("urine_flag", 1), payload.get("stool_amount", "なし"), payload.get("stool_condition", "普通便"), payload.get("notes", ""), payload.get("staff_name", "職員")))
                conn.commit()
                self.send_json({"success": True})

            # 4. 食事・水分
            elif path == "/api/meals":
                c.execute("""
                INSERT INTO meals (date, meal_type, resident_id, main_dish_ratio, side_dish_ratio, water_ml, notes, staff_name)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, (payload["date"], payload["meal_type"], payload["resident_id"], payload.get("main_dish_ratio", 10), payload.get("side_dish_ratio", 10), payload.get("water_ml", 0), payload.get("notes", ""), payload.get("staff_name", "職員")))
                conn.commit()
                self.send_json({"success": True})

            # 5. 口腔ケア
            elif path == "/api/oral-care":
                c.execute("""
                INSERT INTO oral_cares (date, timing, resident_id, oral_done, denture_done, notes, staff_name)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """, (payload["date"], payload["timing"], payload["resident_id"], payload.get("oral_done", 0), payload.get("denture_done", 0), payload.get("notes", ""), payload.get("staff_name", "職員")))
                conn.commit()
                self.send_json({"success": True})

            # 6. 入浴 ＆ 塗布薬
            elif path == "/api/baths":
                c.execute("""
                INSERT INTO baths (date, resident_id, bath_type, ointment_notes, staff_name)
                VALUES (?, ?, ?, ?, ?)
                """, (payload["date"], payload["resident_id"], payload.get("bath_type", "一般浴"), payload.get("ointment_notes", ""), payload.get("staff_name", "職員")))
                conn.commit()
                self.send_json({"success": True})

            # 7. 服薬・点眼
            elif path == "/api/meds":
                c.execute("""
                INSERT INTO medication_checks (date, slot, resident_id, status, staff_name)
                VALUES (?, ?, ?, '済', ?)
                """, (payload["date"], payload["slot"], payload["resident_id"], payload.get("staff_name", "職員")))
                conn.commit()
                self.send_json({"success": True})

            # 8. 夜勤体位変換 ➔ 個人記録自動転記
            elif path == "/api/night-turns":
                dt = payload.get("date") or today_str
                c.execute("""
                INSERT INTO night_turns (date, time, resident_id, action, staff_name)
                VALUES (?, ?, ?, ?, ?)
                """, (dt, payload["time"], payload["resident_id"], payload["action"], payload.get("staff_name", "夜勤職員")))

                c.execute("""
                INSERT INTO care_records (recorded_at, resident_id, category, content, staff_name)
                VALUES (?, ?, '巡視', ?, ?)
                """, (f"{dt} {payload['time']}", payload["resident_id"], f"夜間巡視: {payload['action']}", payload.get("staff_name", "夜勤職員")))
                conn.commit()
                self.send_json({"success": True})

            # 9. シーツ・リネン交換
            elif path == "/api/linen-checks":
                c.execute("""
                INSERT INTO linen_checks (date, resident_id, exchange_type, notes, staff_name)
                VALUES (?, ?, ?, ?, ?)
                """, (payload.get("date", today_str), payload["resident_id"], payload.get("exchange_type", "定期交換"), payload.get("notes", ""), payload.get("staff_name", "職員")))
                conn.commit()
                self.send_json({"success": True})

            # 10. 身だしなみチェック
            elif path == "/api/grooming-checks":
                c.execute("""
                INSERT INTO grooming_checks (date, resident_id, nail_done, shave_done, ear_done, notes, staff_name)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """, (payload.get("date", today_str), payload["resident_id"], payload.get("nail_done", 0), payload.get("shave_done", 0), payload.get("ear_done", 0), payload.get("notes", ""), payload.get("staff_name", "職員")))
                conn.commit()
                self.send_json({"success": True})

            # 11. 私物管理 (行追加)
            elif path == "/api/resident-belongings":
                c.execute("""
                INSERT INTO resident_belongings (resident_id, category, item_name, quantity, marked, notes)
                VALUES (?, ?, ?, ?, ?, ?)
                """, (payload["resident_id"], payload.get("category", "衣類・日用品"), payload["item_name"], payload["quantity"], payload.get("marked", 1), payload.get("notes", "")))
                conn.commit()
                self.send_json({"success": True})

            # 12. 現場クイック消費 (優しい「修正」対応 ＆ 対応者名ログ)
            elif path == "/api/consume-item":
                item = c.execute("SELECT * FROM inventory WHERE id = ?", (payload["item_id"],)).fetchone()
                res = c.execute("SELECT name FROM residents WHERE id = ?", (payload["resident_id"],)).fetchone()
                qty = int(payload.get("quantity", 1))
                subtotal = item["unit_price"] * qty
                staff = payload.get("staff_name", "職員")

                # 個人請求対象品目のみ請求テーブルへ
                if item["is_personal_billable"] == 1:
                    c.execute("""
                    INSERT INTO resident_consumptions (consumed_at, resident_id, item_id, item_name, quantity, unit_price, subtotal, staff_name)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """, (now_str, payload["resident_id"], item["id"], item["name"], qty, item["unit_price"], subtotal, staff))

                # 在庫マイナス
                c.execute("UPDATE inventory SET current_stock = current_stock - ? WHERE id = ?", (qty, item["id"]))
                after_stock = item["current_stock"] - qty

                # 入出庫ログ
                c.execute("""
                INSERT INTO inventory_logs (timestamp, item_id, item_name, action_type, change_qty, after_qty, resident_id, resident_name, staff_name, reason)
                VALUES (?, ?, ?, '消費', ?, ?, ?, ?, ?, 'ケア時使用')
                """, (now_str, item["id"], item["name"], -qty, after_stock, payload["resident_id"], res["name"], staff))

                conn.commit()
                self.send_json({"success": True, "message": f"{item['name']} を{qty}点消費しました"})

            # 13. 現場消費の「修正」ボタン (押し間違いを元に戻す)
            elif path == "/api/consume-rollback":
                log_id = payload["log_id"]
                log = c.execute("SELECT * FROM inventory_logs WHERE id = ?", (log_id,)).fetchone()
                staff = payload.get("staff_name", "職員")
                if log and log["action_type"] == "消費":
                    add_qty = abs(log["change_qty"])
                    c.execute("UPDATE inventory SET current_stock = current_stock + ? WHERE id = ?", (add_qty, log["item_id"]))
                    cur = c.execute("SELECT current_stock FROM inventory WHERE id = ?", (log["item_id"],)).fetchone()["current_stock"]
                    
                    # 請求明細からも直近のレコードを削除
                    c.execute("""
                    DELETE FROM resident_consumptions 
                    WHERE resident_id = ? AND item_id = ? 
                    ORDER BY id DESC LIMIT 1
                    """, (log["resident_id"], log["item_id"]))

                    # 修正ログ
                    c.execute("""
                    INSERT INTO inventory_logs (timestamp, item_id, item_name, action_type, change_qty, after_qty, resident_id, resident_name, staff_name, reason)
                    VALUES (?, ?, ?, '修正取消', ?, ?, ?, ?, ?, '押し直し修正')
                    """, (now_str, log["item_id"], log["item_name"], add_qty, cur, log["resident_id"], log["resident_name"], staff))
                    conn.commit()
                self.send_json({"success": True, "message": "入力を修正・取消しました"})

            # 14. 棚卸し実数合わせ (月末の直接修正)
            elif path == "/api/inventory/adjust":
                item_id = payload["item_id"]
                actual_qty = int(payload["actual_stock"])
                reason = payload.get("reason", "月末棚卸し実数合わせ")
                staff = payload.get("staff_name", "管理者")

                item = c.execute("SELECT * FROM inventory WHERE id = ?", (item_id,)).fetchone()
                diff = actual_qty - item["current_stock"]
                c.execute("UPDATE inventory SET current_stock = ? WHERE id = ?", (actual_qty, item_id))

                c.execute("""
                INSERT INTO inventory_logs (timestamp, item_id, item_name, action_type, change_qty, after_qty, staff_name, reason)
                VALUES (?, ?, ?, '棚卸し修正', ?, ?, ?, ?)
                """, (now_str, item["id"], item["name"], diff, actual_qty, staff, reason))
                conn.commit()
                self.send_json({"success": True})

            # 15. 車両運行管理簿
            elif path == "/api/vehicle-logs":
                dist = int(payload["end_km"]) - int(payload["start_km"])
                c.execute("""
                INSERT INTO vehicle_logs (date, vehicle_name, driver_name, purpose, start_km, end_km, distance_km, key_returned, notes)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (payload.get("date", today_str), payload["vehicle_name"], payload["driver_name"], payload["purpose"], payload["start_km"], payload["end_km"], dist, payload.get("key_returned", 1), payload.get("notes", "")))
                conn.commit()
                self.send_json({"success": True})

            # 16. 非常食の登録・更新
            elif path == "/api/emergency-supplies":
                c.execute("""
                INSERT INTO emergency_supplies (name, quantity, unit, expiry_date, notes)
                VALUES (?, ?, ?, ?, ?)
                """, (payload["name"], payload["quantity"], payload.get("unit", "食"), payload["expiry_date"], payload.get("notes", "")))
                conn.commit()
                self.send_json({"success": True})

            # 17. 消防訓練の登録
            elif path == "/api/fire-drills":
                c.execute("""
                INSERT INTO fire_drills (date, drill_type, participants_count, scenario, notes, supervisor)
                VALUES (?, ?, ?, ?, ?, ?)
                """, (payload["date"], payload["drill_type"], payload["participants_count"], payload["scenario"], payload.get("notes", ""), payload.get("supervisor", "施設長")))
                conn.commit()
                self.send_json({"success": True})

            # 18. 法定委員会・研修の登録
            elif path == "/api/committee-meetings":
                c.execute("""
                INSERT INTO committee_meetings (date, committee_name, attendees, agenda, content)
                VALUES (?, ?, ?, ?, ?)
                """, (payload["date"], payload["committee_name"], payload["attendees"], payload["agenda"], payload["content"]))
                conn.commit()
                self.send_json({"success": True})

            # 19. 連絡帳 ＆ スタンプ
            elif path == "/api/notebook":
                c.execute("""
                INSERT INTO notebooks (date, category, content, status, staff_name)
                VALUES (?, ?, ?, '未対応', ?)
                """, (payload["date"], payload.get("category", "申し送り"), payload["content"], payload.get("staff_name", "職員")))
                conn.commit()
                self.send_json({"success": True})

            elif path == "/api/notebook/resolve":
                c.execute("UPDATE notebooks SET status = '完了', resolved_staff = ? WHERE id = ?", (payload.get("staff_name", "職員"), payload["id"]))
                conn.commit()
                self.send_json({"success": True})

            elif path == "/api/notebook/stamp":
                c.execute("INSERT OR IGNORE INTO notebook_stamps (date, staff_name) VALUES (?, ?)", (payload["date"], payload["staff_name"]))
                conn.commit()
                self.send_json({"success": True})

            elif path == "/api/staff-stamps":
                c.execute("INSERT INTO staff_stamps (name, role) VALUES (?, ?)", (payload["name"], payload.get("role", "職員")))
                conn.commit()
                self.send_json({"success": True})

            # 20. 発注申請 ＆ 上司承認
            elif path == "/api/orders/apply":
                c.execute("""
                INSERT INTO purchase_orders (ordered_at, supplier_id, supplier_name, item_name, quantity, unit_price, total_price, reason, applicant)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (today_str, payload["supplier_id"], payload["supplier_name"], payload["item_name"], payload["quantity"], payload.get("unit_price", 0), payload.get("total_price", 0), payload.get("reason", "補充"), payload.get("applicant", "事務員")))
                conn.commit()
                self.send_json({"success": True})

            elif path == "/api/orders/approve":
                c.execute("""
                UPDATE purchase_orders SET status = ?, approver = ?, approved_at = ? WHERE id = ?
                """, (payload.get("status", "承認済"), payload.get("approver", "施設長"), now_str, payload["id"]))
                conn.commit()
                self.send_json({"success": True})

            elif path == "/api/orders/receive":
                order = c.execute("SELECT * FROM purchase_orders WHERE id = ?", (payload["id"],)).fetchone()
                c.execute("UPDATE purchase_orders SET status = '納品完了' WHERE id = ?", (payload["id"],))
                c.execute("UPDATE inventory SET current_stock = current_stock + ? WHERE name = ?", (order["quantity"], order["item_name"]))
                
                item = c.execute("SELECT * FROM inventory WHERE name = ?", (order["item_name"],)).fetchone()
                if item:
                    c.execute("""
                    INSERT INTO inventory_logs (timestamp, item_id, item_name, action_type, change_qty, after_qty, staff_name, reason)
                    VALUES (?, ?, ?, '納品', ?, ?, ?, '発注受取納品')
                    """, (now_str, item["id"], item["name"], order["quantity"], item["current_stock"], payload.get("staff_name", "事務員")))

                conn.commit()
                self.send_json({"success": True, "message": "納品を受領し、在庫に加算しました"})

            # 21. 預かり金出納
            elif path == "/api/deposits":
                res = c.execute("SELECT deposit_balance FROM residents WHERE id = ?", (payload["resident_id"],)).fetchone()
                current_bal = res["deposit_balance"] if res else 0
                amount = int(payload["amount"])
                txn_type = payload["type"]
                new_bal = current_bal + amount if txn_type == "入金" else current_bal - amount

                c.execute("""
                INSERT INTO deposit_transactions (date, resident_id, type, category, amount, balance, notes, staff_name)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, (payload.get("date", today_str), payload["resident_id"], txn_type, payload.get("category", "訪問理美容代"), amount, new_bal, payload.get("notes", ""), payload.get("staff_name", "事務員")))
                c.execute("UPDATE residents SET deposit_balance = ? WHERE id = ?", (new_bal, payload["resident_id"]))
                conn.commit()
                self.send_json({"success": True, "new_balance": new_bal})

            # 22. 苦情受付
            elif path == "/api/complaints":
                c.execute("""
                INSERT INTO complaints (received_at, claimant, resident_id, content, investigation, improvement_plan, reported_at, status, staff_name)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (payload.get("received_at", today_str), payload["claimant"], payload.get("resident_id"), payload["content"], payload.get("investigation", ""), payload.get("improvement_plan", ""), payload.get("reported_at", ""), payload.get("status", "受付"), payload.get("staff_name", "受付者")))
                conn.commit()
                self.send_json({"success": True})

            # 23. ヒヤリハット ＆ 事故報告書
            elif path == "/api/incidents":
                if payload.get("id"):
                    c.execute("""
                    UPDATE incident_reports 
                    SET place = ?, situation = ?, cause = ?, prevention = ?, supervisor_comment = ?, status = ?
                    WHERE id = ?
                    """, (payload.get("place"), payload.get("situation"), payload.get("cause"), payload.get("prevention"), payload.get("supervisor_comment"), payload.get("status", "作成中"), payload["id"]))
                else:
                    c.execute("""
                    INSERT INTO incident_reports (report_type, occurred_at, resident_id, place, situation, cause, prevention, supervisor_comment, staff_name)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (payload["report_type"], payload["occurred_at"], payload.get("resident_id"), payload.get("place"), payload.get("situation"), payload.get("cause", ""), payload.get("prevention", ""), payload.get("supervisor_comment", ""), payload.get("staff_name", "職員")))
                conn.commit()
                self.send_json({"success": True})

            # 24. 面会・荷物受付
            elif path == "/api/visitations":
                staff = payload.get("staff_name", "職員")
                c.execute("""
                INSERT INTO visitations (recorded_at, resident_id, visitor_name, items, storage_place, notes, staff_name)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """, (now_str, payload["resident_id"], payload.get("visitor_name"), payload.get("items"), payload.get("storage_place"), payload.get("notes"), staff))

                content_text = f"ご面会 ({payload.get('visitor_name')}様)。持参品: {payload.get('items')} (保管: {payload.get('storage_place')})。{payload.get('notes', '')}"
                c.execute("""
                INSERT INTO care_records (recorded_at, resident_id, category, content, staff_name)
                VALUES (?, ?, '面会', ?, ?)
                """, (now_str, payload["resident_id"], content_text, staff))
                conn.commit()
                self.send_json({"success": True})

            # 25. 在籍ステータス更新
            elif path == "/api/resident/status":
                c.execute("UPDATE residents SET status = ? WHERE id = ?", (payload["status"], payload["resident_id"]))
                conn.commit()
                self.send_json({"success": True})

            else:
                self.send_json({"error": "Unknown endpoint"}, status=404)

        except Exception as e:
            self.send_json({"error": str(e)}, status=500)
        finally:
            conn.close()
            perform_triple_backup()


def run_server():
    init_db()
    server_address = ("", PORT)
    httpd = HTTPServer(server_address, CarePortalHandler)
    print("=" * 70)
    print(f" 🏢 介護施設 統合業務ポータルシステム (Care Portal) 完全版")
    print(f" ▶ 施設内ローカルURL: http://localhost:{PORT}")
    print(f" ▶ 自動3重バックアップ稼働中 (メインDB + backup_1 + backup_2)")
    print("=" * 70)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nサーバーを停止しました。")
        httpd.server_close()

if __name__ == "__main__":
    run_server()
