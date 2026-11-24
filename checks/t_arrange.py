"""Arranging a notebook page: desk (drag, resize, hide, add a checklist and a text box, kept and read back),
tablet (eight columns), phone (reorder and hide from the corner menu). Writes in the added blocks reach the page."""
from common import *
import json, re, sys
V={'id':'cccccccc-cccc-4ccc-8ccc-ccccccccc001','project_id':PROJ,'kind':'visit','visited_on':'2026-11-18','visited_at':'15:00:00','title':'OAC Meeting','weather':'Sunny 60',
   'names':'Ann Lee | Owner | ann@x.com','notes':'1. Structure\n  a. Anchor bolts checked','photos':[],'photo_labels':{},'pad_id':None,'issued_id':None,'location':'Job site','widgets':{},'created_at':'2026-11-18T15:00:00Z'}
def boxes(pg):
    return pg.evaluate("""Object.fromEntries([...document.querySelectorAll('.nb-cell')].map(c=>{const r=c.getBoundingClientRect();return [c.dataset.block,[Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height)]]}))""")
def overlaps(bx):
    v=list(bx.items())
    return [(a,c) for i,(a,ra) in enumerate(v) for (c,rc) in v[i+1:] if ra[0]<rc[0]+rc[2]-1 and rc[0]<ra[0]+ra[2]-1 and ra[1]<rc[1]+rc[3]-1 and rc[1]<ra[1]+ra[3]-1]
