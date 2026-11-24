"""Zooming into a notebook photograph at a desk: wheel about the pointer, drag, double-click, buttons, never off its frame."""
from common import *
import base64
from PIL import Image, ImageDraw
import io
im=Image.new('RGB',(1600,1200),'white'); d=ImageDraw.Draw(im)
for i in range(0,1600,80): d.line([(i,0),(i,1200)],fill='gray')
buf=io.BytesIO(); im.save(buf,'PNG'); PNG=buf.getvalue()
V={'id':'cccccccc-cccc-4ccc-8ccc-ccccccccc001','project_id':PROJ,'kind':'visit','visited_on':'2026-11-18','visited_at':'15:00:00','title':'Walk','weather':'x','names':None,'notes':'1. A\n  a. x','photos':['p/one.jpg'],'photo_labels':{'p/one.jpg':'North wall'},'pad_id':None,'issued_id':None,'location':None,'widgets':{},'created_at':'2026-11-18T15:00:00Z'}
with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={'width':1440,'height':900})
    install(ctx,{'site_visits':lambda r:[V],'note_pads':[],'pad_marks':[],'observations':[],'observation_types':[],'project_people':[],'notebook_layouts':lambda r:None}); signed_in(ctx)
    ctx.route('**/*one.jpg*', lambda r: r.fulfill(status=200, content_type='image/png', body=PNG))
    pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(BASE); pg.wait_for_selector('text=Stand-in Office'); pg.locator('td.p-name, .p-card').first.click(); pg.wait_for_timeout(500)
    pg.goto(BASE+'#/field-notes/reports'); pg.wait_for_selector('.nb-toc li'); pg.click('.nb-toc li button'); pg.wait_for_selector('.nb-cell'); pg.wait_for_timeout(700)
    pg.locator('.nb-gallery button, .nb-z-photos button.nb-thumb, .nb-z-photos li button').first.click(); pg.wait_for_selector('.zp'); pg.wait_for_timeout(400)
    tf=lambda: pg.locator('.zp-in').evaluate('e=>e.style.transform')
    bb=pg.locator('.zp').bounding_box(); cx,cy=bb['x']+bb['width']*0.7,bb['y']+bb['height']*0.3
    pg.mouse.move(cx,cy)
    for _ in range(5): pg.mouse.wheel(0,-100); pg.wait_for_timeout(40)
    print('wheel in:', tf(), '|', pg.inner_text('.zp-tools span'))
    pg.mouse.down(); pg.mouse.move(cx+120,cy+80,steps=6); pg.mouse.up(); print('dragged:', tf())
    pg.mouse.move(cx-2000,cy); 
    for _ in range(3): pg.mouse.down(); pg.mouse.move(cx+3000,cy+3000,steps=4); pg.mouse.up()
    print('dragged far — kept in frame:', tf())
    pg.click('.zp-tools button:has-text("Fit")'); print('fit:', tf())
    pg.mouse.dblclick(cx,cy); print('double-click:', tf(), pg.inner_text('.zp-tools span')); pg.mouse.dblclick(cx,cy); print('again:', tf())
    pg.click('.zp-tools button[aria-label="Zoom in"]'); print('+ :', pg.inner_text('.zp-tools span'))
    print('label still there:', pg.locator('.nb-light-row input').input_value(), '| errors', errs)
    b.close()
