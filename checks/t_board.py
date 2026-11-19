"""A page's notes as cards and boxes: type, drag into a category, into a subcategory; the outline underneath."""
from common import *
V={'id':'cccccccc-cccc-4ccc-8ccc-cccccccccccc','project_id':PROJ,'kind':'visit','visited_on':time.strftime('%Y-%m-%d'),'visited_at':'10:00:00','title':None,'weather':'Clear','location':None,'notes':'1. Site / Parking\n  a. \n2. Structure\n  a. \n3. Envelope\n  a. \n4. Interior\n  a. ','names':None,'photos':[],'photo_labels':{},'cover_photo':None,'pad_id':None,'issued_id':None,'created_at':'2026-11-19T16:00:00Z'}
saved=[]
ex={'site_visits':lambda r: [V] if 'kind=eq.visit' in r.url else [], 'observation_types':[], 'project_people':[], 'observations':[]}
def run(name,kw,touch):
    ctx=b.new_context(**kw); install(ctx,ex); signed_in(ctx)
    def pat(route):
        if route.request.method=='PATCH':
            d=json.loads(route.request.post_data)
            if 'notes' in d: saved.append(d['notes'])
            return route.fulfill(status=204,body='')
        route.fallback()
    ctx.route(re.compile(r'.*/rest/v1/site_visits.*'),pat)
    pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)[:200])); pg.on('dialog',lambda d:d.accept())
    pg.goto(BASE); pg.wait_for_selector('text=Stand-in Office'); (pg.tap if touch else pg.click)('td.p-name'); pg.wait_for_selector('.overview'); pg.goto(BASE+'#/field-notes/reports'); pg.wait_for_selector('.nb-toc-title'); (pg.tap if touch else pg.click)('.nb-toc-title'); pg.wait_for_selector('.nbd-type input'); pg.wait_for_timeout(400)
    cdp=ctx.new_cdp_session(pg)
    def centre(sel): bb=pg.locator(sel).first.bounding_box(); return bb['x']+bb['width']/2, bb['y']+min(bb['height']/2,16)
    def drag(src,dst):
        pg.locator(src).first.scroll_into_view_if_needed(); x0,y0=centre(src); x1,y1=centre(dst)
        if touch:
            T=lambda k,x,y: cdp.send('Input.dispatchTouchEvent',{'type':k,'touchPoints':[] if k=='touchEnd' else [{'x':x,'y':y,'id':1,'radiusX':10,'radiusY':10}]})
            T('touchStart',x0,y0)
            for i in range(1,9): T('touchMove',x0+(x1-x0)*i/8,y0+(y1-y0)*i/8); pg.wait_for_timeout(20)
            T('touchEnd',0,0)
        else:
            pg.mouse.move(x0,y0); pg.mouse.down(); pg.mouse.move((x0+x1)/2,(y0+y1)/2,steps=5); pg.mouse.move(x1,y1,steps=5); pg.mouse.up()
        pg.wait_for_timeout(450)
    print(name,'— boxes:',pg.locator('.nbd-box.d0 > .nbd-box-head .nbd-box-name').all_inner_texts(),'| outline box on the page:',pg.locator('.nb-z-notes textarea').count())
    for t in ('Anchor bolts out of plumb at grid C','Sealant missing at storefront'): pg.fill('.nbd-type input',t); pg.keyboard.press('Enter'); pg.wait_for_timeout(250)
    print('  typed, in the tray:',pg.locator('.nbd-tray .nbd-card-text').all_inner_texts())
    if touch:
        print('  bubbles:',[t.replace('\n',' ') for t in pg.locator('.nbd-bubble').all_inner_texts()],'| card is',round(pg.locator('.nbd-tray .nbd-card').first.bounding_box()['width']),'px wide of 402')
        drag('.nbd-tray .nbd-card:has-text("Anchor")','.nbd-bubble:has-text("Structure")'); drag('.nbd-tray .nbd-card:has-text("Sealant")','.nbd-bubble:has-text("Envelope")')
        print('  after: bubbles',[t.replace('\n',' ') for t in pg.locator('.nbd-bubble').all_inner_texts()],'| filed card width',round(pg.locator('.nbd-board .nbd-card').first.bounding_box()['width']))
    else:
        drag('.nbd-tray .nbd-card:has-text("Anchor")','.nbd-box.d0:has(> .nbd-box-head :text("Structure")) .nbd-box-in')
        drag('.nbd-tray .nbd-card:has-text("Sealant")','.nbd-box.d0:has(> .nbd-box-head :text("Envelope")) .nbd-box-in')
    pg.locator('.nbd').scroll_into_view_if_needed(); pg.screenshot(path='board_%s_b.png'%name)
    print('  dragged into Structure and Envelope → saved outline:',repr(saved[-1]) if saved else None, '| tray now:',pg.locator('.nbd-tray .nbd-card').count()); pg.screenshot(path='board_%s.png'%name)
    if not touch:
        pg.click('.nbd-box.d0:has(> .nbd-box-head :text("Envelope")) > .nbd-box-head button[title="Add a subcategory"]'); pg.keyboard.type('Storefront'); pg.keyboard.press('Enter'); pg.wait_for_timeout(300)
        drag('.nbd-card:has-text("Sealant")','.nbd-box.d1:has(> .nbd-box-head :text("Storefront"))')
        print('  subcategory made, card dragged into it:',repr(saved[-1].split('\n')[3:]))
        drag('.nbd-box.d1:has(> .nbd-box-head :text("Storefront")) > .nbd-box-head','.nbd-box.d0:has(> .nbd-box-head :text("Interior")) .nbd-box-in'); print('  the subcategory dragged to Interior, with its card:',repr(saved[-1].split('\n')[3:]))
        drag('.nbd-card:has-text("Anchor")','.nbd-tray'); print('  a card dragged back to the tray:',repr(saved[-1].split('\n')[-2:]))
    print('  errors:',errs[:2]); ctx.close()
with sync_playwright() as p:
    b=p.chromium.launch(channel='chrome'); run('desk',dict(viewport={'width':1440,'height':900}),False); saved.clear(); run('phone',PHONE,True); b.close()