with sync_playwright() as p:
    b=p.chromium.launch()
    for name,vp in (('desk',dict(viewport={'width':1500,'height':950})),('tablet',dict(viewport={'width':1024,'height':768},has_touch=True,is_mobile=True)),('phone',PHONE)):
        store=[dict(V)]; patches=[]; layouts={}
        ctx=b.new_context(**vp)
        def lay(r):
            if r.method in ('POST','PATCH'):
                row=json.loads(r.post_data); row=row[0] if isinstance(row,list) else row; layouts[row['device']]=row; return row
            return None
        install(ctx,{'site_visits':lambda r: store,'note_pads':[],'pad_marks':[],'observations':[],'observation_types':[],'project_people':[],'notebook_layouts':lambda r: None,'POST:notebook_layouts':lay}); signed_in(ctx)
        def pt(route):
            if route.request.method=='PATCH':
                body=json.loads(route.request.post_data); patches.append(body); store[0].update(body); return route.fulfill(status=204,body='')
            route.fallback()
        ctx.route(re.compile(r'.*/rest/v1/site_visits\?.*'),pt)
        pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
        pg.goto(BASE); pg.wait_for_selector('text=Stand-in Office'); pg.locator('td.p-name, .p-card').first.click(); pg.wait_for_timeout(600)
        pg.goto(BASE+'#/field-notes/reports'); pg.wait_for_selector('.nb-toc li'); pg.click('.nb-toc li button'); pg.wait_for_selector('.nb-cell'); pg.wait_for_timeout(800)
        bx=boxes(pg); print(f'\n== {name}: blocks', list(bx), '| overlaps:', overlaps(bx)); pg.screenshot(path=f'arr_{name}_0.png')
        pg.click('.nb-menu .nb-menu-mark'); pg.wait_for_timeout(400)
        spots=pg.locator('.nb-menu .nb-menu-spot').all_inner_texts()
        print('  menu:', spots, '| last inside screen:', pg.evaluate("[...document.querySelectorAll('.nb-menu .nb-menu-spot')].pop().getBoundingClientRect().right<=innerWidth"))
        pg.click('.nb-menu .nb-menu-spot:has-text("Arrange")'); pg.wait_for_selector('.nb-arr'); pg.wait_for_timeout(300)
        print('  arranging:', pg.inner_text('.nb-arr-say'), '| arrange menu:', pg.locator('.nb-menu-arrange .nb-menu-spot').all_inner_texts())
        if name!='phone':
            # Drag the sketch onto the notes' place; resize the photographs; hide the observations.
            s=pg.locator('.nb-cell[data-block="sketch"] .nb-arr').bounding_box(); n=pg.locator('.nb-cell[data-block="notes"]').bounding_box()
            pg.mouse.move(s['x']+s['width']/2, s['y']+s['height']/2); pg.mouse.down()
            pg.mouse.move(n['x']+n['width']/2, s['y']+s['height']/2, steps=12); pg.mouse.up(); pg.wait_for_timeout(200)
            after=boxes(pg); print('  sketch dragged onto notes →', after['sketch'][:2], 'notes now', after['notes'][:2], '| overlaps:', overlaps(after))
            pg.locator('.nb-cell[data-block="photos"] .nb-arr-size').scroll_into_view_if_needed(); after=boxes(pg); print('  resize handle bottom vs screen:', round(pg.locator('.nb-cell[data-block="photos"] .nb-arr-size').bounding_box()['y']), pg.viewport_size['height'])
            h=pg.locator('.nb-cell[data-block="photos"] .nb-arr-size').bounding_box(); w0=after['photos'][2]
            pg.mouse.move(h['x']+10,h['y']+10); pg.mouse.down(); pg.mouse.move(h['x']-w0/2,h['y']+150,steps=10); pg.mouse.up(); pg.wait_for_timeout(200)
            after=boxes(pg); print('  photos resized', w0, '→', after['photos'][2:], '| overlaps:', overlaps(after))
            pg.click('.nb-cell[data-block="seen"] .nb-arr-hide')
        else:
            pg.click('.nb-cell[data-block="notes"] .nb-arr-head button[aria-label^="Move"][aria-label$="up"]')
            print('  order after notes ↑:', list(boxes(pg)))
            pg.click('.nb-cell[data-block="seen"] .nb-arr-hide')
        pg.click('.nb-menu-arrange .nb-menu-spot:has-text("Checklist")'); pg.click('.nb-menu-arrange .nb-menu-spot:has-text("Text box")'); pg.wait_for_timeout(200)
        chk=pg.locator('.nb-cell-check input.nb-arr-name'); chk.fill('Punch walk'); chk.press('Enter')
        pg.click('.nb-menu-arrange .nb-menu-spot:has-text("Show")'); print('  hidden, offered back:', pg.locator('.nb-arr-show button').all_inner_texts()); pg.keyboard.press("Escape"); pg.wait_for_timeout(150); print("  still on the page:", pg.locator(".nb-arr").count()>0)
        bx=boxes(pg); print('  arranged:', list(bx), '| overlaps:', overlaps(bx) if name!='phone' else '-'); pg.screenshot(path=f'arr_{name}_1.png')
        pg.click('.nb-menu-arrange .nb-menu-spot:has-text("Close")'); pg.wait_for_timeout(700)
        sent=layouts.get('desktop' if name=='desk' else name)
        print('  kept on server:', bool(sent), [ (x['kind'],x.get('title')) for x in (sent or {}).get('layout',{}).get('blocks',[])], '| gone:', (sent or {}).get('layout',{}).get('gone'))
        # Write in the added blocks.
        tabs=pg.locator('.nb-tabs').count()>0
        if tabs: pg.locator('.nb-tabs button:has-text("Punch walk")').click(); pg.wait_for_timeout(150)
        item=pg.locator('.nb-cell-check'); item.locator('.nb-check-add').click(); pg.keyboard.type('Roof drains'); pg.keyboard.press('Enter'); pg.keyboard.type('Flashing at parapet')
        item.locator('input[type="checkbox"]').first.check()
        if tabs: pg.locator('.nb-tabs button:has-text("Text box")').click(); pg.wait_for_timeout(150)
        pg.locator('.nb-cell-text textarea').fill('Rain held up masonry Tuesday.'); pg.locator('.nb-cell-text textarea').blur(); pg.wait_for_timeout(1600)
        w=store[0].get('widgets') or {}
        print('  page holds:', {k:v for k,v in w.items()})
        pg.screenshot(path=f'arr_{name}_2.png')
        # Reopen: the arrangement and the writing come back.
        pg.reload(); pg.wait_for_selector('.nb-toc li'); pg.click('.nb-toc li button'); pg.wait_for_selector('.nb-cell'); pg.wait_for_timeout(900)
        if pg.locator('.nb-tabs').count(): pg.locator('.nb-tabs button:has-text("Punch walk")').click(); pg.wait_for_timeout(150)
        print('  after reload:', list(boxes(pg)), '| checklist:', pg.locator('.nb-cell-check input[type="text"]').evaluate_all('e=>e.map(x=>x.value)'), '| ticked:', pg.locator('.nb-cell-check input[type="checkbox"]').evaluate_all('e=>e.map(x=>x.checked)'))
        # The report carries them.
        if pg.locator('.nb-tabs').count(): pg.locator('.nb-tabs button:has-text("Day")').click(); pg.wait_for_timeout(150)
        pg.click('button:has-text("Make the field report")'); pg.wait_for_timeout(1500)
        if pg.locator('text=List of fields').count(): pg.click('text=List of fields'); pg.wait_for_timeout(500)
        txt=' '.join(pg.locator('textarea').evaluate_all('e=>e.map(x=>x.value)'))
        print('  report carries:', 'Punch walk' in txt, 'Roof drains — done' in txt, 'Rain held up masonry' in txt)
        print('  errors:', errs); ctx.close()
    b.close()
