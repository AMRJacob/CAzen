"""Pad pictures: a photo added to draw over, a clip cut from a drawing, and a page's photograph sent to the pad."""
from common import *
from t_touch import pad, visit
import t_fix, json, re, copy
posts=[]; patches=[]; gone=[]
def post(r):
    row=json.loads(r.post_data); row=row[0] if isinstance(row,list) else row; posts.append(row); return [row] if 'pgrst.object' not in (r.headers.get('accept') or '') else row
ex=copy.deepcopy(t_fix.extra); v=dict(visit); 
ex.update({'site_visits':[v],'note_pads':lambda r: pad if 'pgrst.object' in (r.headers.get('accept') or '') else [pad],'pad_marks':[],'POST:pad_marks':post,'observations':[],'observation_types':[]})
pdf=open('sheet.pdf','rb').read(); jpg=open('site.jpg','rb').read()
with sync_playwright() as p:
    b=p.chromium.launch(channel='chrome'); ctx=b.new_context(viewport={'width':1300,'height':900}); install(ctx,ex); signed_in(ctx)
    ctx.route(re.compile(r'.*/functions/v1/files.*'), lambda r: r.fulfill(status=200,content_type='application/json',body=json.dumps({'url':'https://stand-in.supabase.co/blob/'+('sheet.pdf' if 'pdf' in (r.request.post_data or '') else 'site.jpg'),'configured':True,'exists':False})))
    ctx.route(re.compile(r'.*/blob/sheet\.pdf'), lambda r: r.fulfill(status=200,content_type='application/pdf',body=pdf))
    ctx.route(re.compile(r'.*/blob/site\.jpg'), lambda r: r.fulfill(status=200,content_type='image/jpeg',body=jpg))
    def w(route):
        m=route.request.method
        if m=='PATCH': patches.append(json.loads(route.request.post_data)); return route.fulfill(status=204,body='')
        if m=='DELETE': gone.append(1); return route.fulfill(status=200,content_type='application/json',body='[]')
        route.fallback()
    ctx.route(re.compile(r'.*/rest/v1/pad_marks\?.*'),w)
    pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(BASE); pg.wait_for_selector('text=Stand-in Office'); pg.click('td.p-name'); pg.wait_for_timeout(300); pg.goto(BASE+'#/field-notes/reports'); pg.click('.nb-toc button'); pg.wait_for_selector('.nb-page'); pg.wait_for_timeout(400)
    pg.click('.nb-menu .nb-menu-mark'); pg.wait_for_timeout(450); pg.click('.nb-menu .nb-menu-spot:has-text("Sketch")'); pg.wait_for_selector('.padview'); pg.wait_for_timeout(700)
    def menu(name=None):
        if pg.locator('.padmenu.open').count()==0: pg.click('.padmenu > button'); pg.wait_for_timeout(400)
        if name: pg.click('.padbar-key[aria-label="%s"]'%name); pg.wait_for_timeout(300)
    menu('More'); print('More offers:',[t for t in pg.locator('.padpop-word').all_inner_texts() if 'photo' in t.lower() or 'Clip' in t])
    pg.set_input_files('.padpop input[type=file]','site.jpg'); pg.wait_for_selector('.pad-pic img',timeout=15000); pg.wait_for_timeout(600)
    pic=posts[-1]; bx=pg.locator('.pad-pic').first.bounding_box()
    print('photo added: kind',pic['kind'],'| file',pic['style'].get('image','')[-28:],'| on screen %dx%d (photo is 3:2)'%(bx['width'],bx['height']),'| picked with handles:',pg.locator('.pad-picframe .pad-textgrip').count())
    h=pg.locator('.pad-picframe .pad-textgrip.se').bounding_box(); pg.mouse.move(h['x']+5,h['y']+5); pg.mouse.down(); pg.mouse.move(h['x']+105,h['y']+60,steps=5); pg.mouse.up(); pg.wait_for_timeout(400); b2=pg.locator('.pad-pic').first.bounding_box()
    print('corner dragged +100: %dx%d -> %dx%d, shape kept: %s'%(bx['width'],bx['height'],b2['width'],b2['height'],abs(b2['width']/b2['height']-1.5)<0.02))
    menu('Pen'); n=len(posts); cx=b2['x']+b2['width']/2; cy=b2['y']+b2['height']/2; pg.mouse.move(cx-60,cy); pg.mouse.down(); pg.mouse.move(cx+60,cy+20,steps=6); pg.mouse.up(); pg.wait_for_timeout(600)
    print('drawn over it: stroke kept',len(posts)==n+1 and posts[-1]['kind']=='ink','| picture still there',pg.locator('.pad-pic').count()==1)
    menu('Erase'); pg.mouse.move(cx-200,cy-80); pg.mouse.down(); pg.mouse.move(cx-150,cy-60,steps=4); pg.mouse.up(); pg.wait_for_timeout(500); print('eraser rubbed on bare picture: picture still there',pg.locator('.pad-pic').count()==1,'| deletes',len(gone))
    pg.screenshot(path='padpic.png')
    menu('More'); pg.click('.padpop-word:has-text("Clip from a drawing")'); pg.wait_for_selector('.clip .spot-list li'); pg.locator('.clip .spot-list li button').first.click(); pg.wait_for_selector('.clip-page img',timeout=30000); pg.wait_for_timeout(400)
    r=pg.locator('.clip-page img').bounding_box(); pg.mouse.move(r['x']+r['width']*0.2,r['y']+r['height']*0.2); pg.mouse.down(); pg.mouse.move(r['x']+r['width']*0.7,r['y']+r['height']*0.6,steps=5); pg.mouse.up(); pg.screenshot(path='padclip.png')
    n=len(posts); pg.click('.clip button.primary'); pg.wait_for_selector('.clip',state='detached',timeout=30000); pg.wait_for_timeout(1200)
    c=posts[-1]; g=c['geometry']; print('clip placed:',len(posts)==n+1,'| file',c['style'].get('image','')[-30:],'| shape w/h %.2f (box was %.2f)'%(g['w']/g['h'],(0.5*r['width'])/(0.4*r['height'])),'| pictures on the pad:',pg.locator('.pad-pic').count(),'| errors:',errs)
    b.close()
