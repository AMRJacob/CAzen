from common import *
P2='33333333-3333-4333-8333-333333333334'; U2='11111111-1111-4111-8111-111111111112'
projects=FIX['projects']+[dict(FIX['projects'][0],id=P2,number='2402',name='Second Job')]
people=[{'user_id':UID,'email':'tester@example.com','full_name':'Test Architect','role':'owner','joined_at':'2026-01-01T00:00:00Z','last_seen':'2026-11-19T00:00:00Z'},
        {'user_id':U2,'email':'lauren@example.com','full_name':'Lauren Example','role':'member','joined_at':'2026-11-01T00:00:00Z','last_seen':'2026-11-10T00:00:00Z'}]
state={'pm':[{'project_id':PROJ,'user_id':U2}],'invites':[]}
def post_pm(req): r=json.loads(req.post_data); state['pm']+= r if isinstance(r,list) else [r]; return []
extra={'projects':projects,'firm_people':people,'project_members':lambda r: state['pm'],'POST:project_members':post_pm}
with sync_playwright() as p:
    b=p.chromium.launch(channel='chrome'); ctx=b.new_context(viewport={'width':1440,'height':950}); install(ctx,extra); signed_in(ctx)
    def pm(route):
        req=route.request
        if req.method=='DELETE':
            pid=re.search(r'project_id=eq\.([0-9a-f-]+)',req.url); uid=re.search(r'user_id=eq\.([0-9a-f-]+)',req.url)
            state['pm']=[x for x in state['pm'] if not (uid and x['user_id']==uid.group(1) and (not pid or x['project_id']==pid.group(1)))]; return route.fulfill(status=204,body='')
        route.fallback()
    ctx.route(re.compile(r'.*/rest/v1/project_members.*'),pm)
    def inv(route):
        body=json.loads(route.request.post_data); state['invites'].append(body); route.fulfill(status=200,content_type='application/json',body=json.dumps({'user_id':'x','invited':True,'link':'https://stand-in.supabase.co/auth/v1/verify?token=abc&type=invite','projects':len(body['project_ids'])}))
    ctx.route(re.compile(r'.*/functions/v1/invite-user.*'),inv)
    pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(BASE); pg.wait_for_selector('text=Stand-in Office'); pg.locator('.sidebar').screenshot(path='sidebar2.png')
    print('sidebar books:',pg.evaluate("[...document.querySelectorAll('.sidebar .nb-tome')].map(a=>{const r=a.getBoundingClientRect();return a.textContent.trim()+' '+Math.round(r.width)+'x'+Math.round(r.height)})"))
    pg.goto(BASE+'#/settings'); pg.click('.set-group summary:has-text("People and access")'); pg.wait_for_selector('.access-table tbody tr')
    print('people:',pg.evaluate("[...document.querySelectorAll('.access-table tbody tr')].map(r=>r.innerText.replace(/\\s+/g,' ').slice(0,90))"))
    pg.click('.access-table button:has-text("change")'); pg.click('.confirm-row label:has-text("2402") input'); pg.wait_for_timeout(300); pg.click('.confirm-row label:has-text("2401") input'); pg.wait_for_timeout(300)
    print('after adding to 2402 and removing from 2401:',sorted(x['project_id'][-1] for x in state['pm']))
    pg.fill('.access-invite input[type=email]','sam@builder.com'); pg.select_option('.access-invite select','contractor'); pg.click('.access-invite label:has-text("2402") input'); pg.click('button:has-text("Add and make a link")'); pg.wait_for_selector('.access-invite .ok-text')
    print('invite sent:',{k:state['invites'][0][k] for k in('email','role','project_ids')}); print('says:',pg.inner_text('.access-invite .ok-text')); print('link shown:',pg.input_value('.access-link input')); pg.context.grant_permissions(['clipboard-read','clipboard-write']); pg.click('.access-link button'); print('copied:',pg.evaluate('navigator.clipboard.readText()')==pg.input_value('.access-link input'))
    pg.screenshot(path='access.png'); print('errors:',errs); b.close()
