"""This period's figures are read from the contractor's G703 PDF, shown for review, and kept."""
from common import *
import t_overview as o, json, re, copy
ex=dict(o.ex); ex['issued_form_links']=[]; ex['pay_app_lines']=[x for x in o.ex['pay_app_lines'] if x['pay_app_id']==o.A1]; sent=[]
def post(r):
    row=json.loads(r.post_data); sent.append(row); return row
ex['POST:pay_app_lines']=post
with sync_playwright() as p:
    b=p.chromium.launch(channel='chrome'); ctx=b.new_context(viewport={'width':1440,'height':900}); install(ctx,ex); signed_in(ctx)
    pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(BASE); pg.wait_for_selector('text=Stand-in Office'); pg.click('td.p-name'); pg.wait_for_selector('.overview'); pg.goto(BASE+'#/pay'); pg.wait_for_timeout(1500)
    pg.locator('.tabs button').filter(has_text=re.compile('2')).first.click(); pg.wait_for_timeout(600)
    pg.set_input_files('.pay-read-drop input[type=file]','g703.pdf'); pg.wait_for_selector('.pay-read-card',timeout=60000)
    print('says:',pg.inner_text('.pay-read-card p')[:160])
    print('rows:',[[c for c in r.split('\t')][:3]+[i.input_value() for i in pg.locator('.pay-read-table tbody tr').nth(n).locator('input').all()] for n,r in enumerate(pg.locator('.pay-read-table tbody tr').all_inner_texts())])
    pg.screenshot(path='payread.png'); pg.click('.pay-read-card button.primary'); pg.wait_for_timeout(900)
    print('kept:',[(s['sov_line_id'][-4:],s['this_period'],s['stored']) for s in sent],'| dialog closed:',pg.locator('.pay-read-card').count()==0,'| errors:',errs); b.close()
