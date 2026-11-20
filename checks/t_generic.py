"""A trade's plain tag is chosen by its own line: no "Just <trade>" on the tagging screen or the form."""
from common import *
from t_fix import extra as sheets
T1='77777777-7777-4777-8777-777777777771'
extra=dict(sheets); extra.update({'observations':[],'observation_types':[{'id':T1,'firm_id':FIRM,'code':'N','name':'Non-conforming','position':0,'is_punch':False}]})
pdf=open('sheet.pdf','rb').read()
with sync_playwright() as p:
    b=p.chromium.launch(channel='chrome'); ctx=b.new_context(**PHONE); install(ctx,extra); signed_in(ctx)
    ctx.route(re.compile(r'.*/rest/v1/observation_tags.*'), lambda r: r.fulfill(status=404,content_type='application/json',body=json.dumps({'code':'PGRST205','message':'no table'})))
    ctx.route(re.compile(r'.*/functions/v1/files.*'), lambda r: r.fulfill(status=200,content_type='application/json',body=json.dumps({'url':'https://stand-in.supabase.co/blob/sheet.pdf','configured':True})))
    ctx.route(re.compile(r'.*/blob/sheet\.pdf'), lambda r: r.fulfill(status=200,content_type='application/pdf',body=pdf))
    pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(BASE); pg.wait_for_selector('text=Stand-in Office'); pg.click('.projects a, td.p-name'); pg.wait_for_timeout(300); pg.goto(BASE+'#/field-notes/observations'); pg.wait_for_selector('text=New observation'); pg.click('button:has-text("New observation")')
    pg.click('.obs-tag-open'); pg.click('.obs-tag-trades .chip:has-text("Masonry")'); pg.wait_for_timeout(150)
    print('form, Masonry opened:',pg.locator('.obs-tag-issues .chip').all_inner_texts(),'| chooser still open:',pg.locator('.obs-tags').count()==1)
    pg.click('.obs-tag-trades .chip:has-text("Masonry")'); pg.wait_for_timeout(200)
    print('form, Masonry touched again -> chooser closed:',pg.locator('.obs-tags').count()==0,'| chip:',pg.inner_text('.obs-tag-open'),'| title:',repr(pg.input_value('.obs-form input[placeholder]')) if pg.locator('.obs-form input[placeholder]').count() else '')
    pg.click('.obs-attach .photo-add:has-text("Drawing")'); pg.fill('.spot-bar input','101'); pg.click('.spot-list button'); pg.wait_for_selector('.spot-page img',timeout=15000)
    pg.click('.spot-menu .nb-menu-mark'); pg.wait_for_timeout(450); pg.click('.spot-menu .nb-menu-spot:has-text("Tag type")'); pg.wait_for_selector('.spot-tags')
    print('tagging screen opens on:',pg.inner_text('.spot-trade.on .spot-trade-name'))
    pg.locator('.spot-trade-head:has-text("Concrete")').click(); pg.wait_for_timeout(200)
    print('Concrete opened:',[t.replace('\n',' ') for t in pg.locator('.spot-trade.on .spot-trade-tags button').all_inner_texts()],'| panel open:',pg.locator('.spot-tags').count()==1)
    pg.locator('.spot-trade.on .spot-trade-head').click(); pg.wait_for_timeout(300)
    print('Concrete touched again -> panel closed:',pg.locator('.spot-tags').count()==0)
    bx=pg.locator('.spot-page').bounding_box(); pg.mouse.click(bx['x']+bx['width']*0.4,bx['y']+bx['height']*0.5); pg.wait_for_timeout(300)
    print('tag placed reads:',pg.inner_text('.spot-pin')); pg.screenshot(path='generic.png')
    pg.click('.spot-menu .nb-menu-mark'); pg.wait_for_timeout(450); pg.click('.spot-menu .nb-menu-spot:has-text("Close")'); pg.wait_for_timeout(400)
    print('back on the form, chip:',pg.inner_text('.obs-tag-open'),'| any "Just" anywhere:',pg.locator('text=/^Just /').count(),'| errors:',errs)
