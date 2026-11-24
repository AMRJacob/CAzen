# Section number and title from the page preview, typed and read from a drawn box.
# A change document as one PDF (change_doc.pdf, made by make_change_doc.py): cover + narrative,
# two pages reissued into 09 91 00 (3 and a new 3A), a new section 08 43 13, and drawing A-201.
# The pages are sorted into their parts, the cover's number/date/subject fill the set, 09 91 00
# takes the pages by number (old_painting.pdf, pages 1-5, becomes 1,2,3*,3A,4,5), and everything
# is saved under one issuance with the register entry carrying the subject.
import base64
from common import *
import pypdf, io
OLD='r2:'+PROJ+'/specs/sec-paint/0.pdf'
old_pdf=open('old_painting.pdf','rb').read()
CUR=[{'section_id':'sec-paint','project_id':PROJ,'number':'09 91 00','title':'PAINTING','division':'09','is_void':False,'sort_key':'09 91 00',
      'revision_id':'rev-paint-0','revision_index':0,'revision_label':None,'file_path':OLD,'pages':5,'issuance_kind':'bid_set','issuance_number':'Bid Set',
      'issued_on':'2026-09-01','revision_count':1}]
posts=[]; puts={}
def post(name, body):
    def h(req):
        try: posts.append((name, json.loads(req.post_data or 'null')))
        except Exception: posts.append((name, req.post_data))
        return body
    return h
fx={'current_specs':CUR,
    'issuances':[{'kind':'asi','number':'ASI-003','issued_on':'2026-10-01','created_at':'2026-10-01T00:00:00Z'}],
    'spec_sections':lambda req: [{'id':'sec-paint','title':'PAINTING'}] if '09%2091%2000' in req.url or '09+91+00' in req.url else [],
    'POST:issuances':post('issuances',{'id':'iss-1'}),'POST:sheets':post('sheets',{'id':'sh-a201','title':'FLOOR PLAN'}),
    'POST:sheet_revisions':post('sheet_revisions',{'id':'srev-1'}),'POST:spec_sections':post('spec_sections',{'id':'sec-store','title':'STOREFRONTS'}),
    'POST:spec_revisions':post('spec_revisions',{'id':'sprev'}),'POST:issued_forms':post('issued_forms',[]),'PATCH:issuances':post('issuances.patch',[])}
def files(route):
    b=json.loads(route.request.post_data or '{}'); a=b.get('action'); k=b.get('key','')
    if a=='put': return route.fulfill(status=200,content_type='application/json',body=json.dumps({'key':k,'url':'https://stand-in.supabase.co/blob/put/'+base64.urlsafe_b64encode(k.encode()).decode()}))
    if a=='get': return route.fulfill(status=200,content_type='application/json',body=json.dumps({'url':'https://stand-in.supabase.co/blob/old'}))
    if a=='confirm': return route.fulfill(status=404 if k not in puts else 200,content_type='application/json',body=json.dumps({'error':"didn't arrive"} if k not in puts else {}))
    return route.fulfill(status=200,content_type='application/json',body='{}')
def blob(route):
    u=route.request.url
    if '/blob/old' in u: return route.fulfill(status=200,content_type='application/pdf',body=old_pdf)
    k=base64.urlsafe_b64decode(u.split('/blob/put/')[1]).decode(); puts[k]=route.request.post_data_buffer
    return route.fulfill(status=200,body='')
with sync_playwright() as p:
    b=p.chromium.launch(channel='chrome'); ctx=b.new_context(viewport={'width':1440,'height':950}); install(ctx,fx); signed_in(ctx)
    ctx.route(re.compile(r'.*/functions/v1/files.*'),files); ctx.route(re.compile(r'.*/blob/.*'),blob)
    pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(BASE); pg.wait_for_selector('text=Stand-in Office'); pg.click('td.p-name'); pg.wait_for_selector('.overview'); pg.goto(BASE+'#/documents')
    pg.click('button:has-text("Upload a set")'); pg.set_input_files('.upload-panel input[type=file]','change_doc.pdf')
    pg.wait_for_selector('.change-manual tbody tr',timeout=30000); pg.wait_for_timeout(2500)
    parts=pg.evaluate("[...document.querySelectorAll('.upload-panel > table tbody tr, .upload-panel table:not(.change-manual-table) tbody tr')].map(r=>r.querySelector('select.role-cell')?.value)")
    print('parts:',parts)
    f=lambda sel: pg.input_value(sel)
    print('kind:',pg.eval_on_selector('.upload-panel .form select','s=>s.value'),'| name:',f('.upload-panel .form label:has-text("Set name") input'),
          '| date:',f('.upload-panel .form input[type=date]'),'| subject:',f('.upload-panel .form label:has-text("Subject") input'))
    print('cover note:',pg.inner_text('.upload-cover-note'))
    secs=lambda: pg.evaluate("[...document.querySelectorAll('.change-manual-table > tbody > tr:not(.cm-page)')].map(r=>[...r.querySelectorAll('input.cell')].map(i=>i.value).join(' / '))")
    print('before:',secs())
    pg.locator('.change-manual-table .cm-fold').nth(1).click(); pg.wait_for_timeout(500)
    pg.locator('.change-manual-table tr.cm-page .page-thumb').first.click(); pg.wait_for_selector(".ps-page")
    num=pg.locator('input[aria-label="Section number of this section"]'); tit=pg.locator('input[aria-label="Section title of this section"]')
    print('preview:',num.input_value(),'/',tit.input_value())
    num.fill(''); num.type('08 43 14')
    tit.fill('Storefronts, aluminum')
    print('typed:',num.input_value(),'| card:',secs())
    pg.click('.pv-boxes button:has-text("Box the title")'); pg.wait_for_selector('.rp-sheet img')
    bb=pg.locator('.rp-sheet').bounding_box()
    for y0,y1 in [(0.03,0.11)]:
        pg.mouse.move(bb['x']+bb['width']*0.02,bb['y']+bb['height']*y0); pg.mouse.down()
        pg.mouse.move(bb['x']+bb['width']*0.98,bb['y']+bb['height']*y1,steps=5); pg.mouse.up()
    pg.wait_for_timeout(300)
    print('box reads:',pg.inner_text('.rp-read').replace('\n',' '))
    pg.click('.sheet-viewer[aria-label*="section title"] button:has-text("Done")'); pg.wait_for_timeout(400)
    print('after title box:',tit.input_value(),'| card:',secs())
    pg.click('.pv-boxes button:has-text("Box the number")'); pg.wait_for_selector('.rp-sheet img'); bb=pg.locator('.rp-sheet').bounding_box()
    pg.mouse.move(bb['x']+bb['width']*0.02,bb['y']+bb['height']*0.03); pg.mouse.down()
    pg.mouse.move(bb['x']+bb['width']*0.98,bb['y']+bb['height']*0.09,steps=5); pg.mouse.up(); pg.wait_for_timeout(300)
    print('number box reads:',pg.inner_text('.rp-read').replace('\n',' '))
    pg.click('.sheet-viewer[aria-label*="section number"] button:has-text("Done")'); pg.wait_for_timeout(400)
    print('after number box:',num.input_value(),'| card:',secs())
    print('cut link:',pg.locator('.pv-boxes button:has-text("Cut every manual page")').count())
    pg.screenshot(path='/tmp/secbox.png')
    print('errors:',errs); b.close()
