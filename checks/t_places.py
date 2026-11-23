"""Observations, 11/23: project numbers with the trade's letters ("Gl · 3"); the new trades; one observation in several places
(from the observation, from a page's Add existing, from the punch list's Add existing; taken off again); the Agenda block —
picked up from an earlier meeting page, an observation ticked resolved closes it, Export PDF on the letterhead."""
from common import *
import json, re, io
A='aaaaaaaa-0000-4000-8000-00000000000a'; M='bbbbbbbb-0000-4000-8000-00000000000b'; C='cccccccc-0000-4000-8000-00000000000c'
def page(i,kind,day,at,title,notes,widgets=None):
    return {'id':i,'project_id':PROJ,'kind':kind,'visited_on':day,'visited_at':at,'title':title,'weather':'x','names':'Ann Lee | Owner | ann@x.com\nBo Ray | GC | bo@x.com','notes':notes,
            'photos':[],'photo_labels':{},'pad_id':None,'issued_id':None,'location':'Job site\n1 Main St','widgets':widgets or {},'created_at':f'{day}T{at}Z'}
VISITS=[page(A,'visit','2026-11-24','09:00:00','Site walk','1. Structure\n  a. x')]
MEET=[page(C,'meeting','2026-11-25','10:00:00','OAC #6','1. General\n  a. '),
      page(M,'meeting','2026-11-18','10:00:00','OAC #5','1. Schedule\n  a. Roof dry-in by 12/5\n2. Submittals\n  a. Door hardware resubmittal',
           {'agenda-old1':{'title':'Agenda','agenda':{'from':None,'old':[{'text':'Owner furniture date','done':False},{'text':'Settled thing','done':True}],'obs':[],'fresh':[]}}})]
TYPES=[{'id':'t-nc','code':'N','name':'Non-conforming','is_punch':False,'position':0},{'id':'t-wp','code':'W','name':'Working punch','is_punch':True,'position':3}]
def ob(n,title,trade,typ,visit=None,also=None,punch=False,created='2026-11-20T15:00:00Z'):
    return {'id':f'00000000-0000-4000-8000-0000000000{n:02d}','project_id':PROJ,'set_id':None,'number':1,'ref':n,'type_id':typ,'sheet_id':None,'revision_id':None,'region':None,'title':title,'detail':None,'status':'open',
            'trade':trade,'area':'North','observed_on':created[:10],'due_on':None,'photos':[],'created_by':UID,'created_at':created,'updated_at':created,'visit_id':visit,'also_on':also or [],'on_punch':punch}
OBS=[ob(1,'Dry wall needs repair','Drywall','t-wp'),ob(2,'Sealant missing at storefront','Glazing','t-nc'),ob(3,'Cab finish scratched','Elevators',None),
     ob(4,'Made on the meeting walk','Masonry','t-nc',created='2026-11-18T11:00:00Z',also=[M])]
patches=[]
def patch(r):
    body=json.loads(r.post_data); m=re.search(r'id=eq\.([0-9a-f-]+)',r.url)
    for o in OBS:
        if m and o['id']==m.group(1): o.update(body)
    patches.append(body); return [body]
def visits(r):
    return VISITS if 'kind=eq.visit' in r.url else MEET if 'kind=eq.meeting' in r.url else VISITS+MEET
