"""Words on the drawings can be searched with no signal, from the copy on the device."""
from common import *
S1='44444444-4444-4444-8444-444444444441'; R1='55555555-5555-4555-8555-555555555551'; I1='66666666-6666-4666-8666-666666666661'
path='r2:'+PROJ+'/drawings/A-101.pdf'
extra={
 'sheets':[{'id':S1,'project_id':PROJ,'number':'A-101','title':'FLOOR PLAN','discipline':'A','filed_under':None,'is_void':False,'scale':None}],
 'sheet_text':[{'revision_id':R1,'project_id':PROJ,'body':'FLOOR PLAN A-101  Provide bollards at the loading dock. Door 101 hollow metal.'}],
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
    cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':bx['x']+80,'y':bx['y']+20,'id':1}]}); pg.wait_for_timeout(750); cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
    pg.wait_for_selector('.take-choices button'); pg.tap('.take-choices button >> nth=0')
    pg.wait_for_function("document.querySelector('tr.opens').classList.contains('p-held')",timeout=30000)
    pg.wait_for_timeout(900); pg.tap('td.p-name'); pg.wait_for_timeout(600); pg.goto(BASE+'#/documents'); pg.wait_for_selector('tr.opens')
    ctx.set_offline(True); pg.wait_for_timeout(300)
    pg.evaluate("document.querySelector('button[aria-label*=earch]')?.click()"); pg.wait_for_timeout(300)
    box=pg.locator('input[type=search], input[placeholder^="Search sheet"]').first; box.fill('bollard'); box.press('Enter'); pg.wait_for_timeout(1500)
    print('offline search for bollard:',pg.locator('.hit-snip').all_inner_texts(),'| error shown:',pg.locator('.notice.error').all_inner_texts())
    box.fill('window'); box.press('Enter'); pg.wait_for_timeout(1200); print('offline search for window:',pg.locator('.hit-snip').count(),'hits'); pg.screenshot(path='offline_search.png'); b.close()
