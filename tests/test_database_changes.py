# 第3段階: 変更の記録が再起動をまたいで続くか
import os
import json, os, sqlite3, time, subprocess, sys
sys.argv=['x']
exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'test_database.py'),encoding='utf-8').read().split('subprocess.run([\'pkill\'')[0])
subprocess.run(['pkill','-x','pwsh']); time.sleep(1)
fresh(); p=start(); tok=login()
r0=req('/api/rev',None,tok)[1]['rev']
for i in range(5): add_record(tok, 900000+i, 'chg%d'%i)
r1=req('/api/rev',None,tok)[1]['rev']
st,c=req('/api/changes?since=%d'%r0,None,tok)
check('1 再起動前: 差分が5件', c.get('rev')==r1 and len(c.get('changes',[]))==5, (r0,r1,len(c.get('changes',[]))))
stop(p); p=start(); tok=login()
st,c2=req('/api/changes?since=%d'%r0,None,tok)
check('2 再起動後も差分が5件・中身も同じ', c2.get('full') is None and c2.get('changes')==c.get('changes'), str(c2)[:120])
st,c3=req('/api/changes?since=%d'%(r1-2),None,tok)
check('3 途中の版からは2件', len(c3.get('changes',[]))==2)
# 強制終了でも
add_record(tok, 900010, 'after'); r2=req('/api/rev',None,tok)[1]['rev']
stop(p, hard=True); p=start(); tok=login()
st,c4=req('/api/changes?since=%d'%r0,None,tok)
check('4 強制終了後も続く', c4.get('rev')==r2 and len(c4.get('changes',[]))==6, str(c4)[:100])
# 暗証番号の変更（全体の書き込み）でとぎれる
st,dd=req('/api/data',None,tok); fn=dd.get('facility_name')
st,_=req('/api/save-diff',{'ops':[{'k':'facility_name','t':'set','had':'facility_name' in dd,'b':fn,'v':'テスト施設'}]},tok)
print('slow save',st,_)
r3=req('/api/rev',None,tok)[1]['rev']
st,c5=req('/api/changes?since=%d'%r0,None,tok)
check('5 全体の書き込み後は全体を取りに来させる', c5.get('full')==True and r3==r2+1, (st,c5))
add_record(tok, 900011, 'x'); r4=req('/api/rev',None,tok)[1]['rev']
stop(p); p=start(); tok=login()
st,c6=req('/api/changes?since=%d'%r3,None,tok)
check('6 その後の差分は再起動後も続く', len(c6.get('changes',[]))==1 and c6.get('rev')==r4, str(c6)[:100])
st,c7=req('/api/changes?since=%d'%r0,None,tok)
check('7 とぎれる前の版からは全体', c7.get('full')==True, c7)
# 外から JSON を取り込んだらとぎれる
stop(p)
d=json.load(open(DATA+'/portal_database.json',encoding='utf-8-sig'))
d['care_records'].append({'id':999999,'resident_id':1,'date':'2026-10-17','content':'外から'})
json.dump(d,open(DATA+'/portal_database.json','w',encoding='utf-8'),ensure_ascii=False,separators=(',',':'))
p=start(); tok=login()
st,c8=req('/api/changes?since=%d'%r3,None,tok)
check('8 外からの取り込み後は全体', c8.get('full')==True, c8)
# 500件より古い分は消える
con=sqlite3.connect(DATA+'/portal.db'); n=con.execute('select count(*) from changes').fetchone()[0]; con.close()
check('9 表の行数', n==0, n)
for i in range(510): add_record(tok, 910000+i, 'm%d'%i)
con=sqlite3.connect(DATA+'/portal.db'); n=con.execute('select count(*) from changes').fetchone()[0]; con.close()
check('10 500件で古い分は消す', n==500, n)
stop(p); p=start(); tok=login()
r5=req('/api/rev',None,tok)[1]['rev']
st,c9=req('/api/changes?since=%d'%(r5-500),None,tok)
st,c10=req('/api/changes?since=%d'%(r5-501),None,tok)
check('11 500件前までは差分、それより前は全体', len(c9.get('changes',[]))==500 and c10.get('full')==True)
stop(p)
print('\n合計 %d / %d'%(sum(1 for _,o in results if o),len(results)))
