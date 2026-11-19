import sys
from common import *
extra={'pay_contracts':[],'sov_lines':[],'schedule_activities':[],'schedule_activity_lines':[],'schedule_versions':[]}
with sync_playwright() as p:
    b=p.chromium.launch(channel='chrome'); ctx=b.new_context(viewport={'width':1440,'height':1000}); install(ctx,extra); signed_in(ctx)
    pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(BASE); pg.wait_for_selector('text=Stand-in Office'); pg.click('td.p-name'); pg.goto(BASE+'#/schedule'); pg.click('text=Read from a PDF')
    t=time.time(); pg.set_input_files('.sched-import input[type=file]','/home/claude/real/carson.pdf'); pg.wait_for_selector('.sched-read',timeout=170000); print('read in %.0fs'%(time.time()-t))
    rows=pg.evaluate("[...document.querySelectorAll('.sched-read tbody tr')].map(r=>[r.querySelector('.sched-no').textContent,r.querySelector('input.cell').value,...[...r.querySelectorAll('input[type=date]')].map(i=>i.value)])")
    json.dump(rows,open('real_rows.json','w')); json.dump(pg.evaluate("globalThis.__schedule"),open('real_dbg.json','w'))
    acts=[r for r in rows if len(r)>2]; print(len(acts),'activities',len(rows)-len(acts),'headings')
    print(pg.inner_text('.sched-doubts') if pg.locator('.sched-doubts').count() else 'no doubts'); print([ (r.query_selector('.sched-no').inner_text(), r.query_selector('input.cell').input_value(), [c.get_attribute('title') for c in r.query_selector_all('td.doubt')]) for r in pg.query_selector_all('.sched-read tbody tr') if r.query_selector('td.doubt')]); pg.locator('.sched-import').screenshot(path='real_import.png')
    exp=json.load(open('/home/claude/real/expected.json')) if __import__('os').path.exists('/home/claude/real/expected.json') else None
    for r in rows[:0]: print('  ',r)
    b.close()
