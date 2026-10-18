# ログインを職員IDとパスワードだけにした確認（2026-10-18）
import os
import sys, json, asyncio
exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'test_database.py'),encoding='utf-8').read().split('subprocess.run([\'pkill\'')[0])
ACC=os.environ.get('CP_DEMO_JSON','data/portal_database.json')
def lg(sid,pw): return req('/api/login',{'staff_id':sid,'password':pw})
subprocess.run(['pkill','-x','pwsh']); time.sleep(1)
fresh(); shutil.copy(ACC, DATA+'/portal_database.json'); p=start(); time.sleep(3)
for sid,nm in [('aaaa','木村 健一'),('bbbb','鈴木 美智子'),('cccc','松本 陽子'),('dddd','井上 蓮'),('eeee','佐々木 浩二'),('AAAA','木村 健一')]:
    st,r=lg(sid,'0000'); check(f'1 {sid} で {nm}', st==200 and r.get('staff_name')==nm, (st,r.get('staff_name')))
st,r=lg('aaaa','1111'); check('2 パスワード違いは理由を言わない', st==401 and r.get('error')=='invalid', (st,r))
st,r=lg('zzzz','0000'); check('2b ないIDも同じ返事', st==401 and r.get('error')=='invalid', (st,r))
for i in range(5): lg('dddd','9999')
st,r=lg('dddd','0000'); check('3 5回まちがえるとそのIDはロック', st==423, st)
st,r=lg('bbbb','0000'); check('3b ほかのIDはロックされない', st==200, st)
st,r=req('/api/login-info'); check('4 ログイン前に職員の名前を渡さない', st==200 and r.get('staff')==[] and '木村' not in json.dumps(r,ensure_ascii=False), r)
st,r=req('/api/account-reset',{'target':'井上 蓮','admin':'木村 健一','admin_pin':'0000','office':'松本 陽子','office_pin':'0000'}); check('5 ログインせずに初期化はできない', st==401, st)
tok=lg('aaaa','0000')[1]['token']
st,r=req('/api/account-reset',{'target':'井上 蓮','admin':'木村 健一','admin_pin':'0000','office':'松本 陽子','office_pin':'0000'},tok); check('6 ログインして2名承認で初期化', st==200, (st,r))
st,r=lg('dddd','0000'); check('6b 初期化でロックが解けIDはそのまま', st==200 and r.get('staff_name')=='井上 蓮', (st,r))
stop(p)
# 以前のデータ（全員 aaaa）
fresh(); p=start(); time.sleep(2)
st,r=lg('aaaa','0000'); check('7 以前のデータ（全員aaaa）では並びの先の方', st==200, (st,r.get('staff_name')))
stop(p)
print('\n合計 %d / %d'%(sum(1 for _,o in results if o),len(results)))
