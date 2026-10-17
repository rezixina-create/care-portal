# 画面側の保存・受け取りの作り変え（2026-10-18）の確認: 2台の端末で同時に使う
import asyncio, json, sys, time, subprocess, urllib.request
from playwright.async_api import async_playwright
results=[]
def check(n,ok,info=''): results.append((n,ok)); print(('OK  ' if ok else 'NG  ')+n, info)
async def login(ctx,name):
    pg=await ctx.new_page(); errs=[]
    pg.on('pageerror',lambda e:errs.append(str(e)[:150])); pg.on('dialog',lambda d: asyncio.ensure_future(d.dismiss()))
    await pg.goto('http://localhost:8888/'); await pg.wait_for_timeout(1200)
    await pg.select_option('#loginStaffSelect',value=name); await pg.fill('#loginStaffIdInput','aaaa'); await pg.fill('#loginPasswordInput','0000')
    await pg.click('.login-submit')
    await pg.wait_for_function('typeof db!=="undefined" && db.hasSyncedWithServer && db.data.care_records.length>0',timeout=60000)
    await pg.evaluate('''()=>{window.__full=0; const of=window.fetch; window.fetch=function(u,...a){ if(String(u).includes('/api/data')) window.__full++; return of.call(this,u,...a);} }''')
    return pg, errs
NORM='''()=>{const d=JSON.parse(JSON.stringify(db.data)); delete d._rev; const o={}; for(const k of Object.keys(d).sort()){ let v=d[k]; if(Array.isArray(v)&&v.every(x=>x&&x.id!==undefined)) v=[...v].sort((a,b)=>String(a.id)<String(b.id)?-1:1); o[k]=v;} return JSON.stringify(o,(k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.keys(v).sort().reduce((r,kk)=>(r[kk]=v[kk],r),{}):v);}'''
async def settle(*pgs):
    for _ in range(40):
        await asyncio.sleep(1)
        st=[await p.evaluate('()=>!db._saving && !db.hasUnsentChanges()') for p in pgs]
        if all(st):
            await asyncio.sleep(6.5)  # 受け取り（5秒ごと）
            return
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch()
    A,ea=await login(await b.new_context(),'木村 健一'); B,eb=await login(await b.new_context(),'井上 蓮')
    # 1 追加が届く
    await A.evaluate('''()=>{db.data.care_records.push({id:880001,resident_id:1,recorded_at:'2026-10-18 09:00',category:'介護記録',content:'A追加',staff_name:'木村 健一'}); db.save();}''')
    await settle(A,B)
    check('1 Aの追加がBに届く', await B.evaluate('()=>db.data.care_records.some(r=>r.id===880001)'))
    # 2 同じ記録の別の項目を同時に直す
    await A.evaluate('''()=>{const r=db.data.care_records.find(r=>r.id===880001); r.content='A直し'; db.save();}''')
    await B.evaluate('''()=>{const r=db.data.care_records.find(r=>r.id===880001); r.category='バイタル'; db.save();}''')
    await settle(A,B)
    ra=await A.evaluate('()=>db.data.care_records.find(r=>r.id===880001)'); rb=await B.evaluate('()=>db.data.care_records.find(r=>r.id===880001)')
    check('2 同じ記録の別々の項目は両方残る', ra==rb and ra['content']=='A直し' and ra['category']=='バイタル', (ra.get('content'),ra.get('category'),rb.get('content'),rb.get('category')))
    # 3 Aが消し、Bが直す → 残る
    await A.evaluate('''()=>{const i=db.data.care_records.findIndex(r=>r.id===880001); db.data.care_records.splice(i,1); db.save();}''')
    await B.evaluate('''()=>{const r=db.data.care_records.find(r=>r.id===880001); r.content='B直し'; db.save();}''')
    await settle(A,B)
    ka=await A.evaluate('()=>db.data.care_records.some(r=>r.id===880001)'); kb=await B.evaluate('()=>db.data.care_records.some(r=>r.id===880001)')
    check('3 消した記録を別の端末で直していたら残る', ka and kb, (ka,kb))
    # 4 設定（一覧でない項目）
    await B.evaluate('''()=>{db.data.shift_staffing = Object.assign({}, db.data.shift_staffing||{}, {night: 2}); db.save();}''')
    await settle(A,B)
    check('4 設定の変更が届く', await A.evaluate('()=>db.data.shift_staffing && db.data.shift_staffing.night===2'))
    # 5 続けて同時に保存
    for i in range(15):
        await A.evaluate(f'''()=>{{db.data.vitals.push({{id:870000+{i},resident_id:2,date:'2026-10-18',time:'10:00',temperature:36.5,staff_name:'木村 健一'}}); db.save();}}''')
        await B.evaluate(f'''()=>{{db.data.meals.push({{id:860000+{i},resident_id:3,date:'2026-10-18',meal_type:'昼食',main_dish_ratio:8,staff_name:'井上 蓮'}}); const r=db.data.care_records[{i}]; r.content=(r.content||'')+'・'; db.save();}}''')
    await settle(A,B)
    na=await A.evaluate(NORM); nb=await B.evaluate(NORM)
    req=urllib.request.Request('http://localhost:8888/api/data'); req.add_header('X-Session-Token', await A.evaluate('()=>cpGetToken()'))
    sd=json.loads(urllib.request.urlopen(req).read())
    na2=await A.evaluate('(sd)=>{const keep=db.data; db.data=db.ensureDefaultArrays(sd); const r=('+NORM+')(); db.data=keep; return r;}', sd)
    check('5 続けて保存しても、A・B・サーバーが同じ中身', na==nb==na2, (len(na),len(nb),len(na2)))
    if na!=na2:
        ja=json.loads(na); js=json.loads(na2)
        print('  違う項目:', [k for k in set(ja)|set(js) if ja.get(k)!=js.get(k)][:10], [ (k, str(ja.get(k))[:80], str(js.get(k))[:80]) for k in set(ja)|set(js) if ja.get(k)!=js.get(k)][:3])
    v=await A.evaluate('()=>[db.data.vitals.filter(x=>x.id>=870000&&x.id<870015).length, db.data.meals.filter(x=>x.id>=860000&&x.id<860015).length]')
    check('5b 30件とも残る', v==[15,15], v)
    full=[await A.evaluate('()=>window.__full'), await B.evaluate('()=>window.__full')]
    check('6 受け取りは差分だけ（全体を取り直していない）', full==[0,0], full)
    # 7 サーバーを起動し直しても差分で続く
    subprocess.run(['python3','-c','print()'])
    open('/tmp/restart_flag','w').write('1')
    for _ in range(60):
        await asyncio.sleep(1)
        try: open('/tmp/restart_done').read(); break
        except Exception: pass
    A,ea=await login(A.context,'木村 健一'); B,eb=await login(B.context,'井上 蓮')
    await A.evaluate('''()=>{db.data.care_records.push({id:880099,resident_id:1,recorded_at:'2026-10-18 11:00',category:'介護記録',content:'再起動後',staff_name:'木村 健一'}); db.save();}''')
    await settle(A,B)
    check('7 再起動後も届く', await B.evaluate('()=>db.data.care_records.some(r=>r.id===880099)'))
    check('8 画面のエラーなし', not ea and not eb, (ea[:2],eb[:2]))
    print('\n合計 %d / %d'%(sum(1 for _,o in results if o),len(results)))
    await b.close()
asyncio.run(main())
