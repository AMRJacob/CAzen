"""Observations: All / General / Field Notes / Punch list. An observation made on a notebook page carries the page; one made in the Observations book does not.
Field Notes picks a page and opens it; the page lists the same observations."""
from common import *
import json, re, time, sys
PREMIG=len(sys.argv)>1  # before migration 0045: no visit_id column
A='aaaaaaaa-0000-4000-8000-00000000000a'; B='bbbbbbbb-0000-4000-8000-00000000000b'
def pg_(i,day,at,title): return {'id':i,'project_id':PROJ,'kind':'visit','visited_on':day,'visited_at':at,'title':title,'weather':'x','names':None,'notes':'1. N\n  a. ','photos':[],'photo_labels':{},'pad_id':None,'issued_id':None,'location':None,'widgets':{},'created_at':f'{day}T{at}Z'}
PAGES=[pg_(B,'2026-11-20','14:00:00','Second walk'),pg_(A,'2026-11-18','09:00:00','First walk')]
TYPES=[{'id':'t-nc','name':'Non-conforming','is_punch':False,'position':0},{'id':'t-wp','name':'Working punch','is_punch':True,'position':3}]
def ob(n,title,created,visit=None,typ=None,status='open'):
    return {'id':f'00000000-0000-4000-8000-0000000000{n:02d}','project_id':PROJ,'set_id':None,'number':n,'type_id':typ,'sheet_id':None,'revision_id':None,'region':None,'title':title,'detail':None,'status':status,'trade':None,'area':None,'observed_on':created[:10],'due_on':None,'photos':[],'created_by':UID,'created_at':created,'updated_at':created,'visit_id':visit}
OBS=[ob(1,'Linked to first walk','2026-11-24T15:00:00Z',A,'t-wp'),ob(2,'Old, during second walk','2026-11-20T16:00:00',None,'t-nc'),
     ob(3,'New, made in the Observations book','2026-11-24T16:00:00Z',None,'t-wp'),ob(4,'Closed punch','2026-11-24T17:00:00Z',None,'t-wp','closed')]
with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={'width':1366,'height':900})
    sent=[]
    def post(r):
        row=json.loads(r.post_data); row=row[0] if isinstance(row,list) else row; sent.append(row); return row
    install(ctx,{'site_visits':lambda r:PAGES,'observations':lambda r:OBS,'observation_types':TYPES,'POST:observations':post,'note_pads':[],'pad_marks':[],'project_people':[],'notebook_layouts':lambda r:None}); signed_in(ctx)
    if PREMIG:
        def miss(route):
            u=route.request.url
            if 'visit_id' in u: return route.fulfill(status=400,content_type='application/json',body=json.dumps({'code':'42703','message':'column observations.visit_id does not exist'}))
            route.fallback()
        ctx.route(re.compile(r'.*/rest/v1/observations\?.*'),miss)
        for o in OBS: o.pop('visit_id',None)
    pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(BASE); pg.wait_for_selector('text=Stand-in Office'); pg.locator('td.p-name, .p-card').first.click(); pg.wait_for_timeout(500)
    pg.goto(BASE+'#/field-notes/observations'); pg.wait_for_selector('.tabs'); pg.wait_for_timeout(800)
    titles=lambda: pg.locator('.obs-list .obs-title').all_inner_texts()
    print('tabs:', pg.locator('.tabs [role=tab]').all_inner_texts())
    for t in ('All','General','Field Notes','Punch list'):
        pg.click(f'.tabs [role=tab]:has-text("{t}")'); pg.wait_for_timeout(250)
        extra=''
        if t=='Field Notes':
            extra=f" | pages offered {pg.locator('.set-actions select option').all_inner_texts()}"
            r={}
            for o in pg.locator('.set-actions select option').all():
                pg.select_option('.set-actions select', value=o.get_attribute('value')); pg.wait_for_timeout(150); r[o.inner_text()]=titles()
            extra+=f' | per page {r}'
        print(f'{t}: {titles()}{extra}')
    # Open the first walk from the tab: the book opens at that page, which lists the same observation.
    pg.click('.tabs [role=tab]:has-text("Field Notes")'); pg.select_option('.set-actions select', value=A); pg.click('button:has-text("Open the page")')
    pg.wait_for_selector('.nb-page'); pg.wait_for_timeout(700)
    print('opened at:', pg.locator('.nb-page h1').inner_text(), '| page lists:', [x.split('\n')[0] for x in pg.locator('.nb-seen li:not(.nb-seen-old):not(.nb-seen-rule) .nb-seen-text').all_inner_texts()])
    # A new observation from this page carries it.
    pg.click('.nb-z-seen button:has-text("New observation")'); pg.wait_for_selector('.obs-form'); pg.fill('.obs-form label:has-text("What was seen") input','Made on the page'); pg.keyboard.press('Enter'); pg.wait_for_timeout(1500)
    print('sent from the page with visit_id = first walk:', [ (r.get('title'), r.get('visit_id')==A) for r in sent])
    pg.goto(BASE+'#/field-notes/observations'); pg.wait_for_selector('.tabs'); pg.click('button:has-text("New observation")'); pg.wait_for_selector('.obs-form')
    pg.fill('.obs-form label:has-text("What was seen") input','Made in the book'); pg.keyboard.press('Enter'); pg.wait_for_timeout(1500)
    print('sent from the book:', [(r.get('title'), r.get('visit_id')) for r in sent][-1], '| errors:', errs)
    pg.screenshot(path='obstabs.png'); b.close()
