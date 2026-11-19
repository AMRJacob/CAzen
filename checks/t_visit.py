import sys
from common import *
T1='77777777-7777-4777-8777-777777777771'
state={'obs':[],'visits':[], 'missing': len(sys.argv)>1 and sys.argv[1]=='missing'}
def post_visit(req):
    row=json.loads(req.post_data); state['visits']=[v for v in state['visits'] if v['id']!=row['id']]+[row]; return []
def post_obs(req):
    r=json.loads(req.post_data); r=r if isinstance(r,list) else [r]; state['obs']+=[dict(x,number=len(state['obs'])+1) for x in r]; return []
extra={'observations':lambda r: state['obs'],'POST:observations':post_obs,'observation_types':[{'id':T1,'firm_id':FIRM,'code':'N','name':'Note','position':0,'on_punch_list':False}],
 'site_visits':lambda r: state['visits'],'POST:site_visits':post_visit}
def run(kw,name):
    ctx=b.new_context(**kw); install(ctx,extra); signed_in(ctx)
    def patch(route):
        req=route.request
        if state['missing']: return route.fulfill(status=404,content_type='application/json',body=json.dumps({'code':'PGRST205','message':"Could not find the table 'public.site_visits' in the schema cache"}))
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
    pg.goto(BASE); pg.wait_for_selector('text=Stand-in Office'); pg.click('td.p-name'); pg.wait_for_timeout(300); pg.goto(BASE+'#/documents'); pg.goto(BASE+'#/field-notes/reports'); pg.wait_for_timeout(900)
    pg.click('button:has-text("New field report")'); pg.wait_for_timeout(900)
    if state['missing']:
        print(name,'table missing → falls back to:',pg.inner_text('h1')); ctx.close(); return
    print(name,'visit opened:',pg.inner_text('.visit-head h1'),'| time',pg.input_value('input[type=time]'))
    pg.fill('.visit-title-box','OAC walk, level 2'); pg.keyboard.press('Tab'); pg.fill('.visit-weather','Sunny, 58°F'); pg.keyboard.press('Tab')
    if kw.get('is_mobile'): pg.click('.visit-zones button:has-text("Photos")')
    pg.set_input_files('.visit-zone[data-z=photos] input[type=file] >> nth=1','site.jpg'); pg.wait_for_selector('.visit-zone[data-z=photos] .photo img',timeout=10000)
    if kw.get('is_mobile'): pg.click('.visit-zones button:has-text("Observations")')
    pg.click('.visit-zone[data-z=seen] button:has-text("New observation")'); pg.fill('input[placeholder^="Sealant"]','Blocking missing at grab bars, room 214'); pg.click('button:has-text("Keep it")'); pg.wait_for_timeout(600)
    if kw.get('is_mobile'): pg.click('.visit-zones button:has-text("Notes")')
    print('  notes start with:',pg.input_value('.visit-notes').split('\n')[0])
    pg.wait_for_timeout(500); pg.screenshot(path='visit_%s.png'%name, full_page=not kw.get('is_mobile'))
    v=state['visits'][-1]; print('  saved:',{k:v.get(k) for k in('title','weather','visited_on')},'photos',len(v['photos']))
    if kw.get('is_mobile'): pg.evaluate("window.scrollTo(0,0)")
    pg.click('text=← All visits'); pg.wait_for_selector('.visit-card'); print('  card:',pg.inner_text('.visit-card >> nth=0').replace('\n',' | '))
    pg.screenshot(path='visits_%s.png'%name)
    pg.click('.visit-card >> nth=0'); pg.click('text=Write the field report'); pg.wait_for_timeout(1500)
    print('  report prefilled with observation:', 'Blocking missing' in pg.content(), '| errors:',errs); ctx.close()
with sync_playwright() as p:
    b=p.chromium.launch(channel='chrome')
    run(dict(viewport={'width':1440,'height':1000}),'desk')
    if not state['missing']: run(PHONE,'phone')
    b.close()
