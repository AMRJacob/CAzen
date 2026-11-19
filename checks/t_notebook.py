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
people=[]
def post_person(req):
    people.append(json.loads(req.post_data)); return []
extra={'project_people':lambda r: sorted(people,key=lambda p:p['name']),'POST:project_people':post_person,'observations':lambda r: state['obs'],'POST:observations':post_obs,'observation_types':[{'id':T1,'firm_id':FIRM,'code':'N','name':'Note','position':0,'on_punch_list':False}],
 'site_visits':visits,'POST:site_visits':post_visit}
def run(kw,name):
    ctx=b.new_context(**kw, geolocation={'latitude':34.7465,'longitude':-92.2896}, permissions=['geolocation']); install(ctx,extra); signed_in(ctx)
    asked=[]
    def wx(route):
        u=route.request.url; asked.append(u)
        if '/points/' in u: body={'properties':{'observationStations':'https://api.weather.gov/gridpoints/LZK/1,1/stations'}}
        elif u.endswith('/stations'): body={'features':[{'properties':{'stationIdentifier':'KLIT'}}]}
        else: body={'features':[{'properties':{'timestamp':time.strftime('%Y-%m-%dT%H:%M:%S+00:00',time.gmtime()),'textDescription':'Mostly Sunny','temperature':{'value':14.4}}}]}
        route.fulfill(status=200,content_type='application/json',body=json.dumps(body))
    ctx.route(re.compile(r'https://api\.weather\.gov/.*'),wx)
    def patch(route):
        req=route.request
        if req.method=='PATCH':
            vid=re.search(r'id=eq\.([0-9a-f-]+)',req.url).group(1)
            for v in state['visits']:
                if v['id']==vid: v.update(json.loads(req.post_data))
            return route.fulfill(status=204,body='')
        route.fallback()
    ctx.route(re.compile(r'.*/rest/v1/site_visits.*'),patch)
    n=[0]
    def files(r):
        n[0]+=1; r.fulfill(status=200,content_type='application/json',body=json.dumps({'url':'https://stand-in.supabase.co/blob/x','key':PROJ+('/CAzen/Photos/p%d.jpg'%n[0]),'configured':True,'bytes':0,'objects':0,'by_project':{},'cap_bytes':9e9,'max_file_bytes':1e8}))
    ctx.route(re.compile(r'.*/functions/v1/files.*'), files)
    jpg=open('site.jpg','rb').read()
    ctx.route(re.compile(r'.*/blob/x'), lambda r: r.fulfill(status=200,content_type='image/jpeg',body=jpg if r.request.method=='GET' else b''))
    pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(BASE); pg.wait_for_selector('text=Stand-in Office'); pg.click('td.p-name'); pg.goto(BASE+'#/field-notes'); pg.wait_for_selector('.nb-tome')
    pg.screenshot(path='nb_shelf_%s.png'%name)
    pg.click('.nb-tome-fn'); pg.wait_for_selector('.nb-contents'); pg.wait_for_timeout(500); pg.screenshot(path='nb_contents_%s.png'%name)
    pg.click('.nb-menu-mark'); pg.wait_for_timeout(350); pg.screenshot(path='nb_menu_%s.png'%name); pg.click('.nb-menu-spot:has-text("New page")'); pg.wait_for_selector('.nb-page')
    pg.wait_for_timeout(600)
    box=pg.evaluate("(()=>{const r=document.querySelector('.nb-paper').getBoundingClientRect();return [r.left,r.top,innerWidth-r.right,innerHeight-r.bottom]})()")
    print(name,'page:',pg.inner_text('.nb-page h1'),'| paper to screen edges:',box,'| zones:',pg.evaluate("[...document.querySelectorAll('.nb-z h2')].map(h=>h.textContent)"))
    pg.fill('.nb-title','OAC walk, level 2'); pg.keyboard.press('Tab')
    pg.wait_for_function("document.querySelector('.nb-weather').value!==''",timeout=8000)
    print('  weather:',repr(pg.input_value('.nb-weather')),'| looked up at',[u.split('/points/')[1] for u in asked if '/points/' in u][:1])
    pg.click('.nb-z-names button:has-text("Add names")')
    if not people:
        for nm,c,ph,em in [('Pat Owner','Owner LLC','501-555-0101','pat@owner.org'),('Sam Super','Builder Inc','501-555-0102','sam@builder.com')]:
            pg.fill('.nb-person-new input[placeholder=Name]',nm); pg.fill('.nb-person-new input[placeholder=Company]',c); pg.fill('.nb-person-new input[placeholder=Phone]',ph); pg.fill('.nb-person-new input[placeholder=Email]',em); pg.click('.nb-person-new button'); pg.wait_for_timeout(250)
    else:
        print('  directory offers:',pg.evaluate("[...document.querySelectorAll('.nb-person-name')].map(e=>e.textContent)")); pg.click('.nb-person:has-text("Pat Owner") input')
    pg.click('.nb-z-names button:has-text("Done")')
    for t in ['Steel topped out at grid C, deck welds in progress','roofing membrane down on the east half','curb poured at north parking lot','Owner asked about the ribbon cutting']:
        pg.fill('.nb-quick textarea',t); pg.wait_for_timeout(120); g=pg.inner_text('.nb-quick .chip.on'); pg.keyboard.press('Enter'); pg.wait_for_timeout(120); print('  %-52s → %s'%(t[:50],g))
    pg.click('.nb-quick .chip:has-text("Interior")'); pg.wait_for_timeout(200)
    print('  last note moved; notes now:',repr(pg.input_value('.nb-outline').replace('\n',' / ')[:230]))
    pg.locator('.nb-outline').screenshot(path='ruled_%s.png'%name)
    seen=[]
    for _ in range(4):
        pg.click('.nb-menu-mark'); pg.wait_for_timeout(300); pg.click('.nb-menu-spot >> nth=4'); pg.wait_for_timeout(150); seen.append(pg.evaluate("[...document.querySelector('.nb').classList].find(c=>c.startsWith('nb-rule-'))")); pg.keyboard.press('Escape') if False else None; pg.wait_for_timeout(4400)
    print('  paper cycles:',seen)
    pg.set_input_files('.nb-z-photos input[type=file] >> nth=0','site.jpg'); pg.wait_for_selector('.nb-light input',timeout=10000)
    print('  after a photo, label box focused:',pg.evaluate("document.activeElement===document.querySelector('.nb-light input')"))
    pg.keyboard.type('North elevation, storefront'); pg.keyboard.press('Enter'); pg.wait_for_selector('.nb-shot-label')
    pg.set_input_files('.nb-z-photos input[type=file] >> nth=0','site.jpg'); pg.wait_for_selector('.nb-light input'); pg.keyboard.type('Roof deck'); pg.wait_for_timeout(200); pg.screenshot(path='nb_light_%s.png'%name)
    pg.click('.nb-light button[aria-label="Previous photograph"]'); pg.wait_for_timeout(200); print('  gallery steps back to:',pg.input_value('.nb-light input')); pg.click('.nb-light button:has-text("Done")')
    pg.click('.nb-z-seen button:has-text("New observation")'); pg.fill('input[placeholder^="Sealant"]','Blocking missing at grab bars, room 214'); pg.click('button:has-text("Keep it")'); pg.wait_for_selector('.nb-seen li')
    pg.wait_for_timeout(700); pg.screenshot(path='nb_page_%s.png'%name)
    v=[x for x in state['visits'] if x['kind']=='visit'][-1]
    print('  saved: title=%r names=%r photos=%d labels=%s observations=%d'%(v['title'],v['names'],len(v['photos']),sorted(v['photo_labels'].values()),len(state['obs'])))
    pg.click('button:has-text("Make the field report")'); pg.wait_for_timeout(1500); c=pg.content(); print('  export has typed note:', 'Steel topped out' in c, '| observation:', 'Blocking missing' in c, '| names:', 'Pat Owner' in c)
    pg.click('text=Back to the page'); pg.click('.nb-menu-mark'); pg.click('.nb-menu-spot:has-text("Contents")'); pg.wait_for_selector('.nb-toc li')
    pg.click('.nb-menu-mark'); pg.click('.nb-menu-spot:has-text("Close")'); pg.click('.nb-tome-mn'); pg.click('.nb-today'); pg.wait_for_selector('.nb-page')
    print('  meeting page zones:',pg.evaluate("[...document.querySelectorAll('.nb-z h2')].map(h=>h.textContent)"))
    pg.wait_for_timeout(600); pg.screenshot(path='nb_meeting_%s.png'%name); print('  errors:',errs); ctx.close()
with sync_playwright() as p:
    b=p.chromium.launch(channel='chrome')
    run(dict(viewport={'width':1440,'height':1000}),'desk'); run(PHONE,'phone'); b.close()
