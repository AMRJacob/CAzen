"""Scheduled value on one application: the PDF's difference under the value, taking it, and what
the database is asked to keep (on this application only, not the schedule of values)."""
from common import *
import t_overview as o, json, re
apps=[dict(a) for a in o.ex['pay_apps']]
apps[1]['status']='draft'
apps[1]['pdf_read']={'file':'App 2.pdf','read_at':'2026-11-23T20:00:00Z','g702':{},'lines':{o.L1:{'C':325000}}}
ex=dict(o.ex); ex['issued_form_links']=[]; ex['pay_apps']=lambda r: apps; posted=[]; sov=[]
def up(r): posted.append(json.loads(r.post_data)); return []
ex['POST:pay_app_lines']=up
ex['PATCH:sov_lines']=lambda r: (sov.append(json.loads(r.post_data)), [])[1]
with sync_playwright() as p:
    b=p.chromium.launch(channel='chrome'); ctx=b.new_context(viewport={'width':1500,'height':950}); install(ctx,ex); signed_in(ctx)
    pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(BASE); pg.wait_for_selector('text=Stand-in Office'); pg.click('td.p-name'); pg.wait_for_selector('.overview'); pg.goto(BASE+'#/pay'); pg.wait_for_timeout(1500)
    pg.locator('.tabs button').filter(has_text=re.compile('2')).first.click(); pg.wait_for_selector('.pay-703')
    cell=pg.locator('.pay-703 td.pay-pdf-diff').first
    print('cell:',cell.inner_text().replace('\n',' | '),'| title:',cell.get_attribute('title').replace('\n',' / '))
    print('against table scheduled row:',pg.locator('.pay-why-scheduled').inner_text().replace('\n',' | ')[:200])
    cell.locator('button').click(); pg.wait_for_timeout(800)
    print('posted:',posted,'| schedule of values patched:',sov)
    cell=pg.locator('.pay-703 td.pay-pdf-diff').first; cell.click(button='right'); pg.wait_for_timeout(300)
    print('menu:',pg.inner_text('.pay-line-menu').replace('\n',' | '))
    pg.locator('.pay-line-menu button').filter(has_text='Enter a value').click(); pg.wait_for_timeout(300)
    inp=pg.locator('.pay-703 td input[aria-label^="Scheduled value"]'); inp.fill('310000'); inp.press('Enter'); pg.wait_for_timeout(800)
    print('typed posted:',posted[-1],'| errors:',errs)
    pg.locator('.pay-703').screenshot(path='scheduled.png'); b.close()
