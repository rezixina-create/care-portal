# デモで国保連の請求ファイルを作れるように、19人の請求の項目と事業所の設定を入れる（2026-10-22 あなた「あなたがデモいれてください」）
# 番号は架空。被保険者番号・保険者番号・事業所番号は、国保中央会・厚労省の仕様書の「入力例」にある 99 で始まる形にした（実在の番号と重ならないように）
# 使い方（サーバーを止めて）: python3 tools/demo_year/add_billing_demo.py data/portal_database.json
# 2回動かしても同じ結果になる（入っている項目は上書きしない）
import json, sys, datetime
path = sys.argv[1]
raw = open(path, 'rb').read()
bom = raw.startswith(b'\xef\xbb\xbf')
d = json.loads(raw.decode('utf-8-sig'))

MALE = {'佐藤 太郎', '中島 正雄', '前田 勝', '鈴木 一郎', '坂本 茂', '橋本 清', '福田 光男'}
RATE80 = {'鈴木 一郎', '高橋 トメ'}            # 2割負担
FROM_HOSPITAL = {'小川 フミ', '坂本 茂', '鈴木 一郎', '前田 勝'}  # 入居前は医療機関（2）、ほかは居宅（1）
n = 0
for i, r in enumerate(d['residents']):
    nm = r['name']
    def setdef(k, v):
        global n
        if r.get(k) in (None, ''):
            r[k] = v; n += 1
    setdef('insured_no', '99%08d' % (i + 1))
    setdef('insurer_no', '990001')
    setdef('gender', '1' if nm in MALE else '2')
    setdef('benefit_rate', '80' if nm in RATE80 else '90')
    if r.get('care_expiry_date') and not r.get('care_start_date'):
        e = datetime.date.fromisoformat(r['care_expiry_date'])
        try: s = e.replace(year=e.year - 1) + datetime.timedelta(days=1)
        except ValueError: s = e.replace(year=e.year - 1, day=28) + datetime.timedelta(days=1)
        r['care_start_date'] = s.isoformat(); n += 1     # 認定の有効期間は1年として、終了日から開始日を出す
    setdef('pre_admission_status', '2' if nm in FROM_HOSPITAL else '1')
    if r.get('status') == '退所' and '死亡' in str(r.get('discharge_reason') or ''):
        setdef('post_discharge_status', '4')
    if not r.get('usage_type'):
        r['usage_type'] = 'resident'; n += 1

ks = d.setdefault('kasan_settings', {})
for k, v in {'office_no': '9900000001', 'media_code': '7', 'region_type': 'その他', 'capacity': 18}.items():
    if ks.get(k) in (None, ''):
        ks[k] = v; n += 1

out = json.dumps(d, ensure_ascii=False, separators=(',', ':'))
open(path, 'wb').write((b'\xef\xbb\xbf' if bom else b'') + out.encode('utf-8'))
print(f'{n} 項目を入れました')
