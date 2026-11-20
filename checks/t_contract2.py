"""A project with a contract can be given another, named, from the pay applications page."""
from common import *
import t_overview as o, json
ex=dict(o.ex); ex['issued_form_links']=[]; sent=[]
def post(r):
    row=json.loads(r.post_data); sent.append(row); return dict(row,id='99999999-9999-4999-8999-999999999902')
ex['POST:pay_contracts']=post
with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={'width':1440,'height':900}); install(ctx,ex); signed_in(ctx)
    pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(BASE); pg.wait_for_selector('text=Stand-in Office'); pg.click('td.p-name'); pg.wait_for_selector('.overview'); pg.goto(BASE+'#/pay'); pg.wait_for_timeout(1500)
    pg.click('button:has-text("Add another contract")'); pg.wait_for_selector('.contract-setup')
    print('heading:',pg.inner_text('.contract-setup h3'),'| add disabled without a name:',pg.locator('.contract-setup button.primary').is_disabled())
    ins=pg.locator('.contract-setup input'); ins.nth(0).fill('Sitework package'); ins.nth(1).fill('Dirt Co'); ins.nth(2).fill('250000')
    pg.click('.contract-setup button.primary'); pg.wait_for_timeout(900)
    print('sent:',[{k:v for k,v in s.items() if k in('name','contractor','original_sum','project_id')} for s in sent])
    print('contract buttons:',pg.locator('.pay-contracts button').all_inner_texts(),'| errors:',errs); b.close()
