"""The contractor's PDF beside the application's figures: added from the comparison card, docked to the right, the page making room."""
from common import *
import t_overview as o, json, re
apps=[dict(a) for a in o.ex['pay_apps']]
apps[1]['pdf_read']={'file':'App 2.pdf','read_at':'2026-11-23T20:00:00Z','g702':{'retainageTotal':999},'lines':{o.L1:{'E':100000,'G':300000}}}
ex=dict(o.ex); ex['issued_form_links']=[]; ex['pay_apps']=lambda r: apps; patched=[]
def patch(r): row=json.loads(r.post_data); patched.append(row); apps[1].update(row); return []
ex['PATCH:pay_apps']=patch
with sync_playwright() as p:
    b=p.chromium.launch(channel='chrome'); ctx=b.new_context(viewport={'width':1600,'height':950}); install(ctx,ex); signed_in(ctx)
    ctx.route(re.compile(r'https://stand-in\.supabase\.co/functions/v1/files.*'), lambda route: route.fulfill(status=200,content_type='application/json',body=json.dumps({'url':'https://r2.stand-in.test/put','key':PROJ+'/11 Pay Applications/Application 2/a.pdf'})))
    ctx.route(re.compile(r'https://r2\.stand-in\.test/.*'), lambda route: route.fulfill(status=200,body=''))
    pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(BASE); pg.wait_for_selector('text=Stand-in Office'); pg.click('td.p-name'); pg.wait_for_selector('.overview'); pg.goto(BASE+'#/pay'); pg.wait_for_timeout(1500)
    pg.locator('.tabs button').filter(has_text=re.compile('2')).first.click(); pg.wait_for_selector('.pay-against')
    print('card:',pg.inner_text('.pay-against').replace('\n',' | ')[:300])
    pg.set_input_files('.pay-against input[type=file]','g703.pdf'); pg.wait_for_timeout(4000); print('notice:',[t[:200] for t in pg.locator('.notice.error').all_inner_texts()],errs); pg.wait_for_selector('.sheet-viewer.docked',timeout=30000); pg.wait_for_timeout(1500)
    print('kept path:',bool(apps[1]['pdf_read'].get('path')),'| docked:',pg.evaluate("(()=>{const v=document.querySelector('.sheet-viewer.docked').getBoundingClientRect(),c=document.querySelector('.content').getBoundingClientRect();return {viewerLeft:Math.round(v.left),viewerWidth:Math.round(v.width),contentRight:Math.round(c.right)}})()"))
    print('button now:',pg.inner_text('.pay-against-tools button.primary-lite'))
    pg.locator('.pay-703').scroll_into_view_if_needed(); pg.screenshot(path='beside.png')
    pg.click('.pay-against-tools button.primary-lite'); pg.wait_for_timeout(400)
    print('closed:',pg.locator('.sheet-viewer.docked').count()==0,'| margin cleared:',not pg.evaluate("document.documentElement.classList.contains('pdf-docked')"),'| errors:',errs); b.close()
