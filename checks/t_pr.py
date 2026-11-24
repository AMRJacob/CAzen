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
    pg.goto(BASE); pg.wait_for_selector('text=Stand-in Office'); pg.click('td.p-name'); pg.wait_for_timeout(300); pg.goto(BASE+'#/ca-logs'); pg.wait_for_selector('.pr-status')
    print('rows under PRs (should be none):',pg.locator('.pr-answer, tr.pr-response').count())
    print('statuses:',pg.locator('.pr-status').all_inner_texts())
    pg.locator('tr:has-text("PR-002")').first.click(button='right'); print('menu:',pg.locator('.pick-menu button').all_inner_texts())
    pg.click('.pick-menu button:has-text("Approved")'); pg.wait_for_timeout(400)
    pg.locator('tr:has-text("PR-001")').first.click(button='right'); pg.click('.pick-menu button:has-text("Rejected")'); pg.wait_for_timeout(400)
    print('after menu:',pg.locator('.pr-status').all_inner_texts(),'| saved:',[(f['number'],f['values'].get('pr.decision')) for f in state['forms'] if f['kind']=='pr'])
    pg.locator('tr:has-text("PR-001")').first.click(button='right'); pg.click('.pick-menu button:has-text("Edit")'); print('Edit from the menu opens the row editor:',pg.locator('tr.reg-edit').count()); pg.click('tr.reg-edit button:has-text("Cancel")')
    print('CO row right-click still edits:',end=' '); pg.locator('tr:has-text("CO-001")').first.click(button='right'); print(pg.locator('tr.reg-edit').count(),'| menu:',pg.locator('.pick-menu').count()); pg.click('tr.reg-edit button:has-text("Cancel")')
    pg.screenshot(path='pr.png'); print('errors:',errs); b.close()
# by touch: a long press opens the same menu
with sync_playwright() as p:
    b=p.chromium.launch(channel='chrome'); ctx=b.new_context(**PHONE); install(ctx,extra); signed_in(ctx)
    pg=ctx.new_page(); pg.goto(BASE); pg.wait_for_selector('text=Stand-in Office'); pg.locator('text=Stand-in Office').first.click(); pg.wait_for_timeout(400); pg.goto(BASE+'#/ca-logs'); pg.wait_for_selector('.pr-status')
    box=pg.locator('.pr-status').first.bounding_box(); x,y=box['x']+5,box['y']+5
    cdp=ctx.new_cdp_session(pg)
    cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':x,'y':y}]}); pg.wait_for_timeout(700)
    print('long press → menu:',pg.locator('.pick-menu button').all_inner_texts())
    cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]}); b.close()
