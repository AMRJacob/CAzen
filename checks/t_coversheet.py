# Right-click → Drawing cover sheet files the page as the project's cover sheet, with its number and title from earlier sets.
from common import *
fx={'current_specs':[],'spec_sections':[],
    'current_sheets':[{'sheet_id':'s-g000','project_id':PROJ,'number':'G-000','title':'COVER SHEET','discipline':'G','filed_under':None,'is_void':False,'revision_id':'r-g','revision_index':0,'revision_label':'Bid Set','file_path':'r2:x','issuance_kind':'bid_set','issuance_number':'1','issued_on':'2026-09-01','revision_count':1}]}
with sync_playwright() as p:
    b=p.chromium.launch(channel='chrome'); ctx=b.new_context(viewport={'width':1440,'height':900}); install(ctx,fx); signed_in(ctx)
    pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(BASE); pg.wait_for_selector('text=Stand-in Office'); pg.click('td.p-name'); pg.wait_for_selector('.overview'); pg.goto(BASE+'#/documents')
    pg.wait_for_selector('button:has-text("Upload a set")'); pg.wait_for_timeout(800)
    pg.click('button:has-text("Upload a set")'); pg.set_input_files('.upload-panel input[type=file]','change_doc.pdf')
    pg.wait_for_selector('.change-manual tbody tr',timeout=30000); pg.wait_for_timeout(1200)
    pg.locator('.change-intro .intro-table tr').nth(0).locator('td.intro-n').click(button='right'); print('menu:',pg.inner_text('.pick-menu').replace('\n',' | '))
    pg.click('.pick-menu button:has-text("Drawing cover sheet")'); pg.wait_for_timeout(300)
    r=pg.locator('.upload-panel table:not(.change-manual-table):not(.intro-table) > tbody > tr').nth(0)
    print('row:',r.locator('select.role-cell').input_value(),r.locator('td:nth-child(4) input').input_value(),'/',r.locator('td:nth-child(5) input').input_value(),'| result:',r.locator('td:last-child').inner_text())
    print('errors:',errs); b.close()
