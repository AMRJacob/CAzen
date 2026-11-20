"""Pad text: an empty box goes away; the typing bar (bold, align, bullets, levels); side handles wrap, corner handles scale, the frame moves."""
from common import *
from t_touch import pad, visit
import json, re
posts=[]; patches=[]; gone=[]
def post(r):
    row=json.loads(r.post_data); row=row[0] if isinstance(row,list) else row; posts.append(row); return [row] if 'pgrst.object' not in (r.headers.get('accept') or '') else row
extra={'site_visits':[visit],'note_pads':lambda r: pad if 'pgrst.object' in (r.headers.get('accept') or '') else [pad],'pad_marks':[],'POST:pad_marks':post,'observations':[],'observation_types':[]}
with sync_playwright() as p:
    b=p.chromium.launch(channel='chrome'); ctx=b.new_context(viewport={'width':1300,'height':900}); install(ctx,extra); signed_in(ctx)
    def w(route):
        m=route.request.method
        if m=='PATCH': patches.append(json.loads(route.request.post_data)); return route.fulfill(status=204,body='')
        if m=='DELETE': gone.append(1); return route.fulfill(status=200,content_type='application/json',body='[]')
        route.fallback()
    ctx.route(re.compile(r'.*/rest/v1/pad_marks\?.*'),w)
    pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(BASE); pg.wait_for_selector('text=Stand-in Office'); pg.click('td.p-name'); pg.wait_for_timeout(300); pg.goto(BASE+'#/field-notes/reports'); pg.click('.nb-toc button'); pg.wait_for_selector('.nb-page'); pg.wait_for_timeout(400)
    pg.click('.nb-menu .nb-menu-mark'); pg.wait_for_timeout(450); pg.click('.nb-menu .nb-menu-spot:has-text("Sketch")'); pg.wait_for_selector('.padview'); pg.wait_for_timeout(700)
    if pg.locator('.padmenu.open').count()==0: pg.click('.padmenu > button'); pg.wait_for_timeout(400)
    pg.click('.padbar-key[aria-label="Type"]'); pg.wait_for_timeout(300)
    pg.mouse.click(500,300); pg.wait_for_selector('.pad-textbox'); pg.wait_for_timeout(500); pg.mouse.click(900,750); pg.wait_for_timeout(700)
    print('clicked, typed nothing, clicked away -> boxes left:',pg.locator('.pad-textbox').count(),'| deletes sent:',len(gone))
    pg.mouse.click(500,300); pg.wait_for_selector('.pad-textbox'); pg.wait_for_timeout(400)
    pg.keyboard.type('Doors'); pg.wait_for_timeout(300)
    print('bar while typing:',pg.evaluate("[...document.querySelectorAll('.padbar > button')].map(b=>b.getAttribute('aria-label'))"))
    def key(n): pg.locator('.pad-fmt[aria-label="%s"]'%n).dispatch_event('pointerdown'); pg.wait_for_timeout(200)
    key('Bold'); key('Bullets'); pg.keyboard.press('Enter'); pg.keyboard.type('Frames'); key('Level in'); key('Centre'); pg.wait_for_timeout(200)
    t=pg.evaluate("(()=>{const e=document.activeElement;const c=getComputedStyle(e);return {focused:e.classList.contains('pad-text'),text:e.innerText,weight:c.fontWeight,align:c.textAlign}})()"); print('after Bold, Bullets, Enter, Frames, Level in, Centre:',t)
    pg.keyboard.press('Enter'); pg.keyboard.press('Enter'); pg.keyboard.press('Enter'); pg.keyboard.type('x'); print('two empty Enters step out then end the list:',repr(pg.evaluate("document.activeElement.innerText")))
    pg.screenshot(path='padtype.png'); pg.keyboard.press('Escape'); pg.wait_for_timeout(800); print('Escape ends the typing:',pg.locator('.pad-fmt').count()==0)
    print('saved style:',[p_['style'] for p_ in patches if 'style' in p_][-1:], '| saved words:',[p_['body'] for p_ in patches if 'body' in p_][-1:])
    bx=pg.locator('.pad-textbox').first; g=lambda: bx.bounding_box(); fs=lambda: pg.evaluate("parseFloat(getComputedStyle(document.querySelector('.pad-text')).fontSize)*document.querySelector('.pad-text').getBoundingClientRect().width/document.querySelector('.pad-text').offsetWidth")
    print('handles:',pg.evaluate("[...document.querySelector('.pad-textbox').querySelectorAll('.pad-textgrip')].map(h=>h.className.replace('pad-textgrip ','')+' '+Math.round(h.getBoundingClientRect().width)+'px')"))
    def drag(sel,dx,dy):
        h=bx.locator(sel).bounding_box(); x=h['x']+h['width']/2; y=h['y']+h['height']/2; pg.mouse.move(x,y); pg.mouse.down(); pg.mouse.move(x+dx,y+dy,steps=5); pg.mouse.up(); pg.wait_for_timeout(400)
    a=g(); f0=fs(); drag('.pad-textgrip.side.e',80,0); c=g(); print('side handle +80: width %d -> %d | type %.1f -> %.1f px'%(a['width'],c['width'],f0,fs()))
    a=g(); f0=fs(); drag('.pad-textgrip.corner.se',int(a['width']*0.5),20); c=g(); print('corner handle +50%%: width %d -> %d | type %.1f -> %.1f px | top-left stayed: %s'%(a['width'],c['width'],f0,fs(),abs(a['x']-c['x'])<2 and abs(a['y']-c['y'])<2))
    a=g(); drag('.pad-textedge.n',60,40); c=g(); print('frame dragged 60,40: moved %d,%d'%(c['x']-a['x'],c['y']-a['y']),'| errors:',errs)
    pg.screenshot(path='padhandles.png'); b.close()
