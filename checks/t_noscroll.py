"""No block on an arranged notebook page scrolls inside itself: with a full page (many notes, names, photos, observations) at desk and tablet, list every element in the grid that has a scroll bar."""
from common import *
import json, re, sys
notes='\n'.join(f'{i}. Category {i}\n'+'\n'.join(f'  {chr(97+j)}. A fairly long note about item {j} in category {i} that wraps' for j in range(4)) for i in range(1,6))
names='\n'.join(f'Person {i} | Company {i} | p{i}@x.com' for i in range(9))
V={'id':'cccccccc-cccc-4ccc-8ccc-ccccccccc001','project_id':PROJ,'kind':'visit','visited_on':'2026-11-18','visited_at':'15:00:00','title':'OAC Meeting','weather':'Sunny 60',
   'names':names,'notes':notes,'photos':[f'p/{i}.jpg' for i in range(14)],'photo_labels':{},'pad_id':None,'issued_id':None,'location':'Job site\n1 Main St, Little Rock, AR','widgets':{},'created_at':'2026-11-18T15:00:00Z'}
OBS=[{'id':f'0000000{i}-0000-4000-8000-000000000000','project_id':PROJ,'number':i+1,'title':f'Observation {i} sealant missing at storefront','detail':None,'status':'open','area':'North','trade':'Glazing','type_id':None,'observed_on':'2026-11-18','created_at':'2026-11-18T16:00:00Z','photos':[],'sheet_id':None,'revision_id':None,'region':None} for i in range(9)]
with sync_playwright() as p:
    b=p.chromium.launch()
    for name,vp in (('desk',dict(viewport={'width':1500,'height':950})),('laptop',dict(viewport={'width':1366,'height':768})),('tablet',dict(viewport={'width':1024,'height':768},has_touch=True,is_mobile=True)),('ipad-tall',dict(viewport={'width':820,'height':1180},has_touch=True,is_mobile=True))):
        ctx=b.new_context(**vp); install(ctx,{'site_visits':lambda r:[V],'note_pads':[],'pad_marks':[],'observations':OBS,'observation_types':[],'project_people':[],'notebook_layouts':lambda r:None}); signed_in(ctx)
        pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
        pg.goto(BASE); pg.wait_for_selector('text=Stand-in Office'); pg.locator('td.p-name, .p-card').first.click(); pg.wait_for_timeout(600)
        pg.goto(BASE+'#/field-notes/reports'); pg.wait_for_selector('.nb-toc li'); pg.click('.nb-toc li button'); pg.wait_for_selector('.nb-cell'); pg.wait_for_timeout(1200)
        bars=pg.evaluate("""[...document.querySelectorAll('.nb-grid *')].filter(e=>{const s=getComputedStyle(e);return /(auto|scroll)/.test(s.overflowY+s.overflowX)&&(e.scrollHeight>e.clientHeight+1||e.scrollWidth>e.clientWidth+1)}).map(e=>(e.closest('.nb-cell')?.dataset.block)+' '+e.className.toString().slice(0,40)+' '+e.scrollHeight+'/'+e.clientHeight)""")
        paper=pg.evaluate("(()=>{const e=document.querySelector('.nb-page');return e.scrollHeight+'/'+e.clientHeight})()")
        print(name,'| scrolling inside blocks:',bars,'| page scroll',paper,'| errors',errs)
        pg.screenshot(path=f'noscroll_{name}.png',full_page=False); ctx.close()
    b.close()
