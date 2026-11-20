"""Placing an observation from a sheet: the tag being placed wears the kind chosen; layers switch off; lists show the mark."""
from common import *
import t_fix, copy, json, re
T1='77777777-7777-4777-8777-777777777771'; state={'obs':[]}
def post(r):
    row=json.loads(r.post_data); row=row[0] if isinstance(row,list) else row; row=dict(row,number=len(state['obs'])+1,created_at='2026-11-20T22:00:00Z',updated_at='2026-11-20T22:00:00Z',photos=row.get('photos') or []); state['obs'].append(row); return row
ex=copy.deepcopy(t_fix.extra); ex.update({'observations':lambda r: state['obs'],'POST:observations':post,'observation_types':[{'id':T1,'firm_id':FIRM,'code':'P','name':'Punch','position':0,'is_punch':True}],'observation_tags':[],'sheet_markups':[]})
pdf=open('sheet.pdf','rb').read()
with sync_playwright() as p:
    b=p.chromium.launch(channel='chrome'); ctx=b.new_context(viewport={'width':1500,'height':900}); install(ctx,ex); signed_in(ctx)
    ctx.route(re.compile(r'.*/functions/v1/files.*'), lambda r: r.fulfill(status=200,content_type='application/json',body=json.dumps({'url':'https://stand-in.supabase.co/blob/sheet.pdf','configured':True})))
    ctx.route(re.compile(r'.*/blob/sheet\.pdf'), lambda r: r.fulfill(status=200,content_type='application/pdf',body=pdf))
    pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(BASE); pg.wait_for_selector('text=Stand-in Office'); pg.click('td.p-name'); pg.wait_for_timeout(400); pg.goto(BASE+'#/documents'); pg.wait_for_selector('tr.opens'); pg.click('tr.opens >> nth=0'); pg.wait_for_selector('.sv-page canvas'); pg.wait_for_timeout(1500)
    pg.click('button:has-text("Observe")'); pg.wait_for_selector('.obs-pin-catcher'); bx=pg.locator('.sv-page').bounding_box(); pg.mouse.click(bx['x']+bx['width']*0.4,bx['y']+bx['height']*0.4); pg.wait_for_selector('.obs-placing')
    mk=lambda: pg.evaluate("(()=>{const p=document.querySelector('.obs-placing');return p.querySelector('.spot-pin-dot')?'plain dot':'mark '+p.textContent})()")
    print('placed with no kind chosen:',mk())
    pg.click('.obs-tag-open'); pg.click('.obs-tag-trades .chip:has-text("Drywall")'); pg.wait_for_timeout(150); pg.locator('.obs-tag-issues .chip').first.click(); pg.wait_for_timeout(300)
    print('kind chosen on the form -> the tag on the sheet:',mk()); pg.screenshot(path='placemark.png')
    pg.locator('.obs-types .chip').first.click(); pg.click('button:has-text("Keep it")'); pg.wait_for_selector('.obs-dot',timeout=8000); pg.wait_for_timeout(400)
    print('kept -> on the sheet:',pg.evaluate("[...document.querySelectorAll('.obs-dot')].map(d=>d.querySelector('.obs-dot-mark').textContent)"))
    pg.click('button[aria-label="More tools"]'); pg.wait_for_selector('.sv-layers'); print('layers:',pg.locator('.sv-layers label').all_inner_texts())
    pg.locator('.sv-layers input').first.uncheck(); pg.wait_for_timeout(300); print('observations off -> tags on the sheet:',pg.locator('.obs-dot').count())
    pg.locator('.sv-layers input').first.check(); pg.wait_for_timeout(600); print('back on ->',pg.locator('.obs-dot').count(),'| remembered:',pg.evaluate("localStorage.getItem('cazen.pref.sheetLayers')"))
    pg.goto(BASE+'#/field-notes/observations'); pg.wait_for_selector('.obs-row'); print('observations list row:',pg.evaluate("(()=>{const r=document.querySelector('.obs-row');return (r.querySelector('.obs-row-mark')?.textContent||'no mark')+' | '+r.querySelector('.obs-title').textContent})()"))
    pg.click('button[role=tab]:has-text("Punch list")'); pg.wait_for_timeout(400); print('punch list rows with a mark:',pg.locator('.obs-row .obs-row-mark').count(),'of',pg.locator('.obs-row').count(),'| errors:',errs); b.close()