with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={'width':1440,'height':950},accept_downloads=True)
    install(ctx,{'site_visits':visits,'observations':lambda r:OBS,'observation_types':TYPES,'PATCH:observations':patch,'PATCH:site_visits':lambda r:[json.loads(r.post_data)],
                 'note_pads':[],'pad_marks':[],'project_people':[],'notebook_layouts':lambda r:None}); signed_in(ctx)
    pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(BASE); pg.wait_for_selector('text=Stand-in Office'); pg.locator('td.p-name, .p-card').first.click(); pg.wait_for_timeout(500)
    pg.goto(BASE+'#/field-notes/observations'); pg.wait_for_selector('.obs-list'); pg.wait_for_timeout(700)
    print('1. names:', pg.locator('.obs-list .obs-no').all_inner_texts())
    # New trades in the form's tag chooser.
    pg.click('.obs-list .obs-title >> nth=0'); pg.wait_for_selector('.obs-form'); pg.click('.obs-tag-open'); pg.wait_for_timeout(200)
    trades=pg.locator('.obs-form').inner_text()
    print('2. new trades offered:', [t for t in ('Demolition / Abatement','Casework / Millwork','Firestopping','Storefront / Curtain wall','Elevators','Fire alarm / Security','Site utilities') if t in trades])
    pg.click('.obs-tag-open')
    # From the observation: add to a field-notes page and to the punch list.
    print('3. places shown:', pg.locator('.obs-places').inner_text().replace('\n',' | '))
    pg.select_option('.obs-place-add', value=A); pg.click('.obs-places button:has-text("Punch list")') if pg.locator('.obs-places button:has-text("+ Punch list")').count() else None
    pg.click('.obs-form .actions button.primary'); pg.wait_for_timeout(1200)
    print('   saved with:', {k:v for k,v in patches[-1].items() if k in ('also_on','on_punch')})
    # Punch list: add existing, then take off.
    pg.click('.tabs [role=tab]:has-text("Punch list")'); pg.wait_for_timeout(300)
    before=[x for x in pg.locator('.obs-list .obs-no').all_inner_texts()]
    pg.click('button:has-text("Add existing")'); pg.wait_for_selector('.obs-picker')
    pg.fill('.obs-picker input[type=search]','storefront'); pg.wait_for_timeout(150)
    print('4. punch before:', before, '| picker finds:', pg.locator('.obs-picker-list .obs-picker-t').all_inner_texts())
    pg.click('.obs-picker-list input[type=checkbox] >> nth=0'); pg.click('.obs-picker button.primary'); pg.wait_for_timeout(1200)
    print('   punch after:', pg.locator('.obs-list .obs-no').all_inner_texts(), '| take-off buttons:', pg.locator('.obs-list button:has-text("Take off")').count())
    pg.click('.obs-list button:has-text("Take off") >> nth=0'); pg.wait_for_timeout(1200)
    print('   after take off:', pg.locator('.obs-list .obs-no').all_inner_texts())
    # The meeting book: arrange, add an Agenda, pick up from OAC #5.
    pg.goto(BASE+'#/field-notes/meetings'); pg.wait_for_selector('.nb-toc li'); pg.wait_for_timeout(500)
    pg.click('.nb-toc li button:has-text("OAC #6")'); pg.wait_for_selector('.nb-cell'); pg.wait_for_timeout(700)
    pg.click('.nb-menu .nb-menu-mark'); pg.wait_for_timeout(300); pg.click('.nb-menu .nb-menu-spot:has-text("Arrange")'); pg.wait_for_selector('.nb-arr')
    pg.click('.nb-menu-arrange .nb-menu-spot:has-text("Agenda")'); pg.click('.nb-menu-arrange .nb-menu-spot:has-text("Close")'); pg.wait_for_timeout(800)
    ag=pg.locator('.nb-z-agenda')
    print('5. pick up from:', ag.locator('.ag-from select option').all_inner_texts(), '| selected:', ag.locator('.ag-from select').evaluate('e=>e.selectedOptions[0].text'))
    ag.locator('.ag-from button').click(); pg.wait_for_timeout(300)
    print('   old business:', ag.locator('.ag-part >> nth=0').locator('input[type=text]').evaluate_all('e=>e.map(x=>x.value)'))
    print('   observations:', ag.locator('.ag-obs').all_inner_texts())
    ag.locator('.nb-check-add:has-text("Add item")').click(); pg.keyboard.type('Punch walk date')
    ag.locator('.ag-obs').first.locator('xpath=..').locator('input[type=checkbox]').check(); pg.wait_for_timeout(1300)
    print('   resolved closes the observation:', patches[-1])
    ag.locator('.ag-part >> nth=0').locator('input[type=checkbox]').first.check(); pg.wait_for_timeout(900)
    with pg.expect_download() as dl:
        ag.locator('button:has-text("Export PDF")').click()
    d=dl.value; path='agenda.pdf'; d.save_as(path)
    from pypdf import PdfReader
    t=PdfReader(path).pages[0].extract_text()
    print('6. PDF', d.suggested_filename, '|', ' / '.join(l for l in t.split('\n') if l.strip())[:700])
    pg.screenshot(path='agenda_page.png')
    print('errors:', errs); b.close()
