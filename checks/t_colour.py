"""An activity's bar can be given a colour from its row's editor."""
from common import *
import json, re
A=lambda i,n,s,e,p,c=None: {'id':'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa0%d'%i,'project_id':PROJ,'contract_id':None,'name':n,'is_heading':False,'starts_on':s,'ends_on':e,'percent':p,'sort':i,'color':c}
acts=[A(1,'Footings','2026-09-01','2026-10-15',100),A(2,'Framing','2026-10-10','2026-12-20',40,'#3b6ea5')]; sent=[]
with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={'width':1440,'height':900}); install(ctx,{'schedule_activities':acts,'schedule_activity_lines':[],'schedule_versions':[],'pay_contracts':[]}); signed_in(ctx)
    def patch(route):
        if route.request.method=='PATCH': sent.append(json.loads(route.request.post_data)); return route.fulfill(status=204,body='')
        route.fallback()
    ctx.route(re.compile(r'.*/rest/v1/schedule_activities\?.*'),patch)
    pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(BASE); pg.wait_for_selector('text=Stand-in Office'); pg.click('td.p-name'); pg.wait_for_selector('.overview'); pg.goto(BASE+'#/schedule'); pg.wait_for_selector('.gx-bar')
    print('bars coloured:',pg.evaluate("[...document.querySelectorAll('.gx-bar')].map(b=>[b.classList.contains('gx-coloured'),getComputedStyle(b.querySelector('.gx-done')).backgroundColor])"))
    pg.locator('.gx-row',has_text='Footings').click(button='right'); pg.wait_for_selector('.gx-swatch'); pg.locator('.gx-swatch').nth(3).click(); pg.wait_for_timeout(400)
    print('swatches:',pg.locator('.gx-swatch').count(),'| sent:',sent,'| errors:',errs); pg.screenshot(path='colour.png'); b.close()
