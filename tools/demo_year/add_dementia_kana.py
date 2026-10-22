# デモの19人に「認知症高齢者の日常生活自立度」と「氏名カナ」を入れる（2026-10-22 あなたの了承）
# 使い方（サーバーを止めて）: python3 tools/demo_year/add_dementia_kana.py data/portal_database.json
# 2回動かしても同じ結果になる（入れ済みの人は飛ばす）
import json, sys
path = sys.argv[1]
raw = open(path, 'rb').read()
bom = raw.startswith(b'\xef\xbb\xbf')
d = json.loads(raw.decode('utf-8-sig'))

# 判定日 2025-10-01（認定調査票）。大野さんは入居日 2026-05-18
RANK = {
 '佐藤 太郎': 'Ⅱb', '田中 ハナ': 'Ⅰ', '鈴木 一郎': 'Ⅱa', '高橋 トメ': 'Ⅱa', '山本 キヨ': 'Ⅲa', '中島 正雄': 'Ⅲa',
 '小川 フミ': 'Ⅳ', '岡田 シズ子': 'Ⅱb', '前田 勝': 'Ⅲa', '藤井 ハル': 'Ⅲb', '石井 トシ子': 'Ⅲb', '坂本 茂': 'Ⅳ',
 '森 ヨシエ': 'Ⅲa', '池田 久子': 'Ⅲa', '橋本 清': 'Ⅲa', '青木 ミツ': 'Ⅲa', '西村 澄子': 'Ⅱb', '福田 光男': 'Ⅱb', '大野 和子': 'Ⅱb'}
KANA = {
 '佐藤 太郎': ('サトウ', 'タロウ'), '田中 ハナ': ('タナカ', 'ハナ'), '鈴木 一郎': ('スズキ', 'イチロウ'), '高橋 トメ': ('タカハシ', 'トメ'),
 '山本 キヨ': ('ヤマモト', 'キヨ'), '中島 正雄': ('ナカジマ', 'マサオ'), '小川 フミ': ('オガワ', 'フミ'), '岡田 シズ子': ('オカダ', 'シズコ'),
 '前田 勝': ('マエダ', 'マサル'), '藤井 ハル': ('フジイ', 'ハル'), '石井 トシ子': ('イシイ', 'トシコ'), '坂本 茂': ('サカモト', 'シゲル'),
 '森 ヨシエ': ('モリ', 'ヨシエ'), '池田 久子': ('イケダ', 'ヒサコ'), '橋本 清': ('ハシモト', 'キヨシ'), '青木 ミツ': ('アオキ', 'ミツ'),
 '西村 澄子': ('ニシムラ', 'スミコ'), '福田 光男': ('フクダ', 'ミツオ'), '大野 和子': ('オオノ', 'カズコ')}

res = {r['name']: r for r in d['residents']}
missing = [n for n in RANK if n not in res]
if missing: raise SystemExit('利用者が見つからない: ' + ','.join(missing))
da = d.setdefault('dementia_assessments', [])
have = {a.get('resident_id') for a in da if not a.get('voided')}
added = kana = 0
for i, (name, rank) in enumerate(RANK.items()):
    r = res[name]
    if r['id'] not in have:
        on = r['admission_date'] if r['admission_date'] > '2025-10-01' else '2025-10-01'
        da.append({'id': 1795100000001 + i, 'resident_id': r['id'], 'rank': rank, 'assessed_on': on, 'basis': '認定調査票',
                   'doctor_name': '', 'recorded_by': '小林 恵子', 'recorded_at': on + ' 10:00', 'voided': False,
                   'void_reason': '', 'voided_by': '', 'voided_at': ''})
        added += 1
    ln, fn = KANA[name]
    if not r.get('last_name_kana') and not r.get('first_name_kana'):
        r['last_name_kana'] = ln; r['first_name_kana'] = fn; kana += 1
out = json.dumps(d, ensure_ascii=False, separators=(',', ':'))
open(path, 'wb').write((b'\xef\xbb\xbf' if bom else b'') + out.encode('utf-8'))
print(f'自立度 {added}人・カナ {kana}人 を入れました')
