"""A photograph on a notebook page is sent to the page's pad and laid on the paper to be drawn over."""
from common import *
from t_touch import pad, visit
import json, re
posts=[]
def post(r):
    row=json.loads(r.post_data); row=row[0] if isinstance(row,list) else row; posts.append(row); return [row] if 'pgrst.object' not in (r.headers.get('accept') or '') else row
v=dict(visit); v['photos']=['r2:'+PROJ+'/photos/North wall.jpg']; v['photo_labels']={}
store={'pads':[pad],'marks':[]}
def newpad(r):
    row=json.loads(r.post_data); row=row[0] if isinstance(row,list) else row; row=dict(pad,**row); store['pads'].append(row); return row
ex={'site_visits':[v],'note_pads':lambda r: store['pads'],'POST:note_pads':newpad,'pad_marks':lambda r: [m for m in store['marks'] if m['pad_id'] in r.url],'POST:pad_marks':post,'observations':[],'observation_types':[]}
jpg=open('site.jpg','rb').read()
with sync_playwright() as p:
    b=p.chromium.launch(channel='chrome'); ctx=b.new_context(**PHONE); install(ctx,ex); signed_in(ctx)
    ctx.route(re.compile(r'.*/functions/v1/files.*'), lambda r: r.fulfill(status=200,content_type='application/json',body=json.dumps({'url':'https://stand-in.supabase.co/blob/site.jpg','configured':True})))
    ctx.route(re.compile(r'.*/blob/site\.jpg'), lambda r: r.fulfill(status=200,content_type='image/jpeg',body=jpg))
    pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(BASE); pg.wait_for_selector('text=Stand-in Office'); pg.tap('.p-name'); pg.wait_for_timeout(400); pg.goto(BASE+'#/field-notes/reports'); pg.tap('.nb-toc li button'); pg.wait_for_selector('.nb-page'); pg.wait_for_timeout(600)
    pg.locator('.nb-shot').first.scroll_into_view_if_needed(); pg.locator('.nb-shot').first.tap(); pg.wait_for_selector('.nb-light'); print('viewer buttons:',pg.locator('.nb-light-foot button').all_inner_texts())
    made=[]
    pg.tap('.nb-light-foot button:has-text("Draw on it")'); pg.wait_for_selector('.padview'); pg.wait_for_selector('.pad-pic img',timeout=15000); pg.wait_for_timeout(900)
    bx=pg.locator('.pad-pic').bounding_box(); pic=[m for m in posts if m['kind']=='text'][-1]
    print('its own pad: picture fills the window %dx%d of %d wide'%(bx['width'],bx['height'],pg.viewport_size['width']),'| kept at',pic['geometry'],'| same file:',pic['style']['image']==v['photos'][0])
    print('same tools as the sketch:',pg.evaluate("(()=>{document.querySelector('.padmenu-mark').click();return [...document.querySelectorAll('.padbar-key')].map(b=>b.getAttribute('aria-label'))})()"))
    pg.wait_for_timeout(450); pg.tap('.padbar-key[aria-label="Draw with a finger"]') if pg.locator('.padbar-key[aria-label="Draw with a finger"]').count() else None
    cdp=ctx.new_cdp_session(pg); cx=bx['x']+bx['width']/2; cy=bx['y']+bx['height']/2
    def send(kind,pts): cdp.send('Input.dispatchTouchEvent',{'type':kind,'touchPoints':[{'x':x,'y':y,'radiusX':10,'radiusY':10,'force':0.5,'id':i} for (i,x,y) in pts]})
    pg.mouse.click(cx,cy+200); pg.wait_for_timeout(300); n=len(posts); send('touchStart',[(1,cx-60,cy)])
    for i in range(1,12): send('touchMove',[(1,cx-60+i*10,cy+i*2)]); pg.wait_for_timeout(12)
    send('touchEnd',[]); pg.wait_for_timeout(800); ink=[m for m in posts[n:] if m['kind']=='ink']; print('drawn on it: strokes kept',len(ink))
    pg.screenshot(path='drawon_pad.png')
    if pg.locator('.padmenu.open').count()==0: pg.tap('.padmenu-mark'); pg.wait_for_timeout(400)
    store['marks']=posts[:]; pg.tap('.padbar-out'); pg.wait_for_selector('.nb-light'); pg.wait_for_selector('.nb-light-ink svg',timeout=10000); pg.wait_for_timeout(500)
    r=pg.evaluate("(()=>{const i=document.querySelector('.nb-light-pic img').getBoundingClientRect(),s=document.querySelector('.nb-light-ink svg').getBoundingClientRect(),p=document.querySelector('.nb-light-ink path');return {img:[Math.round(i.width),Math.round(i.height)],overlay:[Math.round(s.width),Math.round(s.height)],strokes:document.querySelectorAll('.nb-light-ink path').length,viewBox:document.querySelector('.nb-light-ink svg').getAttribute('viewBox')}})()")
    print('back in the viewer: ink over the photo',r,'| button now:',pg.locator('.nb-light-foot button').all_inner_texts()[1]); pg.screenshot(path='drawon.png'); print('errors:',errs); b.close()
