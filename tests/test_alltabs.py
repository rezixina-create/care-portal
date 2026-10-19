# 全タブ×3人（管理者・看護師・介護職員）でエラーが出ないか ＋ ケアプランの2台同時
from playwright.sync_api import sync_playwright
import re, time, datetime
BASE="http://localhost:8888/"; results=[]
def check(n,c,d=""):
    results.append((n,bool(c))); print(("OK  " if c else "NG  ")+n+(("  | "+str(d)) if d!="" else ""))
def page_for(b,sid,w=1366):
    ctx=b.new_context(viewport={"width":w,"height":900}); pg=ctx.new_page(); pg.errors=[]
    pg.on("pageerror", lambda e: pg.errors.append(str(e)[:160])); pg.on("dialog", lambda d: d.dismiss())
    pg.goto(BASE); pg.wait_for_timeout(800)
    pg.fill("#loginStaffIdInput",sid); pg.fill("#loginPasswordInput","0000"); pg.click("button.login-submit")
    pg.wait_for_function("() => typeof gState!=='undefined' && gState.session && db.hasSyncedWithServer && db.data.residents.length>0", timeout=120000); pg.wait_for_timeout(800)
    return ctx,pg
with sync_playwright() as p:
    b=p.chromium.launch()
    for sid,role in (("aaaa","管理者"),("bbbb","看護師"),("dddd","介護職員")):
        ctx,pg=page_for(b,sid)
        care=pg.evaluate("() => [...document.querySelectorAll('#portalCareSection .sub-tab-btn')].map(b=>(b.getAttribute('onclick')||'').match(/switchCareTab\\('([^']+)'/)).filter(Boolean).map(m=>m[1])")
        office=pg.evaluate("() => [...document.querySelectorAll('#portalOfficeSection .sub-tab-btn')].map(b=>(b.getAttribute('onclick')||'').match(/switchOfficeTab\\('([^']+)'/)).filter(Boolean).map(m=>m[1])")
        pg.evaluate("() => enterPortal('care')")
        for t in care:
            pg.evaluate(f"() => switchCareTab('{t}')"); pg.wait_for_timeout(120)
        pg.evaluate("() => { switchCareTab('record'); cpSwitchRecordPane('log'); cpSwitchRecordPane('karte'); }")
        pg.evaluate("() => enterPortal('office')")
        for t in office:
            pg.evaluate(f"() => switchOfficeTab('{t}')"); pg.wait_for_timeout(120)
        check(f"1 {role}：介護{len(care)}タブ・事務{len(office)}タブを開いてエラーなし", not pg.errors and "careplan" in care, pg.errors[:2])
        ctx.close()
    # 2台同時（計画作成担当者が中身、介護職員が意見）
    c1,a=page_for(b,"ffff"); c2,bb=page_for(b,"dddd")
    rid=a.evaluate("() => cpCurrentResidents()[1].id")
    today=datetime.date.today().isoformat()
    a.evaluate(f"() => {{ enterPortal('care'); selectResident({rid}); switchCareTab('careplan'); cpCreateInitialCarePlan(); }}"); a.wait_for_timeout(300)
    pid=a.evaluate(f"() => cpGetPlansForResident({rid})[0].id")
    a.evaluate(f"() => {{ document.getElementById('cpMeetDate').value='{today}'; document.getElementById('cpMeetAttendees').value='3名'; document.getElementById('cpMeetOpinions').value='A端末の意見'; cpAddCarePlanMeeting({pid}); }}")
    for _ in range(30):
        time.sleep(1)
        got=bb.evaluate(f"() => (db.data.care_plans||[]).some(p=>p.id==={pid} && (p.meetings||[]).length===1)")
        if got: break
    check("2 計画作成担当者が作った計画と話し合いが、もう1台にも届く", got)
    mid=a.evaluate(f"() => cpGetPlansForResident({rid})[0].meetings[0].id")
    bb.evaluate(f"() => {{ enterPortal('care'); selectResident({rid}); switchCareTab('careplan'); }}"); bb.wait_for_timeout(300)
    bb.evaluate(f"() => {{ document.getElementById('cpMeetAddOpinion_{mid}').value='B端末の意見'; cpAppendOpinionToMeeting({pid}, {mid}); }}")
    a.evaluate(f"() => {{ document.getElementById('cpPolicyInput').value='A端末の方針'; cpSaveCarePlanPolicy({pid}); }}")
    ok=False
    for _ in range(40):
        time.sleep(1)
        ra=a.evaluate(f"() => {{ const p=cpGetPlansForResident({rid})[0]; return [p.policy, p.meetings[0].opinions]; }}")
        rb=bb.evaluate(f"() => {{ const p=(db.data.care_plans||[]).find(x=>x.id==={pid}); return [p.policy, p.meetings[0].opinions]; }}")
        if ra==rb and ra[0]=="A端末の方針" and "B端末の意見" in ra[1]: ok=True; break
    check("2 同じ計画を2台で同時に直しても、両方の変更が残る（方針と意見）", ok, (ra, rb))
    check("2 エラーなし（2台）", not a.errors and not bb.errors, (a.errors[:1], bb.errors[:1]))
    b.close()
print("NG", len([r for r in results if not r[1]]))
