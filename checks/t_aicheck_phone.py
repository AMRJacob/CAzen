"""Check with AI on a phone, by touch: every button reachable and doing what it says."""
from common import *
import json
V={'id':'cccccccc-cccc-4ccc-8ccc-ccccccccc001','project_id':PROJ,'kind':'meeting','visited_on':'2026-11-18','visited_at':'10:00:00','title':'OAC','weather':None,'names':None,
   'notes':'1. Schedule\n  a. roof dryin by 12/5\n  b. Owner wants furnature date\n2. Submittals\n  a. door hardware resubmital\n3. Unsorted\n  a. Call roofer about flashing','photos':[],'photo_labels':{},'pad_id':None,'issued_id':None,'location':None,'widgets':{},'created_at':'2026-11-18T15:00:00Z'}
REPLY='1. Schedule\n   a. Roof dry-in by 12/5.\n   b. Owner requested the furniture delivery date.\n2. Submittals\n   a. Door hardware resubmittal.\n3. Roofing\n   a. Call the roofer about flashing.'
saved=[]
def at(pg,sel):
    el=pg.locator(sel).first; bb=el.bounding_box(); x,y=bb['x']+bb['width']/2,bb['y']+bb['height']/2
    top=pg.evaluate("([x,y])=>{const e=document.elementFromPoint(x,y);return e?(e.textContent||'').trim().slice(0,30)+' <'+e.tagName+' '+(e.className||'')+'>':'none'}",[x,y])
    return x,y,top,bb
with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(**PHONE)
    install(ctx,{'site_visits':lambda r:[V],'PATCH:site_visits':lambda r:(saved.append(json.loads(r.post_data).get('notes')),[{}])[1],'note_pads':[],'pad_marks':[],'observations':[],'observation_types':[],'project_people':[],'notebook_layouts':lambda r:None}); signed_in(ctx)
    pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(BASE); pg.wait_for_selector('text=Stand-in Office'); pg.locator('.p-card, td.p-name').first.tap(); pg.wait_for_timeout(500)
    pg.goto(BASE+'#/field-notes/meetings'); pg.wait_for_selector('.nb-toc li'); pg.locator('.nb-toc li button').first.tap(); pg.wait_for_timeout(600)
    if pg.locator('.nb-tabs').count(): pg.locator('.nb-tabs button:has-text("Notes")').tap(); pg.wait_for_timeout(200)
    heading_menu(pg, ctx, '.nb-z-notes .nb-z-top h2', 'Check with AI', touch=True)
    pg.locator('.aic-reply').fill(REPLY)
    x,y,top,bb=at(pg,'button:has-text("Review the changes")'); print('Review button at', round(x),round(y),'on top:',top, '| card box', pg.locator('.aic').bounding_box())
    pg.touchscreen.tap(x,y); pg.wait_for_timeout(300)
    print('reviewing:', pg.locator('.aic-ch').count(), '|', pg.inner_text('.aic-bar span'), '| in the notebook frame, not the page:', pg.evaluate("!document.querySelector('.aic').closest('.nb-paper')"))
    x,y,top,bb=at(pg,'.aic-ch >> nth=1 >> button:has-text("Reject")'); print('Reject at', round(x),round(y),'on top:',top)
    pg.touchscreen.tap(x,y); pg.wait_for_timeout(200); print('bar:', pg.inner_text('.aic-bar span'))
    x,y,top,bb=at(pg,'.aic-ch >> nth=1 >> button:has-text("Accept")'); print('Accept at', round(x),round(y),'on top:',top)
    pg.touchscreen.tap(x,y); pg.wait_for_timeout(200); print('bar:', pg.inner_text('.aic-bar span'))
    print('row after Accept:', pg.locator('.aic-ch').nth(1).get_attribute('class'), '|', pg.locator('.aic-ch').nth(1).locator('.aic-do').inner_text().replace('\n',' / '))
    x,y,top,bb=at(pg,'.aic .actions button:has-text("Apply")'); print('Apply at', round(x),round(y),'visible in screen:', 0<y<pg.viewport_size['height'], 'on top:',top)
    pg.touchscreen.tap(x,y); pg.wait_for_timeout(1000); print('saved:', repr(saved[-1]) if saved else None, '| errors', errs)
    pg.screenshot(path='aic_phone.png'); b.close()
