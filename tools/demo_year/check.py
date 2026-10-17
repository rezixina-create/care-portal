import json, collections, sys, datetime as DT
sys.path.insert(0,'.'); import gen_daily as G, roster
d=json.load(open('demo_year.json',encoding='utf-8'))
errs=collections.Counter(); ex={}
def bad(k,msg):
    errs[k]+=1; ex.setdefault(k,msg)
staff=set(s['name'] for s in d['stamps'])
ids=collections.Counter()
for k,v in d.items():
    if isinstance(v,list):
        for x in v:
            if isinstance(x,dict) and 'id' in x: ids[(k,x['id'])]+=1
for (k,i),n in ids.items():
    if n>1: bad('dup_id',(k,i))
EN={'stool_amount':{'なし','付着','微量','少量','中量','多量'},'stool_condition':{'なし','普通便','軟便','水様便','泥状便','硬便'},
    'meal_type':{'朝食','昼食','夕食','おやつ','その他'},'bath_type':{'一般浴','特浴','清拭','見合わせ'},'exchange_type':{'定期交換','臨時汚染交換'},
    'action':{'安眠中','左側臥位','右側臥位','仰臥位','おむつ交換'}}
for k in ['vitals','meals','excretions','oral_cares','meds','baths','groomings','turns','weight_records','linens','care_records','topical_records','visitations']:
    for x in d[k]:
        rid=x.get('resident_id'); date=x.get('date') or (x.get('recorded_at') or x.get('done_at'))[:10]
        hh=(x.get('time') or (x.get('recorded_at') or x.get('done_at') or ' 12:00')[11:16] or '12:00')
        if k in('oral_cares','groomings','linens','weight_records'): hh=hh if x.get('time') else '12:00'
        if not G.here(rid, DT.date.fromisoformat(date), hh if k not in('oral_cares','groomings','linens','weight_records') else '12:00') and k not in ('oral_cares','groomings','linens','weight_records'):
            bad('not_here_'+k,(rid,date,hh,str(x)[:80]))
        sn=x.get('staff_name')
        if sn and sn.split(' (')[0] not in staff: bad('staff',sn)
        for f,allowed in EN.items():
            if f in x and x[f] not in allowed: bad('enum_'+f,x[f])
for r in d['recreations']:
    dd=DT.date.fromisoformat(r['date'])
    if r['participants_count']>sum(1 for p in roster.R if G.here(p['id'],dd,'14:00')): bad('rec_count',r)
# 3日以上便なしの日数
print('件数', {k:len(v) for k,v in d.items() if isinstance(v,list) and len(v)>50})
print('問題', dict(errs)); [print(' ',k,str(v)[:200]) for k,v in ex.items()]
