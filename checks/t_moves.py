"""Linking money moved between lines on an application: right-click a changed value, click the line it went to, the note on both, undo."""
from common import *
import t_overview as o, json, re
apps=[dict(a) for a in o.ex['pay_apps']]
apps[1]['status']='draft'
sv={l['id']:float(l['scheduled_value']) for l in (o.ex['sov_lines'](None) if callable(o.ex['sov_lines']) else o.ex['sov_lines'])}
apps[1]['pdf_read']={'file':'App 2.pdf','read_at':'2026-11-23T20:00:00Z','g702':{},'lines':{o.L1:{'C':sv[o.L1]-75000},o.L2:{'C':sv[o.L2]+(50000 if 'part' in __import__('sys').argv else 75000)}}}
apps[1]['moves']=[]
ex=dict(o.ex); ex['issued_form_links']=[]; ex['pay_apps']=lambda r: apps; patched=[]
def patch(r): row=json.loads(r.post_data); patched.append(row); apps[1].update(row); return []
ex['PATCH:pay_apps']=patch
with sync_playwright() as p:
    b=p.chromium.launch(channel='chrome'); ctx=b.new_context(viewport={'width':1500,'height':950}); install(ctx,ex); signed_in(ctx)
    pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(BASE); pg.wait_for_selector('text=Stand-in Office'); pg.click('td.p-name'); pg.wait_for_selector('.overview'); pg.goto(BASE+'#/pay'); pg.wait_for_timeout(1500)
    pg.locator('.tabs button').filter(has_text=re.compile('2')).first.click(); pg.wait_for_selector('.pay-703')
    cells=pg.locator('.pay-703 td.pay-pdf-diff'); cells.nth(0).click(button='right'); pg.wait_for_timeout(300)
    print('menu:',pg.inner_text('.pay-line-menu').replace('\n',' | '))
    pg.locator('.pay-line-menu button').filter(has_text='moved to').click(); pg.wait_for_timeout(300)
    print('banner:',pg.inner_text('.pay-moving'))
    pg.locator('.pay-703 tbody tr').filter(has=pg.locator('td.pay-pdf-diff')).nth(1).locator('td.pay-703-name').click(); pg.wait_for_timeout(1000)
    print('saved:',patched)
    print('cell classes:',[c.split() for c in pg.eval_on_selector_all('.pay-703 td.pay-sv-linked, .pay-703 td.pay-sv-settled','els=>els.map(e=>e.className)')])
    print('list:',pg.inner_text('.pay-moves').replace('\n',' | '),'| notes:',pg.locator('.pay-sv-move').all_inner_texts())
    pg.locator('.pay-703').screenshot(path=('moves_part.png' if 'part' in __import__('sys').argv else 'moves.png'))
    pg.locator('.pay-sv-move button').first.click(); pg.wait_for_timeout(800)
    print('after undo:',patched[-1],'| errors:',errs); b.close()
