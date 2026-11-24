"""Several sheets chosen, right-click → Change discipline → filed under another discipline; back by number."""
from common import *
import copy, t_fix
ex=copy.deepcopy(t_fix.extra); S=ex['sheets'][0]; R=ex['sheet_revisions'][0]; C=ex['current_sheets'][0]
for i in range(2,5):
    s=dict(S,id=S['id'][:-1]+str(i),number='Q-10%d'%i,title='EQUIP %d'%i); r=dict(R,id=R['id'][:-1]+str(i),sheet_id=s['id']); c=dict(C,sheet_id=s['id'],revision_id=r['id'],number=s['number'],title=s['title'])
    ex['sheets'].append(s); ex['sheet_revisions'].append(r); ex['current_sheets'].append(c)
sent=[]
def patch(req):
    body=json.loads(req.post_data or '{}'); from urllib.parse import unquote; ids=re.search(r'id=in\.\(([^)]*)\)',unquote(req.url))
    ids=[x.strip('"') for x in ids.group(1).split(',')] if ids else []
    sent.append((body,ids))
    for c in ex['current_sheets']:
        if c['sheet_id'] in ids: c['filed_under']=body.get('filed_under')
    return []
ex['PATCH:sheets']=patch
with sync_playwright() as p:
    b=p.chromium.launch(channel='chrome'); ctx=b.new_context(viewport={'width':1440,'height':900}); install(ctx,ex); signed_in(ctx)
    pg=ctx.new_page(); pg.goto(BASE); pg.wait_for_selector('text=Stand-in Office'); pg.click('td.p-name'); pg.wait_for_timeout(300); pg.goto(BASE+'#/documents'); pg.wait_for_selector('tr.opens >> nth=3')
    groups=lambda: [t.replace('\n',' ') for t in pg.locator('tr.group').all_inner_texts()]
    print('before:',groups())
    q=[i for i,t in enumerate(pg.locator('tr.opens').all_inner_texts()) if t.startswith('Q-')]
    pg.click(f'tr.opens >> nth={q[0]}',modifiers=['Control']); pg.click(f'tr.opens >> nth={q[-1]}',modifiers=['Shift'])
    print('selected:',pg.inner_text('.pick-bar strong'))
    pg.click(f'tr.opens >> nth={q[0]}',button='right'); pg.click('text=Change discipline ▸')
    print('submenu head:',pg.inner_text('.pick-menu-back'))
    pg.click('.pick-menu-list button:has-text("M · Mechanical")'); pg.wait_for_timeout(500)
    print('sent:',sent[-1]); print('after:',groups()); print('tags:',pg.locator('.filed-tag').all_inner_texts())
    pg.click(f'tr.opens >> nth=0',modifiers=['Control']) if False else None
    rows=[i for i,t in enumerate(pg.locator('tr.opens').all_inner_texts()) if t.startswith('Q-')]
    pg.click(f'tr.opens >> nth={rows[0]}',modifiers=['Control']); pg.click(f'tr.opens >> nth={rows[-1]}',modifiers=['Shift'])
    pg.click(f'tr.opens >> nth={rows[0]}',button='right'); pg.click('text=Change discipline ▸')
    print('ticked:',pg.locator('.pick-menu-here').all_inner_texts())
    pg.click('.pick-menu-list button >> nth=0'); pg.wait_for_timeout(500)
    print('sent:',sent[-1]); print('back:',groups()); b.close()
