# ケアプランタブ（アンチさん 43e4327）＋ Claude修正 の確認。1年分のデモ・IDとパスワードのログイン
from playwright.sync_api import sync_playwright
import datetime, re
BASE="http://localhost:8888/"
results=[]
def check(n,c,d=""):
    results.append((n,bool(c))); print(("OK  " if c else "NG  ")+n+(("  | "+str(d)) if d!="" else ""))
def new_page(b, w=1366):
    ctx=b.new_context(viewport={"width":w,"height":900}); pg=ctx.new_page(); pg.errors=[]; pg.dialogs=[]; pg.answer=""
    pg.on("pageerror", lambda e: pg.errors.append(str(e)))
    def dlg(d):
        pg.dialogs.append((d.type,d.message))
        if d.type=="prompt": d.accept(pg.answer)
        else: d.accept()
    pg.on("dialog", dlg); pg.goto(BASE); pg.wait_for_timeout(800); return ctx,pg
def login(pg,sid):
    pg.fill("#loginStaffIdInput",sid); pg.fill("#loginPasswordInput","0000"); pg.click("button:has-text('ログイン')")
    pg.wait_for_function("() => typeof gState!=='undefined' && gState.session && db.data.residents.length>0", timeout=120000); pg.wait_for_timeout(800)
