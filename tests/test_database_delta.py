# 第2段階: 差分の書き込みが、全体を書いたときと同じ中身になるか（ランダムな保存の連続 → 再起動して読み直して比べる）
import random, json, time, sys
sys.argv=['x']
exec(open('/home/claude/dbwork/tdb.py').read().split("subprocess.run(['pkill'")[0])
import subprocess
subprocess.run(['pkill','-x','pwsh']); time.sleep(1)
fresh(); p=start(); tok=login()
random.seed(7)
st,cur=req('/api/data',None,tok)
okcount=0; conflicts=0
for n in range(150):
    coll=random.choice(['care_records','vitals','meals','notebooks','incidents'])
    lst=cur.get(coll) or []
    r=random.random()
    if r<0.4 or not lst:
        rid=random.choice([str(600000+n), 600000+n])   # 文字の id と数字の id の両方
        v={'id':rid,'resident_id':1,'date':'2026-10-17','content':f'delta {n}','memo':'改行\n"引用"\\'}
        ops=[{'k':coll,'t':'up','id':str(rid),'v':v,'b':None}]
        if lst and random.random()<0.5: ops[0]['before']=str(lst[0].get('id'))
    elif r<0.75:
        old=random.choice(lst); v=dict(old); v['content']=f'changed {n}'
        ops=[{'k':coll,'t':'up','id':str(old['id']),'v':v,'b':old}]
    elif r<0.9:
        old=random.choice(lst)
        ops=[{'k':coll,'t':'rm','id':str(old['id']),'b':old}]
    else:
        ops=[{'k':'dismissed_alerts','t':'set','had':True,'b':cur.get('dismissed_alerts'),'v':dict(cur.get('dismissed_alerts') or {}, **{f'x{n}':{'at':'now'}})}]
    if random.random()<0.2 and len(ops)==1:  # 1回の保存で2つの記録
        o2=dict(ops[0]); 
        if o2['t']=='up' and o2.get('b') is None:
            rid2=700000+n; v2={'id':rid2,'resident_id':2,'content':'two'}
            ops.append({'k':coll,'t':'up','id':str(rid2),'v':v2,'b':None})
    s_,res=req('/api/save-diff',{'ops':ops},tok)
    if s_==200: okcount+=1
    else: conflicts+=1
    st,cur=req('/api/data',None,tok)
before=cur
stop(p); p=start(); tok=login()
st,after=req('/api/data',None,tok)
same=(json.dumps(before,ensure_ascii=False,sort_keys=False)==json.dumps(after,ensure_ascii=False,sort_keys=False))
print('saves ok',okcount,'conflicts',conflicts,'reload identical (order too):',same)
if not same:
    for k in before:
        if before[k]!=after.get(k): print('diff key',k); break
stop(p)
