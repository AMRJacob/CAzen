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
    rows=pg.evaluate("[...document.querySelectorAll('.change-manual tbody tr')].map(r=>[...r.querySelectorAll('td')].map(t=>t.querySelector('select')?t.querySelector('select').value:(t.querySelector('input.cell')?.value)||t.innerText.trim().replace(/\\s+/g,' ')).slice(1).join(' | '))")
    print('manual:'); [print('  ',r) for r in rows]
    btn='.upload-panel .actions button.primary'
    print('save:',pg.inner_text(btn),pg.is_enabled(btn))
    pg.locator('.upload-panel').screenshot(path='changedoc.png')
    # a page moved by hand: the drawing marked as cover, then back
    pg.locator('select.role-cell').last.select_option('cover'); pg.wait_for_timeout(300)
    print('drawing as cover → save:',pg.inner_text(btn)); pg.locator('select.role-cell').last.select_option('sheet'); pg.wait_for_timeout(300)
    # The drawing chosen by its page number and made a manual page with the bar, then its section
    # made drawings again ("They're drawings").
    dr=lambda: pg.locator('.upload-panel table:not(.change-manual-table) > tbody > tr')
    secs=lambda: pg.locator('.change-manual-table > tbody > tr:not(.cm-page)').count()
    s0, d0 = secs(), dr().count()
    dr().last.locator('td.page-no').click(); pg.click('.pick-bar button:has-text("Project manual")'); pg.wait_for_timeout(2500)
    print('drawing made a manual page: manual sections', s0, '→', secs(), '| drawing rows', d0, '→', dr().count())
    pg.locator('.change-manual-table > tbody > tr:not(.cm-page)').last.locator('button:has-text("They’re drawings")').click(); pg.wait_for_timeout(1500)
    print('section made drawings: manual sections →', secs(), '| drawing rows →', dr().count(), '| save:', pg.inner_text(btn))
    for _ in range(2):  # the two manual pages that came down with it, sent back up by their Part
        dr().nth(2).locator('select.role-cell').select_option('spec'); pg.wait_for_timeout(1200)
    print('manual pages back by their Part: manual sections →', secs(), '| drawing rows →', dr().count(), '| save:', pg.inner_text(btn))
    print('wide pop-up:',pg.evaluate("(()=>{const e=document.querySelector('.upload-panel.wide');const r=e.getBoundingClientRect();return [Math.round(r.width),getComputedStyle(e).position]})()"))
    pg.screenshot(path='upload_wide.png')
    pg.click(btn); pg.wait_for_selector('.upload-panel',state='detached',timeout=30000)
    print('posted:',[n for n,_ in posts])
    iss=[b for n,b in posts if n=='issuances'][0]; print('issuance:',{k:iss.get(k) for k in ('kind','number','title','issued_on')})
    print('sheet revision date:',[b.get('sheet_date') for n,b in posts if n=='sheet_revisions'])
    print('spec revisions:',[(b.get('section_id'),b.get('issuance_id'),b.get('pages'),b.get('revision_label')) for n,b in posts if n=='spec_revisions'])
    form=[b for n,b in posts if n=='issued_forms'][0]; print('register:',{k:form.get(k) for k in ('kind','number','title','values','file_path')})
    for k,v in puts.items():
        r=pypdf.PdfReader(io.BytesIO(v)); print('file:',k.split('/',1)[1],len(r.pages),'pages' + (': '+' / '.join(pg_.extract_text().split('\n')[1] for pg_ in r.pages) if 'Manual' in k else ''))
    print('errors:',errs); b.close()
