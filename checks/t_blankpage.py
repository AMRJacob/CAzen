"""A page starts with only the blocks chosen; heading right-click hides one; the corner menu's Add puts one on."""
from common import *
import json, sys
phone = len(sys.argv) > 1
V={'id':'cccccccc-cccc-4ccc-8ccc-ccccccccc001','project_id':PROJ,'kind':'visit','visited_on':'2026-11-18','visited_at':'15:00:00','title':'Walk','weather':'x','names':None,
   'notes':'1. Structure\n  a. first','photos':[],'photo_labels':{},'pad_id':None,'issued_id':None,'location':None,'widgets':{'_on':{'on':['names','notes']}},'created_at':'2026-11-18T15:00:00Z'}
patches=[]; posts=[]
with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(**(PHONE if phone else {'viewport':{'width':1440,'height':900}}))
    install(ctx,{'site_visits':lambda r:[V],'PATCH:site_visits':lambda r:(patches.append(json.loads(r.post_data)),[{}])[1],'POST:site_visits':lambda r:(posts.append(json.loads(r.post_data)),[json.loads(r.post_data)])[1],
      'note_pads':[],'pad_marks':[],'observations':[],'observation_types':[],'project_people':[],'notebook_layouts':lambda r:None}); signed_in(ctx)
    pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    tap=lambda sel: (pg.tap if phone else pg.click)(sel)
    pg.goto(BASE); pg.wait_for_selector('text=Stand-in Office'); tap('td.p-name, .p-card'); pg.wait_for_timeout(500)
    pg.goto(BASE+'#/field-notes/reports'); pg.wait_for_selector('.nb-toc li'); tap('.nb-toc li button'); pg.wait_for_timeout(900)
    blocks=lambda: [x.get_attribute('class').split()[1].replace('nb-cell-','') for x in pg.locator('.nb-cell').all()]
    print('shown:', blocks(), '| tabs:', pg.locator('.nb-tabs button').all_inner_texts() if phone else '-')
    if phone:
        h=pg.locator('.nb-tabs button:has-text("Attendees")').bounding_box()
        cdp=ctx.new_cdp_session(pg); x,y=h['x']+h['width']/2,h['y']+h['height']/2
        cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':x,'y':y,'id':1}]}); pg.wait_for_timeout(750)
        cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]}); pg.wait_for_timeout(200)
    else:
        pg.locator('.nb-z-names .nb-z-top h2').click(button='right'); pg.wait_for_timeout(200)
    print('menu:', pg.locator('.nbd-menu button').all_inner_texts())
    tap('.nbd-menu button:has-text("Hide on this page")'); pg.wait_for_timeout(500)
    print('after hide:', blocks(), '| saved on:', patches[-1].get('widgets',{}).get('_on') if patches else None)
    tap('.nb-menu-mark'); pg.wait_for_timeout(300); tap('.nb-menu-spot:has-text("Add")'); pg.wait_for_timeout(300)
    print('add list:', pg.locator('.nb-add-list button').all_inner_texts())
    tap('.nb-add-list button:has-text("Checklist")'); pg.wait_for_timeout(500)
    print('after add:', blocks(), '| on:', patches[-1]['widgets']['_on'])
    # a new page
    tap('.nb-menu-mark'); pg.wait_for_timeout(300); tap('.nb-menu-spot:has-text("New page")'); pg.wait_for_timeout(400)
    print('start choices:', [l.inner_text() for l in pg.locator('.nb-start-list label').all()], 'ticked:', [l.inner_text() for l in pg.locator('.nb-start-list label:has(input:checked)').all()])
    pg.locator('.nb-start-list label:has-text("Sketch") input').check()
    tap('.nb-start button:has-text("Start the page")'); pg.wait_for_timeout(900)
    print('new page shows:', blocks(), '| saved widgets:', patches[-1].get('widgets'))
    print('errors', errs)
    b.close()
