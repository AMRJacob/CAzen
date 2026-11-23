"""Dollar figures typed anywhere get the dollar sign, commas and cents; what is saved is the number."""
from common import *
import t_overview as o, json, re
ex=dict(o.ex); ex['issued_form_links']=[]; sent=[]
ex['POST:pay_app_lines']=lambda r:(sent.append(json.loads(r.post_data)) or [])
with sync_playwright() as p:
    b=p.chromium.launch(channel='chrome'); ctx=b.new_context(viewport={'width':1440,'height':900}); install(ctx,ex); signed_in(ctx)
    pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(BASE); pg.wait_for_selector('text=Stand-in Office'); pg.click('td.p-name'); pg.wait_for_selector('.overview'); pg.goto(BASE+'#/pay'); pg.wait_for_timeout(1500)
    pg.locator('.tabs button').filter(has_text=re.compile('2')).first.click(); pg.wait_for_timeout(600)
    box=pg.locator('input[aria-label="This period for Sitework"]')
    print('as loaded:',box.input_value())
    box.click(); pg.keyboard.press('Control+a'); pg.keyboard.press('Backspace')
    seen=[]
    for ch in '1234567.8': pg.keyboard.type(ch); seen.append(box.input_value())
    print('while typing:',seen)
    pg.keyboard.press('Home'); [pg.keyboard.press('ArrowRight') for _ in range(2)]; pg.keyboard.type('9')
    print('a 9 typed after the first digit:',box.input_value(),'| caret at',pg.evaluate("document.activeElement.selectionStart"))
    pg.keyboard.press('Tab'); pg.wait_for_timeout(700)
    print('left:',box.input_value(),'| saved:',[(s['this_period']) for s in sent if s['sov_line_id']==o.L1][-1:])
    pg.goto(BASE+'#/ca-logs'); pg.wait_for_timeout(1200)
    pr=pg.locator('input[aria-label^="Price for"]')
    if pr.count():
        pr.first.click(); pg.keyboard.press('Control+a'); pg.keyboard.type('(2500'); print('PR price typed:',pr.first.input_value()); pg.keyboard.press('Tab'); pg.wait_for_timeout(500); print('PR price left:',pr.first.input_value())
    print('errors:',errs); b.close()
