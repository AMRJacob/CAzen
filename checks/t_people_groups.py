"""Attendees: right-click to edit their details, kept on the project's list and on this page.
Groups: Shift-select pages, right-click, group them; the group's one field report has a section per page."""
from common import *
import json, re
ANN='aaaa0000-0000-4000-8000-0000000000a1'
PEOPLE=[{'id':ANN,'project_id':PROJ,'name':'Ann Lee','company':'Owner','phone':None,'email':'ann@x.com'}]
def pg_(i,at,title,loc,notes,names=''):
    return {'id':i,'project_id':PROJ,'kind':'visit','visited_on':'2026-11-24','visited_at':at,'title':title,'weather':'Sunny','names':names,'notes':notes,'photos':[],'photo_labels':{},'pad_id':None,'issued_id':None,'location':loc,'widgets':{},'group_id':None,'group_name':None,'created_at':f'2026-11-24T{at}Z'}
PAGES=[pg_('00000000-0000-4000-8000-0000000000c3','13:00:00','Bear Hall',None,'1. Progress\n  a. Drywall at L2','Bo Ray | GC | bo@x.com'),
       pg_('00000000-0000-4000-8000-0000000000c2','11:00:00','Maintenance building','Job site\nUCA campus','1. Roof\n  a. Flashing loose','Ann Lee | Owner | ann@x.com'),
       pg_('00000000-0000-4000-8000-0000000000c1','09:00:00','North chiller plant',None,'1. Structure\n  a. Anchor bolts','Ann Lee | Owner | ann@x.com')]
pp=[]; vp=[]
def vpatch(r):
    body=json.loads(r.post_data); m=re.search(r'id=eq\.([0-9a-f-]+)',r.url); vp.append(body)
    for x in PAGES:
        if m and x['id']==m.group(1): x.update(body)
    return [{}]
with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={'width':1440,'height':900})
    install(ctx,{'site_visits':lambda r:PAGES,'PATCH:site_visits':vpatch,'project_people':lambda r:PEOPLE,'PATCH:project_people':lambda r:(pp.append(json.loads(r.post_data)),[{}])[1],
                 'note_pads':[],'pad_marks':[],'observations':[],'observation_types':[],'notebook_layouts':lambda r:None}); signed_in(ctx)
    pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(BASE); pg.wait_for_selector('text=Stand-in Office'); pg.locator('td.p-name, .p-card').first.click(); pg.wait_for_timeout(500)
    pg.goto(BASE+'#/field-notes/reports'); pg.wait_for_selector('.nb-toc li'); pg.wait_for_timeout(700)
    # --- groups
    rows=pg.locator('.nb-toc li > button')
    rows.nth(0).click(modifiers=['Control']); rows.nth(2).click(modifiers=['Shift']); pg.wait_for_timeout(200)
    print('chosen:', pg.locator('.nb-toc li.nb-toc-sel').count(), '|', pg.inner_text('.nb-removing span'))
    rows.nth(1).click(button='right'); pg.wait_for_timeout(200); print('menu:', pg.locator('.nb-tear button').all_inner_texts())
    pg.click('.nb-tear button:has-text("Group these 3 pages")'); pg.wait_for_timeout(1200)
    print('group heading:', pg.locator('.nb-toc-group').inner_text().replace('\n',' | '), '| pages set in:', pg.locator('.nb-toc li.nb-toc-in').count())
    pg.dblclick('.nb-toc-group-name'); pg.keyboard.press('Control+A'); pg.keyboard.type('UCA campus walk'); pg.keyboard.press('Enter'); pg.wait_for_timeout(800)
    print('renamed:', pg.locator('.nb-toc-group-name').inner_text(), '| saved names:', sorted({x.get('group_name') for x in PAGES}))
    pg.click('.nb-toc-group button.primary-lite'); pg.wait_for_timeout(1500)
    if pg.locator('text=List of fields').count(): pg.click('text=List of fields'); pg.wait_for_timeout(400)
    vals=pg.locator('textarea').evaluate_all('e=>e.map(x=>x.value)')
    obsf=[v for v in vals if 'Anchor bolts' in v]
    print('report notes:', obsf[0].split('\n') if obsf else vals[:3])
    print('report attendees/location:', [v for v in vals if 'Ann Lee' in v or 'Bear Hall' in v][:2])
    pg.click('button:has-text("Back to the book")'); pg.wait_for_timeout(500)
    # --- attendees
    pg.locator('.nb-toc li.nb-toc-in > button:has-text("Maintenance")').click(); pg.wait_for_selector('.nb-names li'); pg.wait_for_timeout(500)
    pg.locator('.nb-names li').first.click(button='right'); pg.wait_for_selector('.nb-fix')
    print('editor:', [pg.locator('.nb-fix input').nth(i).input_value() for i in range(4)])
    pg.locator('.nb-fix label:has-text("Company") input').fill('UCA Facilities'); pg.locator('.nb-fix label:has-text("Phone") input').fill(''); pg.locator('.nb-fix label:has-text("Phone") input').type('5015550123')
    pg.click('.nb-fix button.primary'); pg.wait_for_timeout(1300)
    print('project list patched:', pp[-1] if pp else None)
    print('this page line:', pg.locator('.nb-names li').first.inner_text().replace('\n',' '), '| errors', errs)
    b.close()
