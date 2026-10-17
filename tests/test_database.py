# データベース（SQLite）化の確認テスト
import json, urllib.request, subprocess, time, os, shutil, sqlite3, hashlib, sys, threading
SRV='/home/claude/srv2'; DATA=SRV+'/data'; ORIG='/home/claude/dbwork/orig.json'
def start(env=None):
    e=dict(os.environ); e.update(env or {})
    p=subprocess.Popen(['/tmp/pwsh/pwsh','-File','server.ps1','-NoBrowser','-NoTunnel'],cwd=SRV,stdout=open('/tmp/srv2.log','ab'),stderr=subprocess.STDOUT,env=e)
    for _ in range(60):
        time.sleep(0.5)
        try:
            urllib.request.urlopen('http://localhost:8888/',timeout=2); return p
        except Exception: pass
    raise Exception('server did not start')
def stop(p, hard=False):
    if hard: p.kill()
    else: p.terminate()
    p.wait(); time.sleep(0.5)
def req(path, body=None, tok=None):
    r=urllib.request.Request('http://localhost:8888'+path, data=json.dumps(body).encode() if body is not None else None, method='POST' if body is not None else 'GET')
    r.add_header('Content-Type','application/json')
    if tok: r.add_header('X-Session-Token',tok)
    try:
        with urllib.request.urlopen(r,timeout=20) as f: return f.status, json.loads(f.read() or b'{}')
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b'{}')
def login(): return req('/api/login',{'staff_name':'木村 健一','staff_id':'aaaa','password':'0000'})[1]['token']
def fresh():
    for f in os.listdir(DATA):
        if f.startswith('portal'): os.remove(os.path.join(DATA,f))
    shutil.rmtree(DATA+'/backup',ignore_errors=True)
    shutil.copy(ORIG, DATA+'/portal_database.json')
def add_record(tok, rid, text):
    st,d=req('/api/rev',None,tok)
    return req('/api/save-diff',{'ops':[{'k':'care_records','t':'up','id':str(rid),'v':{'id':rid,'resident_id':1,'date':'2026-10-17','recorded_at':'2026-10-17 15:00','category':'介護記録','content':text,'staff_name':'木村 健一'},'b':None}]},tok)
results=[]
def check(name, ok, info=''):
    results.append((name,ok)); print(('OK  ' if ok else 'NG  ')+name, info)

subprocess.run(['pkill','-x','pwsh']); time.sleep(1)
# 1) 初めての起動で取り込み、中身が同じ
fresh(); p=start(); tok=login()
st,api=req('/api/data',None,tok); orig=json.load(open(ORIG,encoding='utf-8-sig'))
same=all(orig[k]==api[k] for k in orig if k not in ('stamps','staff_accounts'))
check('1 初回の取り込みで中身が同じ', same and os.path.exists(DATA+'/portal.db'))
# 2) 保存 → 再起動しても残る
st,r=add_record(tok, 990001, 'データベースのテスト1')
check('2a 差分保存', st==200, r)
stop(p); p=start(); tok=login()
st,api=req('/api/data',None,tok)
check('2b 再起動後も残る', any(c.get('id')==990001 for c in api['care_records']))
# 3) JSON への書き出し（止めたときと30秒ごと）
j=json.load(open(DATA+'/portal_database.json',encoding='utf-8-sig'))
check('3a 止めたときに書き出し', any(c.get('id')==990001 for c in j['care_records']))
add_record(tok, 990002, 'テスト2'); time.sleep(33)
j=json.load(open(DATA+'/portal_database.json',encoding='utf-8-sig'))
check('3b 30秒以内に書き出し', any(c.get('id')==990002 for c in j['care_records']))
raw=open(DATA+'/portal_database.json','rb').read()
check('3c 書き出しは BOM 付き1行', raw.startswith(b'\xef\xbb\xbf') and raw.count(b'\n')==0)
# 4) 外から JSON を書き換えると取り込む（git で取り込んだ想定）
j['facility_name']='外から変えた名前'; j['_rev']=j['_rev']+5
open(DATA+'/portal_database.json','w',encoding='utf-8-sig').write(json.dumps(j,ensure_ascii=False,indent=1))
time.sleep(33)
st,api=req('/api/data',None,tok)
bk=[f for f in os.listdir(DATA+'/backup') if f.startswith('before_import_')]
raw=open(DATA+'/portal_database.json','rb').read()
check('4 外からの変更を取り込み、前の中身を控え、1行に戻す', api.get('facility_name')=='外から変えた名前' and bk and raw.count(b'\n')==0, bk)
# 5) 読めない JSON は取り込まず、上書きもしない
open(DATA+'/portal_database.json','w').write('{ 書きかけ')
add_record(tok, 990003, 'テスト3'); time.sleep(33)
check('5 読めないファイルは上書きしない', open(DATA+'/portal_database.json').read()=='{ 書きかけ')
st,api=req('/api/data',None,tok)
check('5b そのあいだも保存は続く', any(c.get('id')==990003 for c in api['care_records']))
# 6) 書き込みの最中に強制終了しても壊れない
stop(p); fresh(); p=start(); tok=login()
acked=[]; stopflag=[False]
def writer(n0):
    t=login()
    i=0
    while not stopflag[0]:
        try:
            st,r=add_record(t, n0+i, 'kill test')
            if st==200: acked.append(n0+i)
        except Exception: break
        i+=1
