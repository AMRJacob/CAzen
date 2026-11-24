"""Rearranging the notes board: a category dropped at the top edge of another goes before it; a note dropped at another's edge goes beside it."""
from common import *
import json
V={'id':'cccccccc-cccc-4ccc-8ccc-ccccccccc001','project_id':PROJ,'kind':'visit','visited_on':'2026-11-18','visited_at':'15:00:00','title':'Walk','weather':'x','names':None,
   'notes':'1. Structure\n  a. first\n  b. second\n2. Envelope\n  a. sealant\n3. Interior\n  a. drywall','photos':[],'photo_labels':{},'pad_id':None,'issued_id':None,'location':None,'widgets':{},'created_at':'2026-11-18T15:00:00Z'}
saved=[]
with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={'width':1440,'height':900})
    install(ctx,{'site_visits':lambda r:[V],'PATCH:site_visits':lambda r:(saved.append(json.loads(r.post_data).get('notes')),[{}])[1],'note_pads':[],'pad_marks':[],'observations':[],'observation_types':[],'project_people':[],'notebook_layouts':lambda r:None}); signed_in(ctx)
    pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(BASE); pg.wait_for_selector('text=Stand-in Office'); pg.locator('td.p-name, .p-card').first.click(); pg.wait_for_timeout(500)
    pg.goto(BASE+'#/field-notes/reports'); pg.wait_for_selector('.nb-toc li'); pg.click('.nb-toc li button'); pg.wait_for_selector('.nbd'); pg.wait_for_timeout(500)
    def drag(src, dst_box, frac):
        s=src.bounding_box(); d=dst_box
        pg.mouse.move(s['x']+20,s['y']+s['height']/2); pg.mouse.down()
        pg.mouse.move(d['x']+40, d['y']+d['height']*frac, steps=10); pg.wait_for_timeout(100); pg.mouse.up(); pg.wait_for_timeout(700)
    head=lambda t: pg.locator(f'.nbd-box.d0:has(> .nbd-box-head :text("{t}")) > .nbd-box-head').first
    drag(head('Interior'), head('Structure').bounding_box(), 0.1)
    print('Interior before Structure:', pg.locator('.nbd-box.d0 > .nbd-box-head .nbd-box-name').all_inner_texts())
    card=lambda t: pg.locator(f'.nbd-card:has-text("{t}")').first
    drag(card('sealant'), card('first').bounding_box(), 0.08)
    print('saved:', repr(saved[-1]) if saved else None)
    print('Structure shows:', pg.locator('.nbd-box:has(> .nbd-box-head :text("Structure")) .nbd-card-text').all_inner_texts(), '| errors', errs)
    b.close()
