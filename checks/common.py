import json, time, re
from playwright.sync_api import sync_playwright
BASE='http://localhost:4173/'
UID='11111111-1111-4111-8111-111111111111'; FIRM='22222222-2222-4222-8222-222222222222'; PROJ='33333333-3333-4333-8333-333333333333'
SESSION={'access_token':'x.y.z','refresh_token':'r','token_type':'bearer','expires_in':3600,'expires_at':int(time.time())+86400*300,
  'user':{'id':UID,'email':'tester@example.com','aud':'authenticated','role':'authenticated','app_metadata':{},'user_metadata':{'full_name':'Test Architect'},'created_at':'2026-01-01T00:00:00Z'}}
FIX={
 'firms':[{'id':FIRM,'name':'Stand-in Architects','accent_color':'#6b7f6a','address_line1':None,'address_line2':None,'city_state_zip':None,'phone':None,'email':None,'website':None,'license_text':None,'discipline_order':None}],
 'firm_members':[{'firm_id':FIRM,'role':'owner'}],
 'projects':[{'id':PROJ,'firm_id':FIRM,'number':'2401','name':'Stand-in Office','owner_name':'Owner','contractor_name':'Builder','address':None,'status':'active','storage':'r2','created_at':'2026-01-01T00:00:00Z'}],
}
def install(ctx, extra=None, log=None):
    fx=dict(FIX); fx.update(extra or {})
    def handle(route):
        req=route.request; url=req.url
        if log is not None: log.append((req.method,url))
        m=re.search(r'/rest/v1/(rpc/)?([a-z_]+)',url)
        if '/auth/v1/' in url:
            return route.fulfill(status=200,content_type='application/json',body=json.dumps(SESSION if 'token' in url else SESSION['user']))
        if m:
            name=m.group(2)
            if req.method!='GET' and not m.group(1):
                h=fx.get(req.method+':'+name)
                return route.fulfill(status=201,content_type='application/json',body=json.dumps(h(req)) if h else '[]')
            body=fx.get(name, None if m.group(1) else [])
            if callable(body): body=body(req)
            return route.fulfill(status=200,content_type='application/json',body=json.dumps(body))
        return route.fulfill(status=200,content_type='application/json',body='{}')
    ctx.route(re.compile(r'https://stand-in\.supabase\.co/.*'), handle)
def signed_in(ctx):
    ctx.add_init_script("try{if(!localStorage.getItem('sb-stand-in-auth-token'))localStorage.setItem('sb-stand-in-auth-token',%s)}catch(e){}"%json.dumps(json.dumps(SESSION)))
PHONE=dict(viewport={'width':402,'height':874},device_scale_factor=3,is_mobile=True,has_touch=True)
