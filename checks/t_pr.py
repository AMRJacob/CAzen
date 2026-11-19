from common import *
mk=lambda i,kind,num,title: {'id':'c%07d-0000-4000-8000-000000000000'%i,'project_id':PROJ,'kind':kind,'number':num,'title':title,'values':{},'file_path':None,'issuance_id':None,'issued_by':UID,'issued_at':'2026-11-%02dT12:00:00Z'%(i+1)}
state={'forms':[mk(1,'pr','PR-001','Add floor box at conference room'),mk(2,'pr','PR-002','Delete canopy lighting'),mk(3,'change_order','CO-001','Change order one')],'links':[]}
extra={'issued_forms':lambda r: state['forms'],'issued_form_links':lambda r: state['links'],
 'POST:issued_form_links':lambda r: (state['links'].extend(json.loads(r.post_data)),[])[1]}
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
    def unlink(route):
        req=route.request
        if req.method=='DELETE':
            ids=re.search(r'child_id=in\.\(([^)]*)\)',req.url.replace('%28','(').replace('%29',')').replace('%2C',',')); gone=set(x.strip('"') for x in ids.group(1).split(',')) if ids else set()
            state['links']=[l for l in state['links'] if l['child_id'] not in gone]; return route.fulfill(status=204,body='')
        route.fallback()
    ctx.route(re.compile(r'.*/rest/v1/issued_form_links.*'),unlink)
    pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(BASE); pg.wait_for_selector('text=Stand-in Office'); pg.click('td.p-name'); pg.wait_for_timeout(300); pg.goto(BASE+'#/documents'); pg.goto(BASE+'#/ca-logs'); pg.wait_for_selector('.pr-answer')
    print('at first  :',pg.inner_text('.pr-standing').replace('\n',' | '))
    a=pg.locator('.pr-answer').nth(0); bb=pg.locator('.pr-answer').nth(1)   # newest first: PR-002, PR-001
    bb.locator('input').fill('4,850'); bb.locator('input').press('Enter'); a.locator('input').fill('(1,200.00)'); a.locator('input').press('Enter'); pg.wait_for_timeout(300)
    print('priced    :',pg.inner_text('.pr-standing').replace('\n',' | '))
    bb.locator('button:has-text("Approved")').click(); a.locator('button:has-text("Not accepted")').click(); pg.wait_for_timeout(300)
    print('decided   :',pg.inner_text('.pr-standing').replace('\n',' | '),'| flag:',bb.locator('.pr-flag').count())
    bb.locator('select').select_option(label='CO-001 · Change order one'); pg.wait_for_timeout(700)
    print('rolled in :',pg.inner_text('.pr-standing').replace('\n',' | '))
    print('CO row    :',pg.inner_text('tr:has-text("CO-001") >> nth=0').replace('\n',' ').replace('\t',' | '))
    print('saved     :',[(f['number'],f['values']) for f in state['forms'] if f['kind']=='pr'],'links',len(state['links']))
    pg.screenshot(path='pr.png'); print('errors:',errs); b.close()
