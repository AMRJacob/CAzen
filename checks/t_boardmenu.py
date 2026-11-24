"""The notes board's own menu: right-click at a desk; by touch, hold and let go without moving. Holding and moving still drags."""
from common import *
import json
V={'id':'cccccccc-cccc-4ccc-8ccc-ccccccccc001','project_id':PROJ,'kind':'visit','visited_on':'2026-11-18','visited_at':'15:00:00','title':'Walk','weather':'x','names':None,
   'notes':'1. Structure\n  a. Anchor bolts\n2. Envelope\n3. Unsorted\n  a. Sealant missing','photos':[],'photo_labels':{},'pad_id':None,'issued_id':None,'location':None,'widgets':{},'created_at':'2026-11-18T15:00:00Z'}
for name,vp in (('desk',dict(viewport={'width':1440,'height':900})),('phone',PHONE)):
    with sync_playwright() as p:
        b=p.chromium.launch(); ctx=b.new_context(**vp); saved=[]
        install(ctx,{'site_visits':lambda r:[V],'PATCH:site_visits':lambda r:(saved.append(json.loads(r.post_data).get('notes')),[{}])[1],'note_pads':[],'pad_marks':[],'observations':[],'observation_types':[],'project_people':[],'notebook_layouts':lambda r:None}); signed_in(ctx)
        pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
        pg.goto(BASE); pg.wait_for_selector('text=Stand-in Office'); pg.locator('td.p-name, .p-card').first.click(); pg.wait_for_timeout(500)
        pg.goto(BASE+'#/field-notes/reports'); pg.wait_for_selector('.nb-toc li'); pg.locator('.nb-toc li button').first.click(); pg.wait_for_timeout(600)
        if pg.locator('.nb-tabs').count(): pg.locator('.nb-tabs button:has-text("Notes")').click()
        pg.wait_for_selector('.nbd-card')
        card=pg.locator('.nbd-card:has-text("Anchor")'); bb=card.bounding_box(); x,y=bb['x']+30,bb['y']+bb['height']/2
        if name=='desk':
            pg.mouse.click(x,y,button='right')
        else:
            cdp=ctx.new_cdp_session(pg)
            cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':x,'y':y,'id':1}]}); pg.wait_for_timeout(520)
            cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
        pg.wait_for_timeout(300)
        print(name,'| menu:', pg.locator('.nbd-menu button').all_inner_texts())
        pg.locator('.nbd-menu button:has-text("Edit the words")').click(); pg.wait_for_timeout(200)
        pg.keyboard.type('Anchor bolts plumbed'); pg.keyboard.press('Enter'); pg.wait_for_timeout(900)
        print('  edited, saved:', repr(saved[-1]) if saved else None)
        head=pg.locator('.nbd-box-head:has-text("Envelope")').first; hb=head.bounding_box()
        if name=='desk': pg.mouse.click(hb['x']+40,hb['y']+hb['height']/2,button='right')
        else:
            cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':hb['x']+40,'y':hb['y']+hb['height']/2,'id':1}]}); pg.wait_for_timeout(520)
            cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
        pg.wait_for_timeout(300); print('  category menu:', pg.locator('.nbd-menu button').all_inner_texts())
        pg.mouse.click(5,5) if name=='desk' else pg.touchscreen.tap(5,300); pg.wait_for_timeout(200); print('  closes on a touch elsewhere:', pg.locator('.nbd-menu').count()==0, '| errors', errs)
        b.close()
