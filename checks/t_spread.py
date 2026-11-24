"""Schedule changes in the cells: the change from the previous application, linking where it went by
right-click then clicking the other line (or every line that went the other way), the summary line, undo."""
from common import *
import t_overview as o, json, re, sys
L3='99999999-9999-4999-8999-99999999b003'
base=o.ex['sov_lines'](None) if callable(o.ex['sov_lines']) else o.ex['sov_lines']
lines=[dict(l) for l in base]+[dict(base[1],id=L3,sort=3,code='3',item_no='3',description='Roofing',scheduled_value=0)]
lines[0]['item_no']='1'; lines[1]['item_no']='2'
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
    pg.locator('.tabs button').filter(has_text=re.compile('2')).first.click(); pg.wait_for_selector('.pay-703')
    print('card gone:',pg.locator('.pay-changes').count()==0,'| summary:',pg.inner_text('.pay-sv-summary'))
    cell=lambda name: pg.locator('.pay-703 tbody tr').filter(has_text=name).locator('td[data-label="Scheduled value"]')
    print('cell 1:',cell('Sitework').inner_text().replace('\n',' | '))
    cell('Sitework').click(button='right'); pg.wait_for_timeout(200); pg.locator('.pay-line-menu button').filter(has_text='Moved to').click(); pg.wait_for_timeout(200)
    print('bar:',pg.inner_text('.pay-moving').replace('\n',' '),'| amount:',pg.input_value('.pay-moving-amount'))
    if 'one' in sys.argv:
        pg.keyboard.press('Control+A'); pg.keyboard.type('50000'); pg.locator('.pay-703 tbody tr').filter(has_text='Building').locator('td.pay-703-name').click()
    else: pg.click('.pay-moving button:has-text("Every line")')
    pg.wait_for_timeout(800)
    print('saved:',[(m['to'][-4:],m['amount']) for m in patched[-1]['moves']])
    print('cells:',[cell(n).inner_text().replace('\n',' | ')+' :: '+cell(n).get_attribute('class') for n in ('Sitework','Building','Roofing')])
    print('summary:',pg.inner_text('.pay-sv-summary'))
    pg.locator('.pay-703').screenshot(path='inline.png')
    cell('Sitework').click(button='right'); pg.wait_for_timeout(200); pg.locator('.pay-line-menu button').filter(has_text='Undo').first.click(); pg.wait_for_timeout(600)
    print('after undo:',[(m['to'][-4:],m['amount']) for m in patched[-1]['moves']],'| errors:',errs); b.close()
