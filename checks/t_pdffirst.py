"""Cover sheet shows the PDF's figures with CAzen's as the check."""
from common import *
import t_overview as o, json, re
apps=[dict(a) for a in o.ex['pay_apps']]
apps[1]['pdf_read']={'file':'App 2.pdf','read_at':'2026-11-23T20:00:00Z','g702':{'originalSum':1000000,'changeOrders':0,'contractSum':1000000,'due':123456},'lines':{}}
ex=dict(o.ex); ex['issued_form_links']=[]; ex['pay_apps']=lambda r: apps
with sync_playwright() as p:
    b=p.chromium.launch(channel='chrome'); ctx=b.new_context(viewport={'width':1500,'height':950}); install(ctx,ex); signed_in(ctx)
    pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(BASE); pg.wait_for_selector('text=Stand-in Office'); pg.click('td.p-name'); pg.wait_for_selector('.overview'); pg.goto(BASE+'#/pay'); pg.wait_for_timeout(1500)
    pg.locator('.tabs button').filter(has_text=re.compile('2')).first.click(); pg.wait_for_selector('.g702')
    print('marked:',pg.eval_on_selector_all('.g702 .as-pdf.off','els=>els.map(e=>e.innerText.replace(/\\n/g," / ")+" :: "+e.title)'))
    print('agreeing:',pg.locator('.g702 .as-pdf:not(.off)').count(),'| errors:',errs)
    pg.locator('.g702').screenshot(path='pdffirst.png'); b.close()
