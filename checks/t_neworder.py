"""Notes on the board newest first, in the tray and in a category; the saved outline keeps the order typed."""
from common import *
import json
V={'id':'cccccccc-cccc-4ccc-8ccc-ccccccccc001','project_id':PROJ,'kind':'visit','visited_on':'2026-11-18','visited_at':'15:00:00','title':'Walk','weather':'x','names':None,'notes':'1. Structure\n  a. first\n  b. second','photos':[],'photo_labels':{},'pad_id':None,'issued_id':None,'location':None,'widgets':{},'created_at':'2026-11-18T15:00:00Z'}
saved=[]
with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={'width':1440,'height':900})
    install(ctx,{'site_visits':lambda r:[V],'PATCH:site_visits':lambda r:(saved.append(json.loads(r.post_data).get('notes')),[{}])[1],'note_pads':[],'pad_marks':[],'observations':[],'observation_types':[],'project_people':[],'notebook_layouts':lambda r:None}); signed_in(ctx)
    pg=ctx.new_page(); pg.goto(BASE); pg.wait_for_selector('text=Stand-in Office'); pg.locator('td.p-name, .p-card').first.click(); pg.wait_for_timeout(500)
    pg.goto(BASE+'#/field-notes/reports'); pg.wait_for_selector('.nb-toc li'); pg.click('.nb-toc li button'); pg.wait_for_selector('.nbd'); pg.wait_for_timeout(500)
    for t in ('one','two','three'): pg.fill('.nbd-type input', t); pg.keyboard.press('Enter'); pg.wait_for_timeout(150)
    print('tray shows:', pg.locator('.nbd-tray .nbd-card-text').all_inner_texts())
    print('Structure shows:', pg.locator('.nbd-box:has(> .nbd-box-head :text("Structure")) .nbd-card-text').all_inner_texts())
    pg.wait_for_timeout(900); print('saved (order typed):', repr(saved[-1]))
    b.close()
