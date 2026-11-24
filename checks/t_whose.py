"""Whose each difference is: a cover-sheet figure the PDF's own figures contradict (a misread or a typo),
two applications with the same period end, and the buttons that read the PDF's period and use it."""
from common import *
import t_overview as o, json, re
apps=[dict(a) for a in o.ex['pay_apps']]
apps[1]['period_to']=apps[0]['period_to']
apps[1]['pdf_read']={'file':'App 2.pdf','read_at':'2026-11-23T20:00:00Z','periodTo':'2026-07-31','appliedOn':'2026-07-25',
  'g702':{'originalSum':8,'changeOrders':0,'contractSum':1000000},'lines':{}}
ex=dict(o.ex); ex['issued_form_links']=[]; ex['pay_apps']=lambda r: apps; patched=[]
def patch(r): row=json.loads(r.post_data); patched.append(row); apps[1].update(row); return []
ex['PATCH:pay_apps']=patch
with sync_playwright() as p:
    b=p.chromium.launch(channel='chrome'); ctx=b.new_context(viewport={'width':1500,'height':950}); install(ctx,ex); signed_in(ctx)
    pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(BASE); pg.wait_for_selector('text=Stand-in Office'); pg.click('td.p-name'); pg.wait_for_selector('.overview'); pg.goto(BASE+'#/pay'); pg.wait_for_timeout(1500)
    pg.locator('.tabs button').filter(has_text=re.compile('2')).first.click(); pg.wait_for_selector('.pay-against')
    print('verdict:',pg.inner_text('.pay-verdict'))
    for t in pg.locator('.pay-why').all_inner_texts(): print('  ',t.replace('\n',' | ')[:260])
    pg.locator('.pay-against').screenshot(path='whose.png')
    pg.click('text=Use the PDF’s period and date'); pg.wait_for_timeout(800)
    print('patched:',patched,'| errors:',errs); b.close()
