"""A line that is really a heading: marked while pasting a schedule of values, while adding lines from a PDF, or later on the sheet."""
from common import *
import t_overview as o, json, re
patched=[]
ex=dict(o.ex); ex['issued_form_links']=[]
ex['PATCH:sov_lines']=lambda r:(patched.append((r.url.split('id=eq.')[-1][-4:], json.loads(r.post_data))) or [])
with sync_playwright() as p:
    b=p.chromium.launch(channel='chrome'); ctx=b.new_context(viewport={'width':1440,'height':900}); install(ctx,ex); signed_in(ctx)
    pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(BASE); pg.wait_for_selector('text=Stand-in Office'); pg.click('td.p-name'); pg.wait_for_selector('.overview'); pg.goto(BASE+'#/pay'); pg.wait_for_timeout(1500)
    pg.locator('.tabs button').filter(has_text=re.compile('2')).first.click(); pg.wait_for_timeout(600)
    pg.locator('.pay-703-name', has_text='Building').click(button='right'); pg.wait_for_selector('.pay-line-menu')
    print('sheet menu:',pg.inner_text('.pay-line-menu').replace('\n',' | '))
    pg.click('.pay-line-menu button'); pg.wait_for_timeout(600); print('saved:',patched)
    patched.clear(); pg.click('button:has-text("Select lines")')
    items=pg.locator('.pay-703 tbody td.pay-703-item'); items.nth(0).click(); items.nth(1).click(modifiers=['Shift'])
    print('selected:',pg.inner_text('.pay-pick-tools strong'))
    pg.click('button:has-text("Mark as change order lines")'); pg.wait_for_timeout(800); print('bulk saved:',patched)
    b.close()

# Pasting a schedule: a row that reads like a line is ticked as a heading.
ex2=dict(o.ex); ex2['pay_contracts']=[]
with sync_playwright() as p:
    b=p.chromium.launch(channel='chrome'); ctx=b.new_context(viewport={'width':1440,'height':900}); install(ctx,ex2); signed_in(ctx)
    pg=ctx.new_page(); errs2=[]; pg.on('pageerror',lambda e:errs2.append(str(e)))
    pg.goto(BASE); pg.wait_for_selector('text=Stand-in Office'); pg.click('td.p-name'); pg.wait_for_selector('.overview'); pg.goto(BASE+'#/pay'); pg.wait_for_timeout(1500)
    pg.fill('.sov-paste textarea, textarea.mono-ish', '1\tSitework\t400,000.00\n2\tBuilding Package\t0.00\n3\tFraming\t600,000.00')
    pg.wait_for_timeout(300); print('before:',pg.inner_text('.sov-preview').replace('\n',' | ')[:200]); print(' ',pg.locator('p.small', has_text='Read').first.inner_text())
    pg.locator('.sov-preview input[type=checkbox]').nth(1).check(); pg.wait_for_timeout(200)
    print('after ticking row 2:',pg.locator('p.small', has_text='Read').first.inner_text(),'| heading rows:',pg.locator('.sov-preview tr.sov-heading').count(),'| errors:',errs+errs2); b.close()
