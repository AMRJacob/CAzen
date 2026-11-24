# The sheet's Rename panel carries its current revision's date ("Revision date"), and saves a change to it.
from common import *
import json
patched=[]
fx={'current_sheets':[{'sheet_id':'s-a101','project_id':PROJ,'number':'A-101','title':'FIRST FLOOR PLAN','discipline':'A','filed_under':None,'is_void':False,'revision_id':'r-a101','revision_index':0,'revision_label':'Bid Set','file_path':'r2:x','issuance_kind':'bid_set','issuance_number':'1','issued_on':'2026-09-01','revision_count':1}],
    'sheet_revisions':[{'id':'r-a101','sheet_date':'2026-08-28'}],
    'PATCH:sheet_revisions':lambda r:(patched.append(json.loads(r.post_data)) or []),'PATCH:sheets':lambda r:[]}
with sync_playwright() as p:
    b=p.chromium.launch(channel='chrome'); ctx=b.new_context(viewport={'width':1440,'height':900}); install(ctx,fx); signed_in(ctx)
    pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(BASE); pg.wait_for_selector('text=Stand-in Office'); pg.click('td.p-name'); pg.wait_for_selector('.overview'); pg.goto(BASE+'#/documents')
    pg.wait_for_selector('button.row-edit'); pg.click('button.row-edit'); pg.wait_for_timeout(600)
    print('labels:',pg.inner_text('.sheet-edit').replace('\n',' | ')[:120],'| revision date:',pg.input_value('input[aria-label="Revision date"]'))
    pg.fill('input[aria-label="Revision date"]','2026-11-20'); pg.click('.sheet-edit-go button.primary-lite'); pg.wait_for_timeout(800)
    print('saved:',[x for x in patched if 'sheet_date' in x],'| errors:',errs); b.close()
