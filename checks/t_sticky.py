"""Drawings at a desk: scrolled far down, the search row and the column headings are still at the top."""
from common import *
import copy, t_fix
ex=copy.deepcopy(t_fix.extra); S=ex['sheets'][0]; R=ex['sheet_revisions'][0]; C=ex['current_sheets'][0]
for i in range(2,120):
    sid='44444444-4444-4444-8444-%012d'%i; s=dict(S,id=sid,number='A-%03d'%(100+i),title='PLAN %d'%i); r=dict(R,id='55555555-5555-4555-8555-%012d'%i,sheet_id=sid); c=dict(C,sheet_id=sid,revision_id=r['id'],number=s['number'],title=s['title'])
    ex['sheets'].append(s); ex['sheet_revisions'].append(r); ex['current_sheets'].append(c)
with sync_playwright() as p:
    b=p.chromium.launch(channel='chrome'); ctx=b.new_context(viewport={'width':1440,'height':900}); install(ctx,ex); signed_in(ctx)
    pg=ctx.new_page(); pg.goto(BASE); pg.wait_for_selector('text=Stand-in Office'); pg.click('td.p-name'); pg.wait_for_selector('.overview'); pg.goto(BASE+'#/documents'); pg.wait_for_selector('tr.opens >> nth=50')
    top=lambda sel: round(pg.locator(sel).first.bounding_box()['y'])
    def state(): 
        t=pg.locator('.docs-page .toolbar').bounding_box(); h=pg.locator('table.register thead th').first.bounding_box(); pk=pg.locator('.pick-bar').bounding_box() if pg.locator('.pick-bar').count() else None
        return {'search row':[round(t['y']),round(t['height'])],'selection bar':[round(pk['y']),round(pk['height'])] if pk else None,'headings':[round(h['y']),round(h['height'])]}
    print('at the top of the page:',state())
    pg.mouse.move(700,500); pg.mouse.wheel(0,3000); pg.wait_for_timeout(400); s=state(); print('scrolled 3000 px:',s,'| search usable:',pg.locator('.docs-page .toolbar input.grow').is_visible(),'| headings directly under the search row:',s['headings'][0]==s['search row'][0]+s['search row'][1])
    covered=pg.evaluate("(()=>{const th=document.querySelector('table.register thead th').getBoundingClientRect();const e=document.elementFromPoint(th.left+20,th.top+th.height/2);return !!e&&!!e.closest('thead')})()"); print('a heading is on top of the rows passing under it:',covered)
    pg.click('button:has-text("Re-read titles and dates")'); pg.wait_for_timeout(400); s=state(); print('with the selection bar up:',s,'| stacked in order:',s['selection bar'][0]==s['search row'][0]+s['search row'][1] and s['headings'][0]==s['selection bar'][0]+s['selection bar'][1]); pg.screenshot(path='sticky.png',clip={'x':0,'y':0,'width':1440,'height':260}); b.close()
