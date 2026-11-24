"""On the spread: right-click (or hold still and let go) a note or category for its menu; Edit the words changes it."""
from common import *
import json
V={'id':'cccccccc-cccc-4ccc-8ccc-ccccccccc001','project_id':PROJ,'kind':'visit','visited_on':'2026-11-18','visited_at':'15:00:00','title':'Walk','weather':'x','names':None,
   'notes':'1. Structure\n  a. Anchor bolts\n2. Unsorted\n  a. Sealant missing','photos':[],'photo_labels':{},'pad_id':None,'issued_id':None,'location':None,'widgets':{},'created_at':'2026-11-18T15:00:00Z'}
for name,vp in (('desk',dict(viewport={'width':1440,'height':900})),('phone',PHONE)):
    with sync_playwright() as p:
        b=p.chromium.launch(); ctx=b.new_context(**vp); saved=[]
        install(ctx,{'site_visits':lambda r:[V],'PATCH:site_visits':lambda r:(saved.append(json.loads(r.post_data).get('notes')),[{}])[1],'note_pads':[],'pad_marks':[],'observations':[],'observation_types':[],'project_people':[],'notebook_layouts':lambda r:None}); signed_in(ctx)
        pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
        touch=name=='phone'
        pg.goto(BASE); pg.wait_for_selector('text=Stand-in Office'); pg.locator('td.p-name, .p-card').first.click(); pg.wait_for_timeout(500)
        pg.goto(BASE+'#/field-notes/reports'); pg.wait_for_selector('.nb-toc li'); pg.locator('.nb-toc li button').first.click(); pg.wait_for_timeout(600)
        if pg.locator('.nb-tabs').count(): pg.locator('.nb-tabs button:has-text("Notes")').click(); pg.wait_for_timeout(300)
        heading_menu(pg, ctx, '.nb-z-notes .nb-z-top h2', 'Spread out', touch=touch)
        cdp=ctx.new_cdp_session(pg)
        def ask(loc):
            bb=loc.bounding_box(); x,y=bb['x']+30,bb['y']+bb['height']/2
            if touch:
                cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':x,'y':y,'id':1}]}); pg.wait_for_timeout(550)
                cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
            else: pg.mouse.click(x,y,button='right')
            pg.wait_for_timeout(300); return pg.locator('.nbd-menu button').all_inner_texts()
        print(name,'| filed note menu:', ask(pg.locator('.nsp .nbd-card:has-text("Anchor")')))
        pg.locator('.nbd-menu button:has-text("Edit the words")').click(); pg.wait_for_timeout(200)
        pg.keyboard.type('Anchor bolts plumbed'); pg.keyboard.press('Enter'); pg.wait_for_timeout(500)
        print('  saved:', repr(saved[-1]) if saved else None)
        print('  loose note menu:', ask(pg.locator('.nsp .nbd-card:has-text("Sealant")')))
        pg.locator('.nbd-menu button:has-text("Edit the words")').click(); pg.wait_for_timeout(200); pg.keyboard.type('Sealant at storefront'); pg.keyboard.press('Enter'); pg.wait_for_timeout(500)
        print('  category menu:', ask(pg.locator('.nsp .nbd-box-head:has-text("Structure")')))
        pg.locator('.nbd-menu button:has-text("Edit the words")').click(); pg.wait_for_timeout(200); pg.keyboard.type('Structural'); pg.keyboard.press('Enter'); pg.wait_for_timeout(500)
        print('  saved:', repr(saved[-1]), '| spread still open:', pg.locator('.nsp').count()==1, '| errors', errs)
        b.close()
