"""Summary's scheduled-values notice: Take sends each application's PDF values; Ignore hides it and stays hidden after a reload."""
from common import *
import t_overview as o, json, re
apps=[dict(a) for a in o.ex['pay_apps']]
apps[1]['pdf_read']={'file':'App 2.pdf','read_at':'2026-11-23T20:00:00Z','g702':{},'lines':{o.L1:{'C':325000},o.L2:{'C':675000}},'total':{'C':1000000}}
ex=dict(o.ex); ex['issued_form_links']=[]; ex['pay_apps']=lambda r: apps; posted=[]
ex['POST:pay_app_lines']=lambda r:(posted.append(json.loads(r.post_data)),[])[1]
with sync_playwright() as p:
    b=p.chromium.launch(channel='chrome'); ctx=b.new_context(viewport={'width':1500,'height':950}); install(ctx,ex); signed_in(ctx)
    pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(BASE); pg.wait_for_selector('text=Stand-in Office'); pg.click('td.p-name'); pg.wait_for_selector('.overview'); pg.goto(BASE+'#/pay'); pg.wait_for_timeout(1500)
    n=pg.locator('.notice:has-text("scheduled values that aren")')
    print('notice:',n.count())
    n.locator('button:has-text("Take")').click(); pg.wait_for_timeout(800); print('taken:',posted)
    n.locator('button:has-text("Ignore")').click(); pg.wait_for_timeout(300); print('after ignore:',n.count())
    pg.reload(); pg.wait_for_timeout(2000); print('after reload:',pg.locator('.notice:has-text("scheduled values that aren")').count(),'| errors:',errs); b.close()
