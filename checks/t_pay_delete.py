"""The last application for payment can be deleted; an earlier one cannot until the later ones are gone."""
from common import *
import t_overview as o, re, copy
ex=dict(o.ex); ex['issued_form_links']=[]; apps=copy.deepcopy(o.ex['pay_apps']); ex['pay_apps']=lambda r: apps; gone=[]
with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={'width':1440,'height':900}); install(ctx,ex); signed_in(ctx)
    def rm(route):
        if route.request.method=='DELETE':
            i=route.request.url.split('id=eq.')[1][:36]; gone.append(i[-4:]); apps[:]=[a for a in apps if a['id']!=i]; return route.fulfill(status=200,content_type='application/json',body='[{"id":"%s"}]'%i)
        route.fallback()
    ctx.route(re.compile(r'.*/rest/v1/pay_apps\?.*'),rm)
    pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(BASE); pg.wait_for_selector('text=Stand-in Office'); pg.click('td.p-name'); pg.wait_for_selector('.overview'); pg.goto(BASE+'#/pay'); pg.wait_for_timeout(1500)
    tabs=lambda: [t for t in pg.locator('.tabs').first.locator('button').all_inner_texts()]
    print('tabs:',tabs())
    pg.locator('.tabs button').filter(has_text=re.compile('1')).first.click(); pg.wait_for_timeout(500); print('application 1 delete disabled:',pg.locator('.pay-delete').is_disabled())
    pg.locator('.tabs button').filter(has_text=re.compile('2')).first.click(); pg.wait_for_timeout(500); print('application 2 delete disabled:',pg.locator('.pay-delete').is_disabled())
    pg.click('.pay-delete'); pg.wait_for_timeout(300); pg.screenshot(path='pay_delete.png'); print('asks:',pg.locator('.confirm-delete').inner_text().replace('\n',' | ')[:230])
    pg.click('.confirm-delete button.danger'); pg.wait_for_timeout(900)
    print('server told to delete:',gone,'| tabs now:',tabs(),'| errors:',errs); b.close()
