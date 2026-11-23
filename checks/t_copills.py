"""Contracts: a pill per change order, opening to its lines and its proposal requests; a PR can be linked from the pill and opens from it."""
from common import *
import t_overview as o, json
CO='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee4'
L3='99999999-9999-4999-8999-99999999b003'; L4='99999999-9999-4999-8999-99999999b004'; L5='99999999-9999-4999-8999-99999999b005'
posts=[]
ex=dict(o.ex); ex['issued_form_links']=[]; ex['contract_documents']=[]
ex['sov_lines']=o.ex['sov_lines']+[
  {'id':L3,'contract_id':o.C,'sort':3,'code':'3','description':'CO-001 Fence','scheduled_value':5000,'retainage_rate':None,'change_order_id':CO,'approved_on':'2026-10-20','is_title':False},
  {'id':L4,'contract_id':o.C,'sort':4,'code':'4','description':'CO-001 Gate','scheduled_value':3400,'retainage_rate':None,'change_order_id':CO,'approved_on':'2026-10-20','is_title':False},
  {'id':L5,'contract_id':o.C,'sort':5,'code':'5','description':'Owner added outlet','scheduled_value':900,'retainage_rate':None,'change_order_id':None,'is_change_order':True,'approved_on':None,'is_title':False}]
ex['POST:issued_form_links']=lambda r:(posts.append(json.loads(r.post_data)) or [])
with sync_playwright() as p:
    b=p.chromium.launch(channel='chrome'); ctx=b.new_context(viewport={'width':1440,'height':900}); install(ctx,ex); signed_in(ctx)
    pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(BASE); pg.wait_for_selector('text=Stand-in Office'); pg.click('td.p-name'); pg.wait_for_selector('.overview'); pg.goto(BASE+'#/contracts'); pg.wait_for_selector('.co-pill',timeout=15000)
    print('pills:'); [print('  ',t) for t in pg.evaluate("[...document.querySelectorAll('.co-pill-head')].map(h=>h.innerText.replace(/\\s+/g,' '))")]
    pg.locator('.co-pill-head').first.click(); pg.wait_for_timeout(300)
    print('opened:',pg.inner_text('.co-pill.open .co-pill-body').replace('\n',' | '))
    pg.select_option('.co-pill.open select', index=1); pg.wait_for_timeout(800); print('linked:',posts)
    pg.locator('.co-pill').first.screenshot(path='copill.png')
    print('errors:',errs); b.close()
