"""Shift-click picks the run of sheets between the last one clicked and this one — in both ways of selecting."""
from common import *
import copy, t_fix
ex=copy.deepcopy(t_fix.extra); S=ex['sheets'][0]; R=ex['sheet_revisions'][0]; C=ex['current_sheets'][0]
for i in range(2,7):
    s=dict(S,id=S['id'][:-1]+str(i),number='A-10%d'%i,title='PLAN %d'%i); r=dict(R,id=R['id'][:-1]+str(i),sheet_id=s['id']); c=dict(C,sheet_id=s['id'],revision_id=r['id'],number=s['number'],title=s['title'])
    ex['sheets'].append(s); ex['sheet_revisions'].append(r); ex['current_sheets'].append(c)
with sync_playwright() as p:
    b=p.chromium.launch(channel='chrome'); ctx=b.new_context(viewport={'width':1440,'height':900}); install(ctx,ex); signed_in(ctx)
    pg=ctx.new_page(); pg.goto(BASE); pg.wait_for_selector('text=Stand-in Office'); pg.click('td.p-name'); pg.wait_for_timeout(300); pg.goto(BASE+'#/documents'); pg.wait_for_selector('tr.opens >> nth=5')
    n=lambda: pg.inner_text('.pick-bar strong')
    pg.click('tr.opens >> nth=0',modifiers=['Control']); pg.click('tr.opens >> nth=4',modifiers=['Shift']); print('Ctrl-click the 1st, Shift-click the 5th:',n())
    pg.keyboard.press('Escape'); pg.reload(); pg.wait_for_selector('tr.opens >> nth=5')
    pg.click('button:has-text("Re-read titles and dates")'); pg.click('tr.opens >> nth=1'); pg.click('tr.opens >> nth=5',modifiers=['Shift']); print('Re-read mode — click the 2nd, Shift-click the 6th:',n())
    pg.click('tr.opens >> nth=0',modifiers=['Shift']); print('then Shift-click the 1st (run back from the 6th):',n())
    pg.click('.pick-bar button:has-text("Cancel")'); pg.click('button:has-text("Re-read titles and dates")'); pg.click('tr.group >> nth=0'); print('discipline heading clicked:',n(),'|',pg.inner_text('tr.group >> nth=0').replace('\n',' ')); pg.click('tr.group >> nth=0'); print('clicked again:',pg.inner_text('.pick-bar strong')); b.close()
