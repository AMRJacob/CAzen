"""One line spread over every line that went the other way: a lump broken out into trades."""
from common import *
import t_overview as o, json, re
L3='99999999-9999-4999-8999-99999999b003'
base=o.ex['sov_lines'](None) if callable(o.ex['sov_lines']) else o.ex['sov_lines']
lines=[dict(l) for l in base]+[dict(base[1],id=L3,sort=3,code='3',description='Roofing',scheduled_value=0)]
sv={l['id']:float(l['scheduled_value']) for l in lines}
apps=[dict(a) for a in o.ex['pay_apps']]
apps[1]['pdf_read']={'file':'App 2.pdf','read_at':'2026-11-23T20:00:00Z','g702':{},'lines':{o.L1:{'C':sv[o.L1]-75000},o.L2:{'C':sv[o.L2]+50000},L3:{'C':25000}}}
apps[1]['moves']=[]
ex=dict(o.ex); ex['issued_form_links']=[]; ex['sov_lines']=lines; ex['pay_apps']=lambda r: apps; patched=[]
def patch(r): row=json.loads(r.post_data); patched.append(row); apps[1].update(row); return []
ex['PATCH:pay_apps']=patch
with sync_playwright() as p:
    b=p.chromium.launch(channel='chrome'); ctx=b.new_context(viewport={'width':1500,'height':950}); install(ctx,ex); signed_in(ctx)
    pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(BASE); pg.wait_for_selector('text=Stand-in Office'); pg.click('td.p-name'); pg.wait_for_selector('.overview'); pg.goto(BASE+'#/pay'); pg.wait_for_timeout(1500)
    pg.locator('.tabs button').filter(has_text=re.compile('2')).first.click(); pg.wait_for_selector('.pay-changes')
    pg.locator('.pay-changes tbody tr').filter(has_text='Sitework').locator('button:has-text("Moved to")').click(); pg.wait_for_timeout(200)
    print('offer:',pg.locator('.pay-changes button:has-text("every line")').inner_text())
    pg.click('.pay-changes button:has-text("every line")'); pg.wait_for_timeout(800)
    print('saved:',[(m['to'][-4:],m['amount']) for m in patched[-1]['moves']])
    print('rows:',pg.eval_on_selector_all('.pay-changes tbody tr','els=>els.map(e=>e.className)'),'| foot:',pg.inner_text('.pay-changes tfoot').replace('\n',' '),'| errors:',errs); b.close()
