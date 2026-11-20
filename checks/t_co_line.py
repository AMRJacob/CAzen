"""A change order in the register is offered as a schedule-of-values line, with its figure, and tied to it."""
from common import *
import t_overview as o, json, re
ex=dict(o.ex); ex['issued_form_links']=[]; sent=[]
def post(r):
    row=json.loads(r.post_data); sent.append(row); return row
ex['POST:sov_lines']=post
with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={'width':1440,'height':900}); install(ctx,ex); signed_in(ctx)
    pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(BASE); pg.wait_for_selector('text=Stand-in Office'); pg.click('td.p-name'); pg.wait_for_selector('.overview'); pg.goto(BASE+'#/pay'); pg.wait_for_timeout(1500)
    tabs=pg.locator('.tabs button').all_inner_texts(); print('tabs',tabs[:6])
    pg.locator('.tabs button').filter(has_text=re.compile('2')).first.click(); pg.wait_for_timeout(800)
    print('offered:',pg.locator('.pay-from-chip').all_inner_texts())
    pg.click('.pay-from-chip'); pg.wait_for_timeout(300)
    print('filled:',[i.input_value() for i in pg.locator('.pay-add-fields input').all()])
    pg.screenshot(path='co_line.png')
    pg.click('button:has-text("Add to the schedule")'); pg.wait_for_timeout(600)
    print('sent:',sent,'| errors:',errs)
    b.close()
