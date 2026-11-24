"""A notebook page on a phone: one tool at a time. The strip lists the page's own blocks; a tap or a sideways swipe moves
between them; the corner menu's Note goes to the notes. Arranging still shows the whole list."""
from common import *
V={'id':'cccccccc-cccc-4ccc-8ccc-ccccccccc001','project_id':PROJ,'kind':'visit','visited_on':'2026-11-18','visited_at':'15:00:00','title':'Walk','weather':'x','names':None,'notes':'1. Structure\n  a. x','photos':[],'photo_labels':{},'pad_id':None,'issued_id':None,'location':None,'widgets':{},'created_at':'2026-11-18T15:00:00Z'}
with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(**PHONE)
    install(ctx,{'site_visits':lambda r:[V],'note_pads':[],'pad_marks':[],'observations':[],'observation_types':[],'project_people':[],'notebook_layouts':lambda r:None}); signed_in(ctx)
    pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(BASE); pg.wait_for_selector('text=Stand-in Office'); pg.locator('.p-card, td.p-name').first.tap(); pg.wait_for_timeout(500)
    pg.goto(BASE+'#/field-notes/reports'); pg.wait_for_selector('.nb-toc li'); pg.locator('.nb-toc li button').first.tap(); pg.wait_for_selector('.nb-tabs'); pg.wait_for_timeout(600)
    vis=lambda: pg.evaluate("[...document.querySelectorAll('.nb-tab-cell')].filter(c=>!c.hidden).map(c=>c.dataset.block)")
    print('tabs:', pg.locator('.nb-tabs button').all_inner_texts(), '| shown:', vis())
    pg.locator('.nb-tabs button:has-text("Sketch")').tap(); pg.wait_for_timeout(200)
    h=pg.locator('.nb-tab-cell:not([hidden]) .nb-pad').bounding_box()
    print('Sketch tab:', vis(), '| pad height', round(h['height']), 'of', pg.viewport_size['height'])
    cdp=ctx.new_cdp_session(pg)
    T=lambda k,x,y: cdp.send('Input.dispatchTouchEvent',{'type':k,'touchPoints':[] if k=='touchEnd' else [{'x':x,'y':y,'id':1}]})
    def swipe(dx):
        T('touchStart',200,500)
        for i in range(1,9): T('touchMove',200+dx*i/8,500+4*i/8); pg.wait_for_timeout(12)
        T('touchEnd',0,0); pg.wait_for_timeout(250)
    swipe(-180); print('swipe left →', vis()); swipe(-180); print('swipe left →', vis()); swipe(180); print('swipe right →', vis())
    pg.locator('.nb-menu .nb-menu-mark').tap(); pg.wait_for_timeout(300); pg.locator('.nb-menu .nb-menu-spot:has-text("Note")').tap(); pg.wait_for_timeout(400)
    print('corner Note →', vis(), '| cursor in the note box:', pg.evaluate("document.activeElement?.closest('.nbd-type')!=null"))
    pg.locator('.nb-menu .nb-menu-mark').tap(); pg.wait_for_timeout(300); pg.locator('.nb-menu .nb-menu-spot:has-text("Arrange")').tap(); pg.wait_for_timeout(400)
    print('arranging shows the list:', pg.locator('.nb-tabs').count()==0, pg.locator('.nb-arr').count())
    pg.screenshot(path='tabs_phone.png'); print('errors', errs); b.close()
