"""The notes spread: open from the Notes heading's menu, move things anywhere, combine two loose notes, file one, take one out."""
from common import *
import json, sys
phone = len(sys.argv) > 1
V={'id':'cccccccc-cccc-4ccc-8ccc-ccccccccc001','project_id':PROJ,'kind':'visit','visited_on':'2026-11-18','visited_at':'15:00:00','title':'Walk','weather':'x','names':None,
   'notes':'1. Structure\n  a. anchor bolts\n2. Envelope\n3. Unsorted\n  a. sealant gap\n  b. drywall dent\n  c. paint touch-up','photos':[],'photo_labels':{},'pad_id':None,'issued_id':None,'location':None,'widgets':{},'created_at':'2026-11-18T15:00:00Z'}
patches=[]
with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(**(PHONE if phone else {'viewport':{'width':1440,'height':900}}))
    install(ctx,{'site_visits':lambda r:[V],'PATCH:site_visits':lambda r:(patches.append(json.loads(r.post_data)),[{}])[1],'note_pads':[],'pad_marks':[],'observations':[],'observation_types':[],'project_people':[],'notebook_layouts':lambda r:None}); signed_in(ctx)
    pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    tap=lambda sel: (pg.tap if phone else pg.click)(sel)
    pg.goto(BASE); pg.wait_for_selector('text=Stand-in Office'); tap('td.p-name, .p-card'); pg.wait_for_timeout(500)
    pg.goto(BASE+'#/field-notes/reports'); pg.wait_for_selector('.nb-toc li'); tap('.nb-toc li button'); pg.wait_for_timeout(700)
    if phone: tap('.nb-tabs button:has-text("Notes")'); pg.wait_for_timeout(300)
    # Spread out is in the Notes heading's menu; open space on the board does not open it.
    bb=pg.locator('.nbd-board').bounding_box()
    (pg.touchscreen.tap if phone else pg.mouse.click)(bb['x']+bb['width']-8, bb['y']+bb['height']-4); pg.wait_for_timeout(400)
    print('open space opens nothing:', pg.locator('.nsp').count()==0)
    heading_menu(pg, ctx, '.nb-z-notes .nb-z-top h2', 'Spread out', touch=phone)
    print('spread open:', pg.locator('.nsp').count()==1, '| things:', pg.locator('.nsp-at').count())
    def drag(src, x, y):
        s=src.bounding_box(); sx,sy=s['x']+20,s['y']+s['height']/2
        if phone:
            cdp=ctx.new_cdp_session(pg)
            T=lambda k,a,b2: cdp.send('Input.dispatchTouchEvent',{'type':k,'touchPoints':[] if k=='touchEnd' else [{'x':a,'y':b2,'id':1}]})
            T('touchStart',sx,sy)
            for i in range(1,13): T('touchMove',sx+(x-sx)*i/12,sy+(y-sy)*i/12); pg.wait_for_timeout(16)
            T('touchEnd',0,0)
        else:
            pg.mouse.move(sx,sy); pg.mouse.down(); pg.mouse.move(x,y,steps=12); pg.wait_for_timeout(80); pg.mouse.up()
        pg.wait_for_timeout(500)
    at=lambda t: pg.locator(f'.nsp-at:has-text("{t}")').first
    card=lambda t: pg.locator(f'.nsp .nbd-card:has-text("{t}")').first
    sc=pg.locator('.nsp-scroll').bounding_box()
    b0=at('Envelope').bounding_box()
    drag(pg.locator('.nsp-at:has-text("Envelope") .nbd-box-head').first, sc['x']+sc['width']*0.6, sc['y']+sc['height']*0.7)
    b1=at('Envelope').bounding_box(); print('Envelope moved by', round(b1['x']-b0['x']), round(b1['y']-b0['y']), '| spread saved:', 'spread' in (patches[-1].get('widgets') or {}) if patches else None)
    d=card('drywall dent').bounding_box()
    drag(card('paint touch-up'), d['x']+d['width']/2, d['y']+d['height']/2)
    pg.wait_for_timeout(300); pg.keyboard.type('Interior'); pg.keyboard.press('Enter'); pg.wait_for_timeout(500)
    notes=[x.get('notes') for x in patches if 'notes' in x]
    print('combined:', repr(notes[-1]) if notes else None)
    e=pg.locator('.nsp-at:has-text("Envelope") .nbd-box-head').first.bounding_box()
    drag(card('sealant gap'), e['x']+40, e['y']+e['height']/2)
    drag(card('anchor bolts'), sc['x']+sc['width']*0.25, sc['y']+sc['height']*0.85)
    notes=[x.get('notes') for x in patches if 'notes' in x]
    print('after filing and taking out:', repr(notes[-1]))
    print('spread keys:', sorted((patches[-1].get('widgets') or {}).get('spread',{}).get('spread',{}).keys()) if patches else None)
    pg.screenshot(path="/tmp/spread_phone.png" if phone else "/tmp/spread_desk.png"); tap(".nsp-bar button:has-text(\"Done\")"); pg.wait_for_timeout(400)
    print('back on the page:', pg.locator('.nbd-board').count()==1, '| boxes:', pg.locator('.nbd-box.d0 > .nbd-box-head .nbd-box-name').all_inner_texts(), '| errors', errs)
    b.close()
