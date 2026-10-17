import json, urllib.request, threading, time, random, statistics
def req(path, body=None, tok=None, timeout=60):
    r=urllib.request.Request('http://localhost:8888'+path, data=json.dumps(body).encode() if body is not None else None, method='POST' if body is not None else 'GET')
    r.add_header('Content-Type','application/json')
    if tok: r.add_header('X-Session-Token',tok)
    try:
        with urllib.request.urlopen(r,timeout=timeout) as f: return f.status, f.read()
    except urllib.error.HTTPError as e: return e.code, e.read()
N=40; DUR=60
lat=[]; fails=[]; saved=[]; lock=threading.Lock()
def client(i):
    st,b=req('/api/login',{'staff_name':'木村 健一','staff_id':'aaaa','password':'0000'}); tok=json.loads(b)['token']
    st,b=req('/api/data',None,tok); rev=json.loads(b)['_rev']
    t0=time.time(); n=0; nextsave=time.time()+random.random()*5
    while time.time()-t0<DUR:
        st,b=req('/api/rev',None,tok)
        cur=json.loads(b)['rev']
        if cur!=rev:
            st,b=req(f'/api/changes?since={rev}',None,tok); d=json.loads(b); rev=d['rev']
        if time.time()>=nextsave:
            rid=f'L{i}-{n}'; n+=1
            t=time.time()
            st,b=req('/api/save-diff',{'ops':[{'k':'care_records','t':'up','id':rid,'v':{'id':rid,'resident_id':1,'date':'2026-10-17','content':'load'},'b':None}]},tok)
            with lock:
                lat.append(time.time()-t)
                if st==200: saved.append(rid)
                else: fails.append((st,b[:80]))
            nextsave=time.time()+5
        time.sleep(1)
ths=[threading.Thread(target=client,args=(i,)) for i in range(N)]
[t.start() for t in ths]; [t.join() for t in ths]
st,b=req('/api/login',{'staff_name':'木村 健一','staff_id':'aaaa','password':'0000'}); tok=json.loads(b)['token']
st,b=req('/api/data',None,tok); ids={c.get('id') for c in json.loads(b)['care_records']}
print(f'{N}台 {DUR}秒: 保存 {len(lat)}件 中央 {statistics.median(lat)*1000:.0f}ms 最大 {max(lat)*1000:.0f}ms 失敗 {len(fails)} 消えた {sum(1 for s in saved if s not in ids)}')
