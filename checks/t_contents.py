"""Field notes contents: the corner mark (every screen size) offers New page, Delete a page and Exit."""
from common import *
import json, re
V=lambda i,d: {'id':'cccccccc-cccc-4ccc-8ccc-ccccccccc00%d'%i,'project_id':PROJ,'kind':'visit','visited_on':d,'visited_at':d+'T15:00:00Z','title':'Walk %d'%i,'weather':None,'names':'','notes':'','photos':[],'photo_labels':{},'pad_id':None,'issued_id':None,'location':None,'created_by':UID,'created_at':d+'T15:00:00Z'}
with sync_playwright() as p:
    b=p.chromium.launch()
    for name,vp in (('phone',PHONE),('fold 820',dict(viewport={'width':820,'height':900},has_touch=True)),('desk',dict(viewport={'width':1600,'height':950}))):
        store=[V(1,'2026-11-18'),V(2,'2026-11-19')]; gone=[]
        ctx=b.new_context(**vp); install(ctx,{'site_visits':lambda r: store,'note_pads':[],'observations':[],'POST:site_visits':lambda r: (json.loads(r.post_data))}); signed_in(ctx)
        def rm(route):
            if route.request.method=='DELETE': gone.append(route.request.url.split('?')[1][:60]); store[:]=[s for s in store if s['id'] not in route.request.url]; return route.fulfill(status=200,content_type='application/json',body='[]')
            route.fallback()
        ctx.route(re.compile(r'.*/rest/v1/site_visits\?.*'),rm)
        pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
        pg.goto(BASE); pg.wait_for_selector('text=Stand-in Office'); pg.locator('td.p-name').first.click(); pg.wait_for_selector('.overview'); pg.goto(BASE+'#/field-notes/reports'); pg.wait_for_selector('.nb-toc li >> nth=1'); pg.wait_for_timeout(400)
        m=pg.locator('.nb-menu-contents'); bx=m.bounding_box(); w=pg.viewport_size
        print(name,'| mark shown:',m.is_visible(),'left gap',round(bx['x']),'right gap',round(w['width']-bx['x']-bx['width']),'bottom gap',round(w['height']-bx['y']-bx['height']),'| top button:',pg.locator('.nb-contents .nb-today').is_visible(),'x:',pg.locator('.nb-contents .nb-exit').is_visible())
        pg.click('.nb-menu-contents .nb-menu-mark'); pg.wait_for_timeout(450); print('  offers:',pg.locator('.nb-menu-contents .nb-menu-spot').all_inner_texts(),'| fits:',pg.locator('.nb-menu-contents').bounding_box()['x']>=0)
        pg.screenshot(path='contents_%s.png'%name.split()[0])
        pg.click('.nb-menu-contents .nb-menu-spot:has-text("Delete a page")'); pg.wait_for_selector('.nb-toc-delete'); print('  delete buttons:',pg.locator('.nb-toc-delete').count())
        pg.locator('.nb-toc-delete').first.click(); pg.wait_for_selector('.nb-tearout'); pg.locator('.nb-tearout button').filter(has_text=re.compile('Tear|Delete')).first.click(); pg.wait_for_timeout(900)
        print('  server told to delete:',gone,'| pages left:',pg.locator('.nb-toc li').count())
        pg.click('.nb-removing button'); pg.click('.nb-menu-contents .nb-menu-mark'); pg.wait_for_timeout(450); pg.click('.nb-menu-contents .nb-menu-spot:has-text("Close")'); pg.wait_for_timeout(500)
        print('  exit ->',pg.url.split('#')[1],'| errors:',errs); ctx.close()
    b.close()
