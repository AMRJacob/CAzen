"""The tagging screen close in: the tag reads as its mark, and the sheet is redrawn sharp from the file."""
from common import *
from t_fix import extra as sheets
import io, sys
N=int(sys.argv[1]) if len(sys.argv)>1 else 14
from PIL import Image, ImageFilter, ImageStat
T1='77777777-7777-4777-8777-777777777771'
extra=dict(sheets); extra.update({'observations':[],'observation_types':[{'id':T1,'firm_id':FIRM,'code':'N','name':'Non-conforming','position':0,'is_punch':False}]})
pdf=open('spec.pdf','rb').read()
def edge(png):
    im=Image.open(io.BytesIO(png)).convert('L'); return ImageStat.Stat(im.filter(ImageFilter.FIND_EDGES)).var[0]
with sync_playwright() as p:
    b=p.chromium.launch(channel='chrome'); ctx=b.new_context(viewport={'width':1180,'height':820},device_scale_factor=2); install(ctx,extra); signed_in(ctx)
    ctx.route(re.compile(r'.*/rest/v1/observation_tags.*'), lambda r: r.fulfill(status=404,content_type='application/json',body=json.dumps({'code':'PGRST205','message':'no table'})))
    ctx.route(re.compile(r'.*/functions/v1/files.*'), lambda r: r.fulfill(status=200,content_type='application/json',body=json.dumps({'url':'https://stand-in.supabase.co/blob/sheet.pdf','configured':True})))
    ctx.route(re.compile(r'.*/blob/sheet\.pdf'), lambda r: r.fulfill(status=200,content_type='application/pdf',body=pdf))
    pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(BASE); pg.wait_for_selector('text=Stand-in Office'); pg.click('.projects a, td.p-name'); pg.wait_for_timeout(300); pg.goto(BASE+'#/field-notes/observations'); pg.wait_for_selector('text=New observation'); pg.click('button:has-text("New observation")')
    pg.click('.obs-tag-open'); pg.click('.obs-tag-trades .chip:has-text("Masonry")'); pg.wait_for_timeout(150)
    if pg.locator('.obs-tag-issues .chip').count(): pg.locator('.obs-tag-issues .chip').first.click()
    pg.click('.obs-attach .photo-add:has-text("Drawing")'); pg.fill('.spot-bar input','101'); pg.click('.spot-list button'); pg.wait_for_selector('.spot-page img',timeout=15000); pg.wait_for_timeout(500)
    bx=pg.locator('.spot-page').bounding_box(); pg.mouse.click(bx['x']+bx['width']*0.45,bx['y']+bx['height']*0.45); pg.wait_for_timeout(300)
    w=pg.locator('.spot-sheet').bounding_box(); cx=w['x']+w['width']/2; cy=w['y']+w['height']/2
    pg.mouse.move(cx,cy)
    for _ in range(N): pg.mouse.wheel(0,-240); pg.wait_for_timeout(40)
    pg.wait_for_timeout(120)
    st=lambda: pg.evaluate("(()=>{const i=document.querySelector('.spot-page img'),c=document.querySelector('.spot-detail'),p=document.querySelector('.spot-pin'),r=p&&p.getBoundingClientRect();return {imgNatural:i.naturalWidth,pageDevicePx:Math.round(i.getBoundingClientRect().width*devicePixelRatio),detail:c?getComputedStyle(c).visibility:null,pin:r?[Math.round(r.width),Math.round(r.height)]:null,pinText:p?p.textContent:null,svg:!!(p&&p.querySelector('svg'))}})()")
    print('just after zooming:',st()); soft=edge(pg.screenshot(clip={'x':cx-250,'y':cy-200,'width':500,'height':400}))
    pg.wait_for_timeout(2500); print('once settled:',st()); crisp=edge(pg.screenshot(clip={'x':cx-250,'y':cy-200,'width':500,'height':400})); pg.screenshot(path='spot_sharp.png')
    print('edge contrast in view: picture alone %.0f -> redrawn %.0f'%(soft,crisp))
    pg.mouse.down(); pg.mouse.move(cx+90,cy+40,steps=5); print('while dragging the sheet, detail layer:',st()['detail']); pg.mouse.up(); pg.wait_for_timeout(2000); print('after it stops:',st()['detail'])
    pg.click('.spot-menu .nb-menu-mark'); pg.wait_for_timeout(450); pg.click('.spot-menu .nb-menu-spot:has-text("Fit")'); pg.wait_for_timeout(1200); s=st(); bx=pg.locator('.spot-page').bounding_box(); print('fit:',s,'| page inside the screen:',bx['y']>=w['y']-1 and bx['y']+bx['height']<=w['y']+w['height']+1)
    print('errors:',errs)
