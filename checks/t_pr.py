"""Change register: status column (PR approved/rejected, ASI accepted), right-click / long press; an approved PR put in a
change order or a new one (a heading with its PRs under it); PR costs typed in and added up on the change order; the
change order's PDF uploaded later."""
from common import *
import base64
mk=lambda i,kind,num,title: {'id':'c%07d-0000-4000-8000-000000000000'%i,'project_id':PROJ,'kind':kind,'number':num,'title':title,'values':{},'file_path':None,'issuance_id':None,'issued_by':UID,'issued_at':'2026-11-%02dT12:00:00Z'%(i+1)}
state={'forms':[mk(1,'pr','PR-001','Add floor box at conference room'),mk(2,'pr','PR-002','Delete canopy lighting'),mk(3,'change_order','CO-001','Change order one'),mk(4,'asi','ASI-001','Door hardware clarification'),mk(5,'pr','PR-003','Relocate hose bib')],'links':[]}
def new_form(r):
    row=json.loads(r.post_data); row.setdefault('issued_at','2026-11-24T22:00:00Z'); state['forms'].append(row); return row
extra={'issued_forms':lambda r: state['forms'],'issued_form_links':lambda r: state['links'],
 'POST:issued_form_links':lambda r: (state['links'].extend(json.loads(r.post_data)),[])[1],
 'POST:issued_forms':new_form}
puts={}
def files(route):
    b=json.loads(route.request.post_data or '{}'); a=b.get('action'); k=b.get('key','')
    if a=='put': return route.fulfill(status=200,content_type='application/json',body=json.dumps({'key':k,'url':'https://stand-in.supabase.co/blob/put/'+base64.urlsafe_b64encode(k.encode()).decode()}))
    if a=='confirm': return route.fulfill(status=200,content_type='application/json',body='{}')
    return route.fulfill(status=200,content_type='application/json',body='{}')
def blob(route):
    k=base64.urlsafe_b64decode(route.request.url.split('/blob/put/')[1]).decode(); puts[k]=len(route.request.post_data_buffer or b''); route.fulfill(status=200,body='')
row=lambda pg,n: pg.locator(f'tr:has(td.reg-num:text-is("{n}"))').first
with sync_playwright() as p:
    b=p.chromium.launch(channel='chrome'); ctx=b.new_context(viewport={'width':1440,'height':900}); install(ctx,extra); signed_in(ctx)
    def patch(route):
        req=route.request
        if req.method=='PATCH':
            fid=re.search(r'id=eq\.([0-9a-f-]+)',req.url).group(1)
            for f in state['forms']:
                if f['id']==fid: f.update(json.loads(req.post_data))
            return route.fulfill(status=204,body='')
        route.fallback()
    ctx.route(re.compile(r'.*/rest/v1/issued_forms.*'),patch)
    ctx.route(re.compile(r'.*/functions/v1/files.*'),files); ctx.route(re.compile(r'.*/blob/put/.*'),blob)
    pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(BASE); pg.wait_for_selector('text=Stand-in Office'); pg.click('td.p-name'); pg.wait_for_timeout(300); pg.goto(BASE+'#/ca-logs'); pg.wait_for_selector('.pr-status')
    print('headings:',pg.locator('table.register thead tr').first.inner_text().replace('\t',' | '))
    print('status cells:',[(n,row(pg,n).locator('td.col-status').inner_text()) for n in ['PR-003','ASI-001','PR-002','PR-001']])
    row(pg,'PR-002').click(button='right'); pg.click('.pick-menu button:has-text("Approved")'); pg.wait_for_timeout(400)
    print('Approved → menu:',pg.locator('.pick-menu button').all_inner_texts())
    pg.click('.pick-menu button:has-text("CO-001")'); pg.wait_for_timeout(700)
    order=[t.split('\t')[0].strip() for t in pg.locator('table.register tbody tr').all_inner_texts()]
    print('order (PR-002 under CO-001):',order)
    row(pg,'ASI-001').click(button='right'); print('ASI menu:',pg.locator('.pick-menu button').all_inner_texts()); pg.click('.pick-menu button:has-text("Accepted")'); pg.wait_for_timeout(400)
    print('ASI status:',row(pg,'ASI-001').locator('td.col-status').inner_text())
    # costs typed in and added up
    row(pg,'PR-002').locator('td.pr-cost').click(); pg.keyboard.type('4850'); pg.keyboard.press('Enter'); pg.wait_for_timeout(700)
    print('PR-002 cost:',row(pg,'PR-002').locator('td.pr-cost').inner_text(),'| CO-001 cost:',row(pg,'CO-001').locator('td.col-chg').first.inner_text())
    # a new change order for PR-003
    row(pg,'PR-003').click(button='right'); pg.click('.pick-menu button:has-text("Approved")'); pg.wait_for_timeout(300); pg.click('.pick-menu button:has-text("New change order")'); pg.wait_for_timeout(900)
    row(pg,'PR-003').locator('td.pr-cost').click(); pg.keyboard.type('(1,200)'); pg.keyboard.press('Enter'); pg.wait_for_timeout(700)
    order=[t.split('\t')[0].strip() for t in pg.locator('table.register tbody tr').all_inner_texts()]
    print('order:',order,'| CO-002 row:',row(pg,'CO-002').inner_text().replace('\t',' | ').replace('\n',' '))
    # its PDF later
    row(pg,'CO-002').locator('input[type=file]').set_input_files('sheet.pdf'); pg.wait_for_timeout(1200)
    co2=[f for f in state['forms'] if f['number']=='CO-002'][0]
    print('CO-002 file:',co2['file_path'],'| uploaded:',list(puts.values()),'| still says no document:',row(pg,'CO-002').inner_text().count('no document'))
    pg.screenshot(path='pr.png',full_page=True)
    row(pg,'CO-001').click(button='right'); print('CO right-click edits:',pg.locator('tr.reg-edit').count(),'| menu:',pg.locator('.pick-menu').count()); pg.click('tr.reg-edit button:has-text("Cancel")')
    print('errors:',errs); b.close()
with sync_playwright() as p:
    b=p.chromium.launch(channel='chrome'); ctx=b.new_context(**PHONE); install(ctx,extra); signed_in(ctx)
    pg=ctx.new_page(); pg.goto(BASE); pg.wait_for_selector('text=Stand-in Office'); pg.locator('text=Stand-in Office').first.click(); pg.wait_for_timeout(400); pg.goto(BASE+'#/ca-logs'); pg.wait_for_selector('.pr-status')
    box=pg.locator('.pr-status').first.bounding_box(); x,y=box['x']+5,box['y']+5; cdp=ctx.new_cdp_session(pg)
    cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':x,'y':y}]}); pg.wait_for_timeout(700)
    print('long press → menu:',pg.locator('.pick-menu button').all_inner_texts()); cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]}); b.close()