ths=[threading.Thread(target=writer,args=(800000+k*10000,)) for k in range(3)]
[t.start() for t in ths]; time.sleep(4); stop(p, hard=True); stopflag[0]=True; [t.join() for t in ths]
c=sqlite3.connect(DATA+'/portal.db'); ok=c.execute('pragma integrity_check').fetchone()[0]; c.close()
p=start(); tok=login(); st,api=req('/api/data',None,tok)
ids={c.get('id') for c in api['care_records']}
missing=[a for a in acked if a not in ids]
check('6 強制終了: 中身が壊れず、保存できたと返した記録は全部残る', ok=='ok' and not missing, f'acked={len(acked)} missing={len(missing)} integrity={ok}')
# 7) 同じ記録を2台で同時に変えると、片方は競合（409）になる
st,api=req('/api/data',None,tok); rec=[c for c in api['care_records'] if c.get('id')==acked[0]][0]
a=dict(rec,content='A'); b=dict(rec,content='B')
s1,_=req('/api/save-diff',{'ops':[{'k':'care_records','t':'up','id':str(rec['id']),'v':a,'b':rec}]},tok)
s2,_=req('/api/save-diff',{'ops':[{'k':'care_records','t':'up','id':str(rec['id']),'v':b,'b':rec}]},tok)
check('7 同じ記録の同時変更は片方が競合', (s1,s2)==(200,409), (s1,s2))
# 8) 暗証番号の変更（サーバーが持つ値の書き換え）
s,r=req('/api/pin-change',{'name':'木村 健一','current':'0000','new_pin':'1234'},tok)
stop(p); p=start(); tok=login()
c=sqlite3.connect(DATA+'/portal.db'); st_json=c.execute("select json from items where key='stamps'").fetchone()[0]; c.close()
check('8 暗証番号の変更が再起動後も残る（サーバーの中だけ）', '"1234"' in st_json and s==200, (s,r))
req('/api/pin-change',{'name':'木村 健一','current':'1234','new_pin':'0000'},tok)
# 9) 外部バックアップに中身が書き出される
os.makedirs('/tmp/extbk_db',exist_ok=True)
s,r=req('/api/external-backup-config',{'destination_path':'/tmp/extbk_db','max_generations':3},tok)
s,r=req('/api/external-backup-run',{},tok)
gens=sorted(os.listdir('/tmp/extbk_db')); f=f'/tmp/extbk_db/{gens[-1]}/portal_database.json' if gens else ''
okb=bool(f) and os.path.exists(f) and json.load(open(f,encoding='utf-8-sig')).get('_rev')==req('/api/rev',None,tok)[1]['rev']-1  # バックアップの記録で版が1つ進む
check('9 外部バックアップにデータが書き出される', okb, (s,r))
stop(p)
# 10) SQLite が使えないとき（または使わない設定）は、今までどおり JSON で動く
p=start({'CARE_PORTAL_NO_DB':'1'}); tok=login()
st,r=add_record(tok, 990010, 'JSON のまま')
j=json.load(open(DATA+'/portal_database.json',encoding='utf-8-sig'))
check('10 JSON だけでも動く', st==200 and any(c.get('id')==990010 for c in j['care_records']))
stop(p)
# 11) JSON で動いていたあいだの変更は、次にデータベースで起動したとき取り込まれる
p=start(); tok=login(); st,api=req('/api/data',None,tok)
check('11 JSON で動いた分も取り込まれる', any(c.get('id')==990010 for c in api['care_records']))
stop(p)
print('\n合計', sum(1 for _,o in results if o), '/', len(results))
