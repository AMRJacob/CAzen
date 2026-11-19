from common import *
from t_fix import extra as sheets, S1
T1='77777777-7777-4777-8777-777777777771'
state={'obs':[],'tags':[]}
def post_obs(req):
    r=json.loads(req.post_data); r=r if isinstance(r,list) else [r]; state['obs']+=[dict(x,number=len(state['obs'])+1,status=x.get('status') or 'open') for x in r]; return []
def post_tag(req):
    r=json.loads(req.post_data); state['tags']=[t for t in state['tags'] if (t['trade'],t['label'])!=(r['trade'],r['label'])]+[dict(r,id='aaaaaaaa-0000-4000-8000-%012d'%len(state['tags']))]; return []
extra=dict(sheets); extra.update({'observations':lambda r: state['obs'],'POST:observations':post_obs,'observation_tags':lambda r: state['tags'],'POST:observation_tags':post_tag,
  'observation_types':[{'id':T1,'firm_id':FIRM,'code':'N','name':'Non-conforming','position':0,'is_punch':False}]})
pdf=open('sheet.pdf','rb').read()
with sync_playwright() as p:
    b=p.chromium.launch(channel='chrome'); ctx=b.new_context(viewport={'width':1440,'height':900},device_scale_factor=2); install(ctx,extra); signed_in(ctx)
    ctx.route(re.compile(r'.*/functions/v1/files.*'), lambda r: r.fulfill(status=200,content_type='application/json',body=json.dumps({'url':'https://stand-in.supabase.co/blob/sheet.pdf','configured':True,'bytes':0,'objects':0,'by_project':{}})))
    ctx.route(re.compile(r'.*/blob/sheet\.pdf'), lambda r: r.fulfill(status=200,content_type='application/pdf',body=pdf))
    pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(BASE); pg.wait_for_selector('text=Stand-in Office'); pg.click('td.p-name'); pg.wait_for_timeout(300); pg.goto(BASE+'#/documents'); pg.wait_for_timeout(400)
    # settings: restyle a trade with letters, give one tag a sketched mark
    pg.goto(BASE+'#/settings'); pg.click('.set-group summary:has-text("Forms")'); pg.wait_for_selector('.tag-groups'); pg.locator('.tag-groups').screenshot(path='marks_settings.png')
    pg.click('.tag-group-name:has-text("Glazing")'); pg.click('.markedit-shape[aria-label=hexagon]'); pg.fill('.markedit-text input','GZ'); pg.click('.markedit button:has-text("Save mark")'); pg.wait_for_timeout(400)
    pg.click('.tag-markbtn:has-text("Sealant missing")'); pg.click('.markedit .chip:has-text("Sketch")'); bx=pg.locator('.markedit-pad').bounding_box()
    for pts in ([(0.35,0.35),(0.65,0.65)],[(0.65,0.35),(0.35,0.65)]):
        pg.mouse.move(bx['x']+bx['width']*pts[0][0],bx['y']+bx['height']*pts[0][1]); pg.mouse.down(); pg.mouse.move(bx['x']+bx['width']*pts[1][0],bx['y']+bx['height']*pts[1][1],steps=8); pg.mouse.up()
    pg.screenshot(path='marks_editor.png'); pg.click('.markedit button:has-text("Save mark")'); pg.wait_for_timeout(400)
    print('kept:',[(t['trade'],t['label'],t['shape'],t['mark'],len(t['glyph'] or [])) for t in state['tags']])
    pg.locator('.tag-groups').screenshot(path='marks_settings2.png')
    # observation: tag, then find the spot by zooming and panning
    pg.goto(BASE+'#/field-notes/observations'); pg.wait_for_selector('text=New observation'); pg.click('button:has-text("New observation")')
    pg.click('.obs-tag-open'); pg.click('.obs-tag-trades .chip:has-text("Glazing")'); pg.click('.obs-tag-issues .chip:has-text("Sealant missing")')
    pg.click('.obs-attach .photo-add:has-text("Drawing")'); pg.fill('.spot-bar input','101'); pg.click('.spot-list button'); pg.wait_for_selector('.spot-page img',timeout=15000); pg.wait_for_timeout(500)
    w=pg.locator('.spot-sheet').bounding_box(); cx,cy=w['x']+w['width']*0.6,w['y']+w['height']*0.5
    k=lambda: pg.evaluate("new DOMMatrix(getComputedStyle(document.querySelector('.spot-page')).transform).a")
    k0=k(); pg.mouse.move(cx,cy)
    under=lambda: pg.evaluate("(([x,y])=>{const r=document.querySelector('.spot-page').getBoundingClientRect();return [(x-r.left)/r.width,(y-r.top)/r.height]})",[cx,cy])
    u0=under()
    for _ in range(6): pg.mouse.wheel(0,-200); pg.wait_for_timeout(40)
    u1=under(); print('wheel zoom: %.2f → %.2f | point under the pointer moved by %.4f of the sheet'%(k0,k(),abs(u1[0]-u0[0])+abs(u1[1]-u0[1])))
    pg.mouse.down(); pg.mouse.move(cx-180,cy-90,steps=6); pg.mouse.up(); print('after a drag: tag placed?',pg.locator('.spot-pin').count()==1,'| sheet moved:',[round(a-b,3) for a,b in zip(under(),u1)])
    pg.mouse.click(cx,cy); pg.wait_for_timeout(100); t0=under(); pc=lambda: pg.evaluate("(()=>{const r=document.querySelector('.spot-pin').getBoundingClientRect();return [Math.round(r.left+r.width/2),Math.round(r.top+r.height/2)]})()"); print('  click at',[round(cx),round(cy)],'tag centre at',pc(),'under',[round(v,3) for v in t0]); pg.wait_for_timeout(1500); t=under(); print('  after the finer picture: tag centre',pc(), 'img',pg.evaluate("(()=>{const i=document.querySelector('.spot-page img');return [i.naturalWidth,i.naturalHeight,i.getBoundingClientRect().height]})()")); print('after a still click: tag placed?',pg.locator('.spot-pin').count()==1,'at',[round(v,3) for v in t]); pg.screenshot(path='spot_zoom.png')
    pin=pg.locator('.spot-pin').bounding_box(); print('tag on screen %d px across at zoom %.1f'%(pin['width'],k()))
    pg.click('button:has-text("Tag it here")'); pg.click('button:has-text("Keep it")'); pg.wait_for_timeout(600)
    o=state['obs'][-1]; print('saved region',{a:round(v,3) for a,v in o['region'].items()},'trade',o['trade'])
    # the sheet: a dot, then its mark, then its words
    pg.goto(BASE+'#/documents'); pg.click('text=A-101 >> nth=0'); pg.wait_for_selector('.obs-dot',timeout=15000); pg.wait_for_timeout(600)
    d=pg.locator('.obs-dot'); size=lambda: round(pg.locator('.obs-dot-mark svg').bounding_box()['width']); op=lambda s: pg.evaluate("s=>getComputedStyle(document.querySelector(s)).opacity",s)
    r=d.bounding_box(); pg.screenshot(path='dot_rest.png',clip={'x':r['x']-150,'y':r['y']-110,'width':330,'height':200}); a=size()
    d.hover(); pg.wait_for_timeout(350); bsz=size(); said_early=op('.obs-dot-said'); pg.screenshot(path='dot_hover.png',clip={'x':r['x']-150,'y':r['y']-110,'width':330,'height':200})
    pg.wait_for_timeout(900); pg.screenshot(path='dot_long.png',clip={'x':r['x']-150,'y':r['y']-110,'width':330,'height':200})
    print('on the sheet: %d px dot → %d px mark on hover (words opacity %s) → words opacity %s after a second: %r'%(a,bsz,said_early,op('.obs-dot-said'),pg.inner_text('.obs-dot-said').replace('\n',' | ')))
    print('errors:',errs[:3]); b.close()
