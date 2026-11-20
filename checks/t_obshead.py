"""Observation form head: name, trade tag under it, date | discussed with | status; no 'Where, who and when'.
And the phone menu held by its bottom edge while a long page scrolls."""
from common import *
from t_fix import extra as sheets
T1='77777777-7777-4777-8777-777777777771'
extra=dict(sheets); extra.update({'observations':[],'observation_types':[{'id':T1,'firm_id':FIRM,'code':'N','name':'Non-conforming','position':0,'is_punch':False}]})
with sync_playwright() as p:
    b=p.chromium.launch(channel='chrome'); ctx=b.new_context(**PHONE); install(ctx,extra); signed_in(ctx)
    ctx.route(re.compile(r'.*/rest/v1/observation_tags.*'), lambda r: r.fulfill(status=404,content_type='application/json',body=json.dumps({'code':'PGRST205','message':'no table'})))
    pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(BASE); pg.wait_for_selector('text=Stand-in Office'); pg.click('.projects a, td.p-name'); pg.wait_for_timeout(300)
    pg.goto(BASE+'#/field-notes/observations'); pg.wait_for_selector('text=New observation'); pg.click('button:has-text("New observation")'); pg.wait_for_timeout(300)
    name=pg.locator('.obs-name').bounding_box(); tag=pg.locator('.obs-head .obs-tag-open').bounding_box()
    row=[(e.evaluate('e=>e.getAttribute("aria-label")'), e.bounding_box()) for e in pg.locator('.obs-head-row > input, .obs-head-row > select').all()]
    print('tag under name:', tag['y']>name['y']+name['height']-1, '| tag text:', pg.inner_text('.obs-head .obs-tag-open'))
    print('row:', [(l, round(bx['x']), round(bx['y']), round(bx['width'])) for l,bx in row])
    d=[bx for l,bx in row if l=='Discussed with'][0]; s=[bx for l,bx in row if l=='Status'][0]
    print('status right of discussed, same line:', s['x']>d['x'] and abs(s['y']-d['y'])<4, '| right edge', round(s['x']+s['width']), 'of', PHONE['viewport']['width'])
    print('Where/who/when gone:', pg.locator('text=Where, who and when').count()==0, '| Area/Wanted by gone:', pg.locator('text=Wanted by').count()==0 and pg.locator('label:has-text("Area")').count()==0)
    pg.click('.obs-head .obs-tag-open'); pg.click('.obs-tag-trades .chip:has-text("Glazing")'); pg.click('.obs-tag-trades .chip:has-text("Glazing")'); pg.wait_for_timeout(200)
    print('trade chosen shows under name:', pg.inner_text('.obs-head .obs-tag-open'))
    pg.select_option('.obs-status', index=1); print('status now:', pg.input_value('.obs-status'))
    pg.screenshot(path='obshead.png')
    # The phone menu: bottom-anchored, and in the same place after scrolling.
    st=pg.evaluate("()=>{const n=document.querySelector('.phone-nav');const c=getComputedStyle(n);return {top:c.top,bottom:c.bottom,tr:c.transitionProperty}}")
    print('nav style:', st)
    y0=pg.locator('.phone-nav').bounding_box()['y']; pg.mouse.wheel(0,600); pg.wait_for_timeout(400); y1=pg.locator('.phone-nav').bounding_box()['y']
    print('nav y before/after scroll:', round(y0), round(y1), '| from bottom:', round(PHONE['viewport']['height']-y1-52))
    pg.click('.phone-nav .pn-mark'); pg.wait_for_timeout(400); bx=pg.locator('.phone-nav').bounding_box()
    print('open bar bottom edge:', round(bx['y']+bx['height']), '| height', round(bx['height']))
    pg.click('.phone-nav .pn-spot:has-text("More")'); pg.wait_for_timeout(400); bx=pg.locator('.phone-nav').bounding_box()
    print('More bar: top', round(bx['y']), 'bottom', round(bx['y']+bx['height']), '| errors:', errs)
