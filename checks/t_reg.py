from common import *
mk=lambda i,kind,num,title,v=None: {'id':'c%07d-0000-4000-8000-000000000000'%i,'project_id':PROJ,'kind':kind,'number':num,'title':title,'values':v or {},'file_path':None,'issuance_id':None,'issued_by':UID,'issued_at':'2026-11-%02dT18:00:00Z'%(i+1)}
state={'forms':[mk(1,'pr','PR-001','Add floor box at conference room',{'pr.price':'4850','pr.decision':'approved'}),mk(2,'pr','PR-002','Delete canopy lighting',{'pr.price':'-1200'}),mk(3,'change_order','CO-001','Change order one'),mk(4,'asi','ASI-004','Revised storfront head')],
       'links':[{'parent_id':'c0000003-0000-4000-8000-000000000000','child_id':'c0000001-0000-4000-8000-000000000000'}]}
extra={'issued_forms':lambda r: state['forms'],'issued_form_links':lambda r: state['links']}
with sync_playwright() as p:
    b=p.chromium.launch(channel='chrome'); ctx=b.new_context(viewport={'width':1440,'height':900}); install(ctx,extra); signed_in(ctx)
    sent=[]
    def patch(route):
        req=route.request
        if req.method=='PATCH':
            fid=re.search(r'id=eq\.([0-9a-f-]+)',req.url).group(1); body=json.loads(req.post_data); sent.append(body)
            for f in state['forms']:
                if f['id']==fid: f.update(body)
            return route.fulfill(status=204,body='')
        route.fallback()
    ctx.route(re.compile(r'.*/rest/v1/issued_forms.*'),patch)
    pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(BASE); pg.wait_for_selector('text=Stand-in Office'); pg.click('td.p-name'); pg.goto(BASE+'#/ca-logs'); pg.wait_for_selector('.register .reg-total')
    tot=lambda: ' || '.join(t.replace('\n',' ').replace('\t',' | ') for t in pg.locator('.register thead .reg-total').all_inner_texts())
    row=lambda n: pg.locator('.register tbody tr:has-text("%s")'%n).first
    print('top of the register:',tot()); print('CO-001 row:',row('CO-001').inner_text().replace('\t',' | '))
    row('ASI-004').click(button='right'); print('right-click opens the editor:',pg.locator('.reg-edit').count()==1); pg.fill('.reg-edit input[aria-label=Subject]','Revised storefront head'); pg.fill('.reg-edit input[aria-label="Change to contract time, in days"]','3'); pg.keyboard.press('Enter'); pg.wait_for_timeout(400)
    print('ASI after edit:',row('ASI-004').inner_text().replace('\t',' | '),'| sent',{k:(v if k!='values' else v) for k,v in sent[-1].items() if k!='issued_at'})
    row('CO-001').locator('button:has-text("Edit")').click(); pg.fill('.reg-edit input[aria-label="Change to contract cost"]','5,100'); pg.fill('.reg-edit input[aria-label="Change to contract time, in days"]','7'); pg.screenshot(path='reg_edit.png'); pg.click('.reg-edit button:has-text("Save")'); pg.wait_for_timeout(400)
    print('CO-001 after its own figures:',row('CO-001').inner_text().replace('\t',' | ')); print('top of the register:',tot()); pg.screenshot(path='reg.png'); print('errors:',errs[:3]); b.close()
