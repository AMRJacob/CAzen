import sys
from common import *
T1='77777777-7777-4777-8777-777777777771'
state={'obs':[],'visits':[]}
def post_visit(req):
    row=json.loads(req.post_data); state['visits']=[v for v in state['visits'] if v['id']!=row['id']]+[row]; return []
def post_obs(req):
    r=json.loads(req.post_data); r=r if isinstance(r,list) else [r]; state['obs']+=[dict(x,number=len(state['obs'])+1) for x in r]; return []
def visits(req):
    k=re.search(r'kind=eq\.(\w+)',req.url); return [v for v in state['visits'] if not k or v['kind']==k.group(1)]
extra={'observations':lambda r: state['obs'],'POST:observations':post_obs,'observation_types':[{'id':T1,'firm_id':FIRM,'code':'N','name':'Note','position':0,'on_punch_list':False}],
 'site_visits':visits,'POST:site_visits':post_visit}
def run(kw,name):
    ctx=b.new_context(**kw); install(ctx,extra); signed_in(ctx)
    def patch(route):
        req=route.request
        if req.method=='PATCH':
            vid=re.search(r'id=eq\.([0-9a-f-]+)',req.url).group(1)
            for v in state['visits']:
                if v['id']==vid: v.update(json.loads(req.post_data))
            return route.fulfill(status=204,body='')
        route.fallback()
    ctx.route(re.compile(r'.*/rest/v1/site_visits.*'),patch)
    ctx.route(re.compile(r'.*/functions/v1/files.*'), lambda r: r.fulfill(status=200,content_type='application/json',body=json.dumps({'url':'https://stand-in.supabase.co/blob/x','configured':True,'bytes':0,'objects':0,'by_project':{},'cap_bytes':9e9,'max_file_bytes':1e8})))
    ctx.route(re.compile(r'.*/blob/x'), lambda r: r.fulfill(status=200,body=''))
    pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(BASE); pg.wait_for_selector('text=Stand-in Office'); pg.click('td.p-name'); pg.goto(BASE+'#/field-notes'); pg.wait_for_selector('.nb-book')
    pg.screenshot(path='nb_shelf_%s.png'%name)
    pg.click('.nb-book-visit'); pg.wait_for_selector('.nb-contents'); pg.click('.nb-today'); pg.wait_for_selector('.nb-page')
    print(name,'page:',pg.inner_text('.nb-page h1'),'| categories:',pg.evaluate("[...document.querySelectorAll('.nb-heading')].map(i=>i.value)"))
    pg.fill('.nb-title','OAC walk, level 2'); pg.fill('.nb-lines >> nth=1','Steel topped out at grid C\nDeck welds in progress'); pg.keyboard.press('Tab')
    pg.set_input_files('.nb-shutter input[type=file]','site.jpg'); pg.wait_for_selector('.nb-side .photo img',timeout=10000)
    pg.click('.nb-slide button:has-text("Observation")'); pg.set_input_files('.nb-shutter input[type=file]','site.jpg'); pg.wait_for_selector('.nb-naming input',timeout=10000)
    pg.fill('.nb-naming input','Blocking missing at grab bars, room 214'); pg.keyboard.press('Enter'); pg.wait_for_selector('.nb-seen li')
    pg.wait_for_timeout(700); pg.screenshot(path='nb_page_%s.png'%name)
    v=[x for x in state['visits'] if x['kind']=='visit'][-1]
    print('  saved: title=%r photos=%d observations=%d'%(v['title'],len(v['photos']),len(state['obs'])),'| notes:',repr(v['notes'][:74]))
    pg.click('button:has-text("Make the field report")'); pg.wait_for_timeout(1500); c=pg.content(); print('  export has typed note:', 'Steel topped out' in c, '| has observation:', 'Blocking missing' in c)
    pg.click('text=Back to the page'); pg.click('.nb-bar-contents'); pg.wait_for_selector('.nb-toc li'); print('  contents:',pg.inner_text('.nb-toc li >> nth=0').replace('\n',' | '))
    pg.screenshot(path='nb_contents_%s.png'%name)
    pg.click('.nb-close'); pg.click('.nb-book-meeting'); pg.click('.nb-today'); pg.wait_for_selector('.nb-page')
    print('  meeting page: camera button',pg.locator('.nb-shutter').count(),'| photo/observation sections',pg.locator('.nb-side section').count()-1,'| categories',pg.evaluate("[...document.querySelectorAll('.nb-heading')].map(i=>i.value)"))
    pg.wait_for_timeout(600); pg.screenshot(path='nb_meeting_%s.png'%name); print('  errors:',errs); ctx.close()
with sync_playwright() as p:
    b=p.chromium.launch(channel='chrome')
    run(dict(viewport={'width':1440,'height':1000}),'desk'); run(PHONE,'phone'); b.close()
