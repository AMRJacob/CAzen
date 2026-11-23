"""A change order's lines on the G703 sit under one heading row carrying its total and its approval date; setting the date there sets it on every line. No per-line approval note."""
from common import *
import t_overview as o, json, re
CO='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee4'
L3='99999999-9999-4999-8999-99999999b003'; L4='99999999-9999-4999-8999-99999999b004'
patched=[]
ex=dict(o.ex); ex['issued_form_links']=[]
ex['sov_lines']=o.ex['sov_lines']+[
  {'id':L3,'contract_id':o.C,'sort':3,'code':'3','description':'CO-001 Fence','scheduled_value':5000,'retainage_rate':None,'change_order_id':CO,'approved_on':'2026-10-20','is_title':False},
  {'id':L4,'contract_id':o.C,'sort':4,'code':'4','description':'CO-001 Gate','scheduled_value':3400,'retainage_rate':None,'change_order_id':CO,'approved_on':None,'is_title':False}]
ex['PATCH:sov_lines']=lambda r:(patched.append((r.url.split('id=eq.')[-1][-4:], json.loads(r.post_data))) or [])
with sync_playwright() as p:
    b=p.chromium.launch(channel='chrome'); ctx=b.new_context(viewport={'width':1440,'height':900}); install(ctx,ex); signed_in(ctx)
    pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(BASE); pg.wait_for_selector('text=Stand-in Office'); pg.click('td.p-name'); pg.wait_for_selector('.overview'); pg.goto(BASE+'#/pay'); pg.wait_for_timeout(1500)
    pg.locator('.tabs button').filter(has_text=re.compile('2')).first.click(); pg.wait_for_timeout(800)
    print('rows:'); [print('  ',t) for t in pg.evaluate("[...document.querySelectorAll('.pay-703 tbody tr')].map(r=>(r.className||'line')+': '+r.innerText.replace(/\\s+/g,' ').trim().slice(0,110))")]
    print('per-line approval notes:',pg.locator('.pay-703 .pay-co-when').count(),'| heading date:',repr(pg.input_value('.pay-703-cohead .pay-co-date')))
    pg.fill('.pay-703-cohead .pay-co-date','2026-11-02'); pg.keyboard.press('Enter'); pg.wait_for_timeout(1000)
    print('set on the heading →',patched)
    pg.locator('.pay-703-cohead').screenshot(path='cohead.png')
    print('errors:',errs); b.close()
