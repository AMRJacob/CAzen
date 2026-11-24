# Moving pages between drawings, cover and project manual: in a new upload by right-click and by
# drag, and in a saved change document opened again from Sets and revisions ("Pages").
import base64, io, json
from common import *
import pypdf
files={'cov':open('rs_cover.pdf','rb').read(),'a201':open('rs_sheet.pdf','rb').read(),'a202':open('rs_sheet.pdf','rb').read(),'spec':open('old_painting.pdf','rb').read()}
ISS={'id':'iss-9','project_id':PROJ,'kind':'addendum','number':'Addendum 1','title':'Storefront','issued_on':'2026-11-20','cover_path':'r2:cov','created_at':'2026-11-20T00:00:00Z',
     'sheet_revisions':[{'revision_label':'Addendum 1','sheets':{'number':'A-201'}},{'revision_label':'Addendum 1','sheets':{'number':'A-202'}}],'issued_forms':[],'spec_revisions':[{'count':1}]}
calls=[]; puts={}
def rec(name, body=[]):
    def h(req):
        try: calls.append((name, json.loads(req.post_data or 'null'), req.url.split('?')[-1][:80]))
        except Exception: calls.append((name, None, ''))
        return body
    return h
fx={'issuances':lambda r: ISS if 'pgrst.object' in (r.headers.get('accept') or '') else [ISS],
    'sheet_revisions':[{'id':'srA','revision_label':'Addendum 1','sheet_date':None,'title_at_rev':'FLOOR PLAN','file_path':'r2:a201','sheets':{'number':'A-201','title':'FLOOR PLAN'}},
                       {'id':'srB','revision_label':'Addendum 1','sheet_date':None,'title_at_rev':'ROOF PLAN','file_path':'r2:a202','sheets':{'number':'A-202','title':'ROOF PLAN'}}],
    'spec_revisions':[{'id':'spP','section_id':'sec-paint','revision_index':1,'title_at_rev':'PAINTING','pages':5,'file_path':'r2:spec','spec_sections':{'number':'09 91 00','title':'PAINTING'}}],
    'current_specs':[],'spec_sections':[],
    'POST:sheets':rec('sheets',{'id':'sh-new','title':'X'}),'POST:sheet_revisions':rec('sheet_revisions',{'id':'sr-new'}),
    'POST:spec_sections':rec('spec_sections',{'id':'sec-new','title':'X'}),'POST:spec_revisions':rec('spec_revisions',{'id':'sp-new'}),
    'PATCH:spec_revisions':rec('spec_revisions.patch'),'PATCH:issuances':rec('issuances.patch'),'PATCH:issued_forms':rec('issued_forms.patch'),
    'DELETE:spec_text':rec('spec_text.delete'),'POST:spec_text':rec('spec_text'),'POST:sheet_text':rec('sheet_text'),
    'delete_revision':rec('delete_revision')}
def filesfn(route):
    b=json.loads(route.request.post_data or '{}'); a=b.get('action'); k=b.get('key','')
    enc=base64.urlsafe_b64encode(k.encode()).decode()
    if a=='put': return route.fulfill(status=200,content_type='application/json',body=json.dumps({'key':k,'url':'https://stand-in.supabase.co/blob/put/'+enc}))
    if a=='get': return route.fulfill(status=200,content_type='application/json',body=json.dumps({'url':'https://stand-in.supabase.co/blob/get/'+enc}))
    if a=='confirm': return route.fulfill(status=200,content_type='application/json',body='{}')
    return route.fulfill(status=200,content_type='application/json',body='{}')
def blob(route):
    u=route.request.url
    if '/blob/get/' in u: return route.fulfill(status=200,content_type='application/pdf',body=files[base64.urlsafe_b64decode(u.split('/blob/get/')[1]).decode().split(':')[-1]])
    k=base64.urlsafe_b64decode(u.split('/blob/put/')[1]).decode(); puts[k]=route.request.post_data_buffer; return route.fulfill(status=200,body='')
