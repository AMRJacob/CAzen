"""Schedule changes on an application: the lines whose value changed against the previous one, linking where
the money went (amount defaulting to the whole change, changeable), green once it's all accounted for, undo;
the Summary's button taking scheduled values from the PDFs; blank scheduled cells on an application with no PDF."""
from common import *
import t_overview as o, json, re, sys
apps=[dict(a) for a in o.ex['pay_apps']]
sv={l['id']:float(l['scheduled_value']) for l in (o.ex['sov_lines'](None) if callable(o.ex['sov_lines']) else o.ex['sov_lines'])}
apps[1]['pdf_read']={'file':'App 2.pdf','read_at':'2026-11-23T20:00:00Z','g702':{},'lines':{o.L1:{'C':sv[o.L1]-75000},o.L2:{'C':sv[o.L2]+75000}}}
apps[1]['moves']=[]; apps[0]['pdf_read']=None
ex=dict(o.ex); ex['issued_form_links']=[]; ex['pay_apps']=lambda r: apps; patched=[]; posted=[]
def patch(r): row=json.loads(r.post_data); patched.append(row); apps[1].update(row); return []
ex['PATCH:pay_apps']=patch
ex['POST:pay_app_lines']=lambda r: (posted.append(json.loads(r.post_data)), [])[1]
with sync_playwright() as p:
    b=p.chromium.launch(channel='chrome'); ctx=b.new_context(viewport={'width':1500,'height':950}); install(ctx,ex); signed_in(ctx)
    pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(BASE); pg.wait_for_selector('text=Stand-in Office'); pg.click('td.p-name'); pg.wait_for_selector('.overview'); pg.goto(BASE+'#/pay'); pg.wait_for_timeout(1500)
    print('summary notice:',pg.locator('.pay-checks .notice').inner_text().replace('\n',' ')[:220])
    pg.click('text=Take the scheduled values from the PDFs'); pg.wait_for_timeout(800)
    print('taken:',posted[-1] if posted else None); posted.clear()
    pg.locator('.tabs button').filter(has_text=re.compile('1')).first.click(); pg.wait_for_selector('.pay-703'); pg.wait_for_timeout(400)
    print('app 1 (no PDF) blank cells:',pg.locator('.pay-703 td.pay-sv-blank').count(),'placeholder:',pg.locator('.pay-703 td.pay-sv-blank input').first.get_attribute('placeholder'))
    pg.locator('.pay-703 td.pay-sv-blank input').first.fill('390000'); pg.keyboard.press('Enter'); pg.wait_for_timeout(600)
    print('typed on app 1:',posted[-1] if posted else None)
    pg.locator('.tabs button').filter(has_text=re.compile('2')).first.click(); pg.wait_for_selector('.pay-changes')
    print('changes:',pg.inner_text('.pay-changes').replace('\n',' | ')[:400])
    pg.locator('.pay-changes tbody tr').nth(0).locator('button:has-text("Moved to")').click(); pg.wait_for_timeout(200)
    print('amount:',pg.input_value('.pay-changes .pay-moving-amount'))
    if 'part' in sys.argv: pg.keyboard.press('Control+A'); pg.keyboard.type('30000')
    pg.locator('.pay-changes tbody tr').nth(1).locator('button:has-text("Moved here")').click(); pg.wait_for_timeout(800)
    print('saved:',patched[-1])
    print('rows:',pg.eval_on_selector_all('.pay-changes tbody tr','els=>els.map(e=>e.className+" :: "+e.innerText.replace(/\\s+/g," "))'))
    print('foot:',pg.inner_text('.pay-changes tfoot').replace('\n',' '))
    pg.locator('.pay-changes').screenshot(path='changes.png')
    pg.locator('.pay-change-move button').first.click(); pg.wait_for_timeout(600)
    print('after undo:',patched[-1],'| errors:',errs); b.close()
