from common import *
S1='44444444-4444-4444-8444-444444444441'; R1='55555555-5555-4555-8555-555555555551'; I1='66666666-6666-4666-8666-666666666661'
path='r2:'+PROJ+'/drawings/A-101.pdf'
extra={
 'sheets':[{'id':S1,'project_id':PROJ,'number':'A-101','title':'FLOOR PLAN','discipline':'A','filed_under':None,'is_void':False,'scale':None}],
 'issuances':[{'id':I1,'project_id':PROJ,'kind':'bid_set','number':'1','title':'Bid Set','issued_on':'2026-09-01'}],
 'sheet_revisions':[{'id':R1,'sheet_id':S1,'issuance_id':I1,'revision_index':0,'revision_label':'Bid Set','file_path':path,'bytes':1500,'title_at_rev':'FLOOR PLAN','created_at':'2026-09-01T00:00:00Z','sheet_date':None,'issuances':{'kind':'bid_set','number':'1','issued_on':'2026-09-01'}}],
 'current_sheets':[{'sheet_id':S1,'project_id':PROJ,'number':'A-101','title':'FLOOR PLAN','discipline':'A','filed_under':None,'is_void':False,'revision_id':R1,'revision_index':0,'revision_label':'Bid Set','file_path':path,'issuance_kind':'bid_set','issuance_number':'1','issued_on':'2026-09-01','revision_count':1}],
}
pdf=open('sheet.pdf','rb').read()
with sync_playwright() as p:
    b=p.chromium.launch(channel='chrome'); ctx=b.new_context(**PHONE); install(ctx,extra); signed_in(ctx)
    ctx.route(re.compile(r'.*/functions/v1/files.*'), lambda r: r.fulfill(status=200,content_type='application/json',body=json.dumps({'url':'https://stand-in.supabase.co/blob/sheet.pdf','configured':True,'bytes':0,'objects':0,'by_project':{}})))
    ctx.route(re.compile(r'.*/blob/sheet\.pdf'), lambda r: r.fulfill(status=200,content_type='application/pdf',body=pdf))
    pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('console',lambda m: m.type=='error' and errs.append(m.text))
    pg.goto(BASE); pg.wait_for_selector('text=Stand-in Office')
    row=pg.locator('tr.opens').first; bx=row.bounding_box(); cdp=ctx.new_cdp_session(pg)
    cls=lambda: pg.evaluate("document.querySelector('tr.opens').className")
    print('before:',cls(),'| hint shown:',pg.locator('.p-hint').count()==1,'| old button present:',pg.locator('text=Take to the field').count()>0 and pg.locator('button:has-text("Take to the field")').count()>0)
    cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':bx['x']+80,'y':bx['y']+20,'id':1}]}); pg.wait_for_timeout(750)
    mid=cls(); cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]}); print('held 0.75 s:',mid,'| still on the project list (not opened):',pg.url.endswith('#/'))
    pg.wait_for_function("document.querySelector('tr.opens').classList.contains('p-held')",timeout=30000); print('after download:',cls(),'|',pg.inner_text('.p-state')); pg.screenshot(path='held_solid.png',clip={'x':0,'y':bx['y']-70,'width':402,'height':260})
    ctx.set_offline(True); pg.wait_for_timeout(300)
    pg.evaluate("""new Promise(r=>{const q=indexedDB.open('cazen');q.onsuccess=()=>{const d=q.result;const t=d.transaction('outbox','readwrite');t.objectStore('outbox').put({id:'q1',project_id:'%s',at:Date.now(),tries:0,job:{kind:'markup.edit',id:'00000000-0000-4000-8000-000000000009',patch:{}}});t.oncomplete=()=>r(1)}})""" % (''+PROJ+''))
    pg.wait_for_function("document.querySelector('tr.opens').classList.contains('p-unsynced')",timeout=10000); print('offline with a change waiting:',cls(),'|',pg.inner_text('.p-state')); pg.screenshot(path='held_hatched.png',clip={'x':0,'y':bx['y']-70,'width':402,'height':260})
    ctx.set_offline(False); pg.wait_for_function("document.querySelector('tr.opens').classList.contains('p-held')",timeout=15000); print('back online:',cls(),'|',pg.inner_text('.p-state'))
    pg.tap('td.p-name'); pg.wait_for_timeout(500); print('a plain tap still opens the project:',pg.url.split('#')[1]); print('errors:',[e for e in errs if 'ERR_INTERNET' not in e][:3]); b.close()
