# An upload keeps going in the top-right corner while another page is open, and says when it is saved.
import base64, json, time
from common import *
puts={}
fx={'current_specs':[],'spec_sections':[],'POST:issuances':lambda r:{'id':'iss-1'},'POST:sheets':lambda r:{'id':'sh','title':'X'},
    'POST:sheet_revisions':lambda r:{'id':'sr'},'POST:spec_sections':lambda r:{'id':'sec','title':'X'},'POST:spec_revisions':lambda r:{'id':'sp'}}
def files(route):
    b=json.loads(route.request.post_data or '{}'); a=b.get('action'); k=b.get('key','')
    if a=='put': return route.fulfill(status=200,content_type='application/json',body=json.dumps({'key':k,'url':'https://stand-in.supabase.co/blob/put/'+base64.urlsafe_b64encode(k.encode()).decode()}))
    if a=='confirm': return route.fulfill(status=200,content_type='application/json',body='{}')
    return route.fulfill(status=200,content_type='application/json',body='{}')
def blob(route):
    time.sleep(0.6)  # a slow line, so the corner can be seen at work
    puts[route.request.url]=1; route.fulfill(status=200,body='')
with sync_playwright() as p:
    b=p.chromium.launch(channel='chrome'); ctx=b.new_context(viewport={'width':1440,'height':900}); install(ctx,fx); signed_in(ctx)
    ctx.route(re.compile(r'.*/functions/v1/files.*'),files); ctx.route(re.compile(r'.*/blob/.*'),blob)
    pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(BASE); pg.wait_for_selector('text=Stand-in Office'); pg.click('td.p-name'); pg.wait_for_selector('.overview'); pg.goto(BASE+'#/documents')
    pg.click('button:has-text("Upload a set")'); pg.set_input_files('.upload-panel input[type=file]','change_doc.pdf')
    pg.wait_for_selector('.change-manual tbody tr',timeout=30000); pg.wait_for_timeout(1500)
    pg.click('.upload-panel .actions button.primary'); pg.wait_for_selector('.upload-chip',timeout=5000)
    print('corner:',pg.inner_text('.upload-chip').replace('\n',' | '),'| panel gone:',pg.locator('.upload-panel').count()==0)
    pg.screenshot(path='upload_bg1.png')
    pg.click('nav a:has-text("Pay applications")') if pg.locator('nav a:has-text("Pay applications")').count() else pg.goto(BASE+'#/pay')
    pg.wait_for_timeout(1500); print('on another page, corner still:',pg.inner_text('.upload-chip').replace('\n',' | ')[:90])
    pg.wait_for_selector('.upload-chip.done',timeout=60000); print('done:',pg.inner_text('.upload-chip.done').replace('\n',' '))
    pg.screenshot(path='upload_bg2.png')
    print('errors:',errs); b.close()
