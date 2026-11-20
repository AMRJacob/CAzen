"""Tagging a drawing: a sharp sheet, the corner menu, and choosing the kind of tag without leaving the screen."""
from common import *
from t_fix import extra as sheets, S1
T1='77777777-7777-4777-8777-777777777771'
state={'obs':[]}
def post_obs(req):
    r=json.loads(req.post_data); r=r if isinstance(r,list) else [r]; state['obs']+=r; return []
extra=dict(sheets); extra.update({'observations':lambda r: state['obs'],'POST:observations':post_obs,'observation_types':[{'id':T1,'firm_id':FIRM,'code':'N','name':'Non-conforming','position':0,'is_punch':False}]})
pdf=open('sheet.pdf','rb').read()
with sync_playwright() as p:
    b=p.chromium.launch(channel='chrome'); ctx=b.new_context(viewport={'width':1440,'height':900}); install(ctx,extra); signed_in(ctx)
    ctx.route(re.compile(r'.*/rest/v1/observation_tags.*'), lambda r: r.fulfill(status=404,content_type='application/json',body=json.dumps({'code':'PGRST205','message':"Could not find the table 'public.observation_tags' in the schema cache"})))
    ctx.route(re.compile(r'.*/functions/v1/files.*'), lambda r: r.fulfill(status=200,content_type='application/json',body=json.dumps({'url':'https://stand-in.supabase.co/blob/sheet.pdf','configured':True,'bytes':0,'objects':0,'by_project':{}})))
    ctx.route(re.compile(r'.*/blob/sheet\.pdf'), lambda r: r.fulfill(status=200,content_type='application/pdf',body=pdf))
    pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(BASE); pg.wait_for_selector('text=Stand-in Office'); pg.click('td.p-name'); pg.wait_for_timeout(300); pg.goto(BASE+'#/documents'); pg.wait_for_timeout(500)
    print('sidebar books:',pg.evaluate("[...document.querySelectorAll('.sidebar .nb-tome')].map(a=>a.getAttribute('href')+' '+a.querySelector('.nb-tome-mono').textContent)"))
    pg.locator('.sidebar').screenshot(path='sidebar.png')
    pg.click('.sidebar .nb-tome-ob'); pg.wait_for_selector('text=New observation'); pg.click('button:has-text("New observation")')
    pg.click('.obs-tag-open'); pg.click('.obs-tag-trades .chip:has-text("Glazing")'); pg.click('.obs-tag-issues .chip:has-text("Sealant missing")')
    print('after the tag: title=%r chip=%r'%(pg.input_value('input[placeholder^="Sealant"]'),pg.inner_text('.obs-tag-open')))
    pg.click('.obs-attach .photo-add:has-text("Drawing")'); pg.fill('.spot-bar input','101'); pg.click('.spot-list button'); pg.wait_for_selector('.spot-page img',timeout=15000)
    info=pg.evaluate("(()=>{const i=document.querySelector('.spot-page img');return {natural:i.naturalWidth,shown:Math.round(i.getBoundingClientRect().width),dpr:devicePixelRatio}})()"); print('sheet picture:',info,'| pixels per screen pixel: %.2f'%(info['natural']/(info['shown']*info['dpr'])))
    print('top bar:',pg.locator('.spot-bar > *').all_inner_texts())
    pg.click('.spot-menu .nb-menu-mark'); pg.wait_for_timeout(450); print('corner menu:',pg.locator('.spot-menu .nb-menu-spot').all_inner_texts())
    pg.click('.spot-menu .nb-menu-spot:has-text("Tag type")'); pg.wait_for_selector('.spot-tags'); pg.locator('.spot-tags-row').first.locator('.chip:has-text("Concrete")').click(); pg.wait_for_timeout(200)
    issues=pg.locator('.spot-tags-issues .chip').all_inner_texts(); print('concrete tags:',[i.replace('\n',' ') for i in issues[:3]]); pg.locator('.spot-tags-issues .chip').first.click(); pg.wait_for_timeout(300)
    print('chooser closed:',pg.locator('.spot-tags').count()==0,'| still on the drawing:',pg.locator('.spot-page').count()==1,'| a Tag it here button:',pg.locator('button:has-text("Tag it here")').count())
    bx=pg.locator('.spot-page').bounding_box(); pg.mouse.move(bx['x']+bx['width']*0.5,bx['y']+bx['height']*0.5); pg.mouse.down(); pg.mouse.move(bx['x']+bx['width']*0.5+60,bx['y']+bx['height']*0.5+20,steps=4); pg.mouse.up(); pg.wait_for_timeout(200)
    print('a drag moves the sheet and tags nothing:',pg.locator('.spot-page').count()==1)
    bx=pg.locator('.spot-page').bounding_box(); pg.mouse.click(bx['x']+bx['width']*0.30,bx['y']+bx['height']*0.60); pg.wait_for_timeout(400)
    pin=lambda: pg.evaluate("(()=>{const p=document.querySelector('.spot-pin');return p?[parseFloat(p.style.left).toFixed(1),parseFloat(p.style.top).toFixed(1)]:null})()")
    print('one tap: still on the drawing',pg.locator('.spot').count()==1,'| tag at',pin(),'%')
    h=pg.locator('.spot-pin').bounding_box(); x=h['x']+h['width']/2; y=h['y']+h['height']/2; v0=pg.evaluate("document.querySelector('.spot-page').style.transform")
    pg.mouse.move(x,y); pg.mouse.down(); pg.mouse.move(x+bx['width']*0.2,y-bx['height']*0.1,steps=6); pg.mouse.up(); pg.wait_for_timeout(300)
    print('tag dragged: now at',pin(),'% | the sheet did not move:',pg.evaluate("document.querySelector('.spot-page').style.transform")==v0,'| hint:',pg.inner_text('.spot-hint'))
    pg.click('.spot-menu .nb-menu-mark'); pg.wait_for_timeout(450); pg.click('.spot-menu .nb-menu-spot:has-text("Close")'); pg.wait_for_timeout(400)
    print('Close -> back on the form:',pg.locator('.spot').count()==0,'| tagged:',pg.inner_text('.obs-spot-no'),'| tag chip:',pg.inner_text('.obs-tag-open').replace('\n',' '),'| errors:',errs)
    m=pg.evaluate("(()=>{const r=document.querySelector('.nb-menu, .phone-nav')?.getBoundingClientRect();return r?[Math.round(r.left),Math.round(innerHeight-r.bottom)]:null})()"); print('a corner mark sits in from the corner by (left, bottom):',m)
    b.close()