def last(pg): return pg.dialogs[-1][1] if pg.dialogs else ""
today=datetime.date.today(); d=lambda n:(today+datetime.timedelta(days=n)).isoformat()
with sync_playwright() as p:
    b=p.chromium.launch()
    ctx,pg=new_page(b); login(pg,"ffff")
    check("0 計画作成担当者でログインできる", pg.evaluate("() => cpCanEditCarePlanGoal()"), pg.evaluate("() => gState.session.staffName"))
    rid=pg.evaluate("() => cpCurrentResidents()[0].id")
    pg.evaluate(f"() => {{ enterPortal('care'); selectResident({rid}); switchCareTab('careplan'); }}"); pg.wait_for_timeout(500)
    check("1 ケアプランのタブが出る", pg.is_visible("#tabCarePlan") and "ケアプラン" in pg.inner_text("#tabCarePlan"))
    pg.click("#tabCarePlan button:has-text('第1版のケアプランを作成する')"); pg.wait_for_timeout(400)
    plan=lambda: pg.evaluate(f"() => cpGetPlansForResident({rid})")
    check("1 第1版（作成中）ができる", len(plan())==1 and plan()[0]["status"]=="作成中")
    pg.evaluate("() => cpCreateInitialCarePlan()"); pg.wait_for_timeout(200)
    check("2 2つ目は「見直し」からでないと作れない（Claude修正）", len(plan())==1 and "見直して新しい版" in last(pg), last(pg)[:40])
    pid=plan()[0]["id"]
    # 中身がないまま同意を入れようとする
    pg.evaluate(f"""() => {{ document.getElementById('cpConsentExplainedOn').value='{d(0)}'; document.getElementById('cpConsentExplainedTo').value='家族'; document.getElementById('cpConsentRelation').value='長男'; document.getElementById('cpConsentConsentedOn').value='{d(0)}'; document.getElementById('cpConsentDeliveredOn').value='{d(0)}'; cpSaveCarePlanConsent({pid}); }}""")
    pg.wait_for_timeout(200)
    check("3 中身（アセスメント・方針・課題・サービス・話し合い）がないと同意できない（Claude修正）", plan()[0]["status"]=="作成中" and "そろえて" in last(pg), last(pg)[:60])
    # 引用
    has_sum=pg.evaluate(f"() => (db.data.care_summaries||[]).some(s=>!s.voided && Number(s.resident_id)==={rid})")
    if has_sum:
        pg.evaluate(f"() => cpQuoteCareSummaryToAssessment({pid})"); pg.wait_for_timeout(100)
        v=pg.evaluate("() => ['cpAssessPersonWish','cpAssessFamilyWish','cpAssessStrengths','cpAssessIssues'].map(i=>document.getElementById(i).value)")
        check("4 サマリーから引用しても「本人の意向」は写さない（Claude修正）", v[0]=="" , v[0][:30])
        check("4 写した欄には出どころ【介護サマリー：…】が付く", "【介護サマリー：" in v[2] and "【介護サマリー：" in v[3])
    pg.evaluate(f"""() => {{ cpQuoteCareSummaryToAssessment && 0; document.getElementById('cpAssessPersonWish').value='自分の足で歩いて、好きな相撲をテレビで見たい'; document.getElementById('cpAssessFamilyWish').value= document.getElementById('cpAssessFamilyWish').value || 'できるだけ歩いてほしい'; document.getElementById('cpAssessStrengths').value= document.getElementById('cpAssessStrengths').value || '手先が器用'; document.getElementById('cpAssessIssues').value= document.getElementById('cpAssessIssues').value || 'ふらつきがある'; cpSaveCarePlanAssessment({pid}); }}""")
    pg.evaluate(f"() => {{ document.getElementById('cpPolicyInput').value='転ばずに歩き続けられるよう見守る'; cpSaveCarePlanPolicy({pid}); }}")
    pg.evaluate(f"""() => {{ const s=(k,v)=>document.getElementById('cpNeedNew_'+k).value=v; s('need','安全に歩きたい'); s('long_goal','歩行器で歩き続ける'); s('long_from','{d(0)}'); s('long_to','{d(180)}'); s('short_goal','見守りで居室からトイレまで歩く'); s('short_from','{d(0)}'); s('short_to','{d(7)}'); cpSaveCarePlanNeed({pid}, null); }}""")
    pg.wait_for_timeout(200)
    nid=plan()[0]["needs"][0]["id"]
    pg.evaluate(f"""() => {{ const s=(k,v)=>{{ const e=document.getElementById('cpSvcNew_{nid}_'+k); e.value=v; }}; s('content','移動時の見守り'); const w=document.getElementById('cpSvcNew_{nid}_who'); w.value = w.tagName==='SELECT' ? (w.options[1]||{{}}).value : '介護職員'; const f=document.getElementById('cpSvcNew_{nid}_frequency'); f.value = f.tagName==='SELECT' ? (f.options[1]||{{}}).value : '毎日'; cpSaveCarePlanService({pid}, {nid}, null); }}""")
    pg.wait_for_timeout(200)
    pg.evaluate(f"() => {{ document.getElementById('cpMeetDate').value='{d(3)}'; document.getElementById('cpMeetAttendees').value='介護職員2名'; document.getElementById('cpMeetOpinions').value='夕方にふらつきが多い'; cpAddCarePlanMeeting({pid}); }}")
    check("5 話し合いの日に先の日付は入れられない（Claude修正）", len(plan()[0]["meetings"])==0 and "先の日付" in last(pg))
    pg.evaluate(f"() => {{ document.getElementById('cpMeetDate').value='{d(0)}'; document.getElementById('cpMeetAttendees').value='介護職員2名'; document.getElementById('cpMeetOpinions').value='夕方にふらつきが多い'; cpAddCarePlanMeeting({pid}); }}")
    pl=plan()[0]
    check("5 アセスメント・方針・課題・サービス・話し合いが保存される", pl["assessment"]["person_wish"] and pl["policy"] and len(pl["needs"])==1 and len(pl["needs"][0]["services"])==1 and len(pl["meetings"])==1, (pl["policy"], len(pl["needs"][0]["services"])))
    # 日付の順番
    pg.evaluate(f"""() => {{ document.getElementById('cpConsentExplainedOn').value='{d(0)}'; document.getElementById('cpConsentExplainedTo').value='家族'; document.getElementById('cpConsentRelation').value='長男'; document.getElementById('cpConsentConsentedOn').value='{d(-1)}'; document.getElementById('cpConsentDeliveredOn').value='{d(0)}'; cpSaveCarePlanConsent({pid}); }}""")
    check("6 同意の日が説明より前ならはじく（Claude修正）", plan()[0]["status"]=="作成中" and "説明した日より前" in last(pg), last(pg)[:40])
    pg.evaluate(f"""() => {{ document.getElementById('cpConsentConsentedOn').value='{d(1)}'; cpSaveCarePlanConsent({pid}); }}""")
    check("6 先の日付は入れられない", plan()[0]["status"]=="作成中" and ("先の日付" in last(pg) or "より前にはできません" in last(pg)), last(pg)[:30])
    pg.evaluate(f"""() => {{ document.getElementById('cpConsentConsentedOn').value=''; document.getElementById('cpConsentDeliveredOn').value=''; cpSaveCarePlanConsent({pid}); }}""")
    check("6 説明だけなら「同意待ち」", plan()[0]["status"]=="同意待ち", plan()[0]["status"])
    pg.evaluate(f"""() => {{ document.getElementById('cpConsentConsentedOn').value='{d(0)}'; cpSaveCarePlanConsent({pid}); }}""")
    check("6 同意して交付前も「同意待ち」（Claude修正）", plan()[0]["status"]=="同意待ち", plan()[0]["status"])
    pg.evaluate(f"""() => {{ document.getElementById('cpConsentDeliveredOn').value='{d(0)}'; cpSaveCarePlanConsent({pid}); }}"""); pg.wait_for_timeout(300)
    check("6 説明・同意・交付がそろうと「実施中」（空の欄を埋めるだけなら理由は聞かない）", plan()[0]["status"]=="実施中" and not any(t=="prompt" for t,_ in pg.dialogs[-3:]), (plan()[0]["status"], last(pg)[:30]))
    # 実施中の中身は変えない
    before=plan()[0]["policy"]
    pg.evaluate(f"() => {{ const e=document.getElementById('cpPolicyInput'); if(e) e.value='書き換え'; cpSaveCarePlanPolicy({pid}); }}")
    check("7 実施中の版の中身は変えられない（Claude修正）", plan()[0]["policy"]==before and "見直して新しい版" in last(pg), last(pg)[:40])
    check("7 実施中の版には方針・課題の入力欄が出ず、理由の説明が出る", pg.locator("#cpPolicyInput").count()==0 and pg.locator("#cpNeedNew_need").count()==0 and "実施中の計画の中身は変えられません" in pg.inner_text("#tabCarePlan"))
    pg.evaluate(f"""() => {{ document.getElementById('cpConsentDeliveredOn').value=''; cpSaveCarePlanConsent({pid}); }}""")
    check("7 実施中の版の同意の日付は空にできない（Claude修正）", plan()[0]["status"]=="実施中" and plan()[0]["consent"]["delivered_on"]==d(0), last(pg)[:40])
    # モニタリング
    pg.evaluate(f"""() => {{ document.getElementById('cpMonNew_date').value='{d(0)}'; const r=document.getElementById('cpMonNew_review_needed'); r.value=(r.options[1]||{{}}).value; const x=document.getElementById('cpMonNew_res_{nid}'); x.value=(x.options[1]||{{}}).value; document.getElementById('cpMonNew_note_{nid}').value='見守りで歩けている'; document.getElementById('cpMonNew_note').value='このまま続ける'; cpSaveCarePlanMonitoring({pid}, null); }}""")
    check("8 実施中の版でモニタリングを記録できる", len(plan()[0]["monitorings"])==1, last(pg)[:40])
    # お知らせ・カルテ
    pg.evaluate("() => checkGlobalAlerts()"); pg.wait_for_timeout(200)
    check("9 短期目標の期限が近いとお知らせが出る", "ケアプラン短期目標 期限間近" in pg.evaluate("() => document.body.innerText"))
    pg.evaluate("() => { switchCareTab('record'); cpSwitchRecordPane && cpSwitchRecordPane('karte'); renderResidentDetail(); }"); pg.wait_for_timeout(300)
    k=pg.inner_text("#residentDetailCard")
    check("9 カルテに実施中の短期目標と「ケアプランのタブで変えます」", "見守りで居室からトイレまで歩く" in k and "ケアプランのタブで変えます" in k)
    # 見直し
    pg.evaluate(f"() => {{ switchCareTab('careplan'); }}"); pg.answer="歩行が安定してきたため"
    pg.evaluate(f"() => cpReviewAndCreateNextVersion({pid})"); pg.wait_for_timeout(300)
    check("10 見直しで第2版（作成中）、第1版は実施中のまま", [x["status"] for x in plan()]==["作成中","実施中"], [x["status"] for x in plan()])
    pg.evaluate(f"() => cpReviewAndCreateNextVersion({pid})"); pg.wait_for_timeout(200)
    check("10 作成中の版があるときは、さらに見直しはできない（Claude修正）", len(plan())==2 and "作成中・同意待ち" in last(pg), last(pg)[:40])
    pid2=plan()[0]["id"]
    pg.evaluate(f"() => {{ cpSelectCarePlanVersion({pid2}); }}"); pg.wait_for_timeout(200)
    check("10 第2版でモニタリングは記録できない（実施中になってから）", pg.locator("#cpMonNew_date").count()==0)
    pg.evaluate(f"() => {{ document.getElementById('cpMeetDate').value='{d(0)}'; document.getElementById('cpMeetAttendees').value='介護職員3名'; document.getElementById('cpMeetOpinions').value='歩行が安定'; cpAddCarePlanMeeting({pid2}); }}")
    pg.evaluate(f"""() => {{ document.getElementById('cpConsentExplainedOn').value='{d(0)}'; document.getElementById('cpConsentExplainedTo').value='本人'; document.getElementById('cpConsentConsentedOn').value='{d(0)}'; document.getElementById('cpConsentDeliveredOn').value='{d(0)}'; cpSaveCarePlanConsent({pid2}); }}"""); pg.wait_for_timeout(300)
    st=[(x["version"],x["status"]) for x in plan()]
    p1=[x for x in plan() if x["version"]==1][0]
    check("10 第2版が実施中になると第1版は終了（理由が残る）", st==[(2,"実施中"),(1,"終了")] and "第2版" in p1["end_reason"] and p1["ended_at"], (st, p1["end_reason"][:30]))
    # 印刷
    html=pg.evaluate(f"() => {{ let h=''; const o=window.runPrintJob; window.runPrintJob=(x)=>{{h=x;}}; printCarePlanDocument({pid2}); window.runPrintJob=o; return h; }}")
    check("11 計画書の題は「介護計画書（ケアプラン）」（グループホームで「施設サービス計画書」と出さない）", "介護計画書（ケアプラン）" in html and "施設サービス計画書" not in html)
    check("11 計画書に同意の署名欄", "説明を受け、同意し、交付を受けました" in html)
    check("12 エラーなし（計画作成担当者）", not pg.errors, pg.errors[:2])
    ctx.close()
    # 介護職員
    ctx,pg=new_page(b,390); login(pg,"dddd")
    pg.evaluate(f"() => {{ enterPortal('care'); selectResident({rid}); switchCareTab('careplan'); }}"); pg.wait_for_timeout(500)
    t=pg.inner_text("#tabCarePlan")
    check("13 介護職員には作成・見直しのボタンが出ず「計画作成担当者が書きます」", "見直して新しい版を作る" not in t and "計画作成担当者が書きます" in t)
    pl2=pg.evaluate(f"() => cpGetPlansForResident({rid})[0]"); mid=pl2["meetings"][0]["id"]
    att_before=pl2["meetings"][0]["attendees"]
    pg.evaluate(f"() => {{ document.getElementById('cpMeetAddOpinion_{mid}').value='夜間も見守りを'; cpAppendOpinionToMeeting({pl2['id']}, {mid}); }}"); pg.wait_for_timeout(200)
    m=pg.evaluate(f"() => cpGetPlansForResident({rid})[0].meetings[0]")
    check("14 介護職員も話し合いに意見を足せる", "夜間も見守りを" in m["opinions"])
    check("14 あとから意見を足しても「参加した職員」は変わらない（Claude修正）", m["attendees"]==att_before, (att_before, m["attendees"]))
    check("14 ほかの人の話し合いの記録は訂正できない（ボタンが出ない）", pg.locator("#tabCarePlan button:has-text('記録を訂正')").count()==0)
    pg.evaluate(f"() => cpSaveCarePlanPolicy({pl2['id']})")
    check("15 介護職員は計画を保存できない", "計画作成担当者" in last(pg))
    check("16 スマホ幅で横にはみ出さない", pg.evaluate("() => document.documentElement.scrollWidth <= innerWidth + 1"))
    check("16 エラーなし（介護職員）", not pg.errors, pg.errors[:2])
    ctx.close(); b.close()
print("NG", len([r for r in results if not r[1]]))
