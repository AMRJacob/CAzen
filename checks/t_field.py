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
    pg.click('text=Take to the field'); pg.screenshot(path='field_panel.png'); pg.click('text=Take to the field…'); pg.click('.field-choice >> nth=0')
    pg.wait_for_selector('text=on this device',timeout=10000); print('taken to field:', pg.inner_text('.field-copy').replace('\n',' | ')[:160])
    pg.wait_for_timeout(2500)
    ctx.set_offline(True); pg.reload(); pg.wait_for_selector('text=Stand-in Office')
    pg.click('td.p-name'); pg.wait_for_timeout(300); pg.goto(BASE+'#/documents'); 
    try:
        pg.wait_for_selector('text=A-101',timeout=6000); print('OFFLINE: sheet list shows A-101')
    except Exception as e:
        print('OFFLINE sheet list FAILED'); pg.screenshot(path='fail_list.png'); print(pg.inner_text('main')[:400]); print(errs); raise SystemExit(1)
    pg.screenshot(path='offline_list.png')
    pg.click('text=A-101 >> nth=0'); pg.wait_for_timeout(2500)
    pg.screenshot(path='offline_sheet.png')
    print('canvases:',pg.evaluate("[...document.querySelectorAll('canvas')].map(c=>c.width+'x'+c.height)"))
    print('errors:',[e for e in errs if 'ERR_INTERNET' not in e][:6], 'net errs:',len([e for e in errs if 'ERR_INTERNET' in e]))
    b.close()