roles=lambda pg: pg.evaluate("[...document.querySelectorAll('.upload-panel select.role-cell')].map(s=>({sheet:'D',cover:'C',spec:'M'})[s.value]).join('')")
with sync_playwright() as p:
    b=p.chromium.launch(channel='chrome'); ctx=b.new_context(viewport={'width':1440,'height':950}); install(ctx,fx); signed_in(ctx)
    ctx.route(re.compile(r'.*/functions/v1/files.*'),filesfn); ctx.route(re.compile(r'.*/blob/.*'),blob)
    pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(BASE); pg.wait_for_selector('text=Stand-in Office'); pg.click('td.p-name'); pg.wait_for_selector('.overview'); pg.goto(BASE+'#/documents')
    # 1. a new upload
    pg.click('button:has-text("Upload a set")'); pg.set_input_files('.upload-panel input[type=file]','change_doc.pdf')
    pg.wait_for_selector('.change-manual tbody tr',timeout=30000); pg.wait_for_timeout(1500)
    msec=lambda: pg.locator('.change-manual-table tbody tr').count()
    print('read as        ',roles(pg),'| manual sections:',msec())
    rows=pg.locator('.upload-panel table:not(.change-manual-table) > tbody > tr')
    rows.nth(2).locator('td.page-pick').click(button='right'); pg.click('.pick-menu button:has-text("Project manual")'); pg.wait_for_timeout(600)
    print('right-click A-201 → manual:',roles(pg),'| manual sections:',msec())
    rows.nth(0).locator('td.page-pick').click(); rows.nth(1).locator('td.page-pick').click(modifiers=['Shift'])
    print('chosen:',pg.locator('.upload-panel tr.picked').count())
    rows.nth(1).locator('td.page-pick').click(button='right'); pg.click('.pick-menu button:has-text("Drawings")'); pg.wait_for_timeout(300)
    print('both → drawings by right-click:',roles(pg))
    # drag a manual section down to the drawings
    src=pg.locator('.change-manual-table tbody tr').first.bounding_box(); dst=rows.nth(0).bounding_box()
    pg.mouse.move(src['x']+30,src['y']+src['height']/2); pg.mouse.down(); pg.mouse.move(src['x']+60,src['y']+30,steps=4)
    pg.mouse.move(dst['x']+200,dst['y']+dst['height']/2,steps=10); pg.mouse.up(); pg.wait_for_timeout(600)
    print('section dragged to drawings:',roles(pg),'| manual sections:',msec())
    pg.click('.upload-close'); pg.wait_for_timeout(500)
    # 2. a saved one, opened again
    pg.goto(BASE+'#/documents'); pg.wait_for_timeout(800)
    pg.locator('button[role=tab]:has-text("Sets and revisions"):visible').click(); pg.wait_for_selector('button:has-text("Pages")',timeout=15000)
    pg.click('button:has-text("Pages")'); pg.wait_for_selector('.upload-panel select.role-cell',timeout=60000); pg.wait_for_timeout(1500)
    print('reopened       ',roles(pg),'|',pg.inner_text('.upload-panel h2'))
    rows=pg.locator('.upload-panel table:not(.change-manual-table) > tbody > tr')
    # spec page 7 (09 91 00 page 5) → drawings, typed as A-203; A-202 (page 9) → cover
    rows.nth(6).locator('td.page-pick').click(button='right'); pg.click('.pick-menu button:has-text("Drawings")')
    rows.nth(6).locator('td:nth-child(5) input').fill('A-203'); rows.nth(6).locator('td:nth-child(6) input').fill('DETAIL')
    rows.nth(8).locator('td.page-pick').click(button='right'); pg.click('.pick-menu button:has-text("Cover")')
    print('moved          ',roles(pg),'|',pg.inner_text('.kept-spec').replace('\n',' '),'|',pg.inner_text('.upload-panel .actions button.primary'))
    pg.click('.upload-panel .actions button.primary'); pg.wait_for_selector('.upload-panel',state='detached',timeout=60000)
    print('calls:',[(n,(b or {}).get('pages') if isinstance(b,dict) else '', q) for n,b,q in calls if n not in('sheet_text','spec_text')])
    for k,v in puts.items(): print('file',k.split('/',1)[1][:40],len(pypdf.PdfReader(io.BytesIO(v)).pages),'pages')
    print('errors:',errs); b.close()
