"""Pad: the arrow tool, a leader from a text box, six colours, and contrast."""
import sys
from common import *
from t_touch import pad, visit
import t_fix, json, re, copy
posts=[]; patches=[]; padpatch=[]
def post(r):
    row=json.loads(r.post_data); row=row[0] if isinstance(row,list) else row; posts.append(row); return [row] if 'pgrst.object' not in (r.headers.get('accept') or '') else row
ex=copy.deepcopy(t_fix.extra); v=dict(visit)
ex.update({'site_visits':[v],'note_pads':lambda r: pad if 'pgrst.object' in (r.headers.get('accept') or '') else [pad],'pad_marks':[],'POST:pad_marks':post,'observations':[],'observation_types':[]})
with sync_playwright() as p:
    b=p.chromium.launch(channel='chrome'); ctx=b.new_context(**(PHONE if __import__('os').environ.get('PHONE') else {'viewport':{'width':1300,'height':900}})); install(ctx,ex); signed_in(ctx)
    def w(route):
        if route.request.method=='PATCH': patches.append(json.loads(route.request.post_data)); return route.fulfill(status=204,body='')
        route.fallback()
    def wp(route):
        if route.request.method=='PATCH': padpatch.append(json.loads(route.request.post_data)); return route.fulfill(status=204,body='')
        route.fallback()
    ctx.route(re.compile(r'.*/rest/v1/pad_marks\?.*'),w); ctx.route(re.compile(r'.*/rest/v1/note_pads\?.*'),wp)
    pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(BASE); pg.wait_for_selector('text=Stand-in Office'); pg.click('td.p-name'); pg.wait_for_timeout(300); pg.goto(BASE+'#/field-notes/reports'); pg.click('.nb-toc button'); pg.wait_for_selector('.nb-page'); pg.wait_for_timeout(400)
    pg.click('.nb-menu .nb-menu-mark'); pg.wait_for_timeout(450); pg.click('.nb-menu .nb-menu-spot:has-text("Sketch")'); pg.wait_for_selector('.padview'); pg.wait_for_timeout(700)
    def menu(name=None):
        if pg.locator('.padmenu.open').count()==0: pg.click('.padmenu > button'); pg.wait_for_timeout(400)
        if name: pg.click('.padbar-key[aria-label="%s"]'%name); pg.wait_for_timeout(300)
    menu(); pg.screenshot(path='padtools_bar.png'); print('bar fits:', pg.evaluate("(() => { const b=document.querySelector('.padmenu').getBoundingClientRect(); const k=[...document.querySelectorAll('.padmenu .padbar-key, .padmenu .padbar-ink')].map(e=>e.getBoundingClientRect()); return [Math.round(b.right), innerWidth, Math.round(Math.max(...k.map(r=>r.right))), k.length] })()"))
    menu('Arrow')
    pg.mouse.move(400,500); pg.mouse.down(); pg.mouse.move(520,420,steps=8); pg.mouse.move(600,380,steps=8); pg.mouse.up(); pg.wait_for_timeout(700)
    a=posts[-1]; print('arrow saved:', a['kind'], a['style'].get('arrow'), 'points:', len(a['geometry']['points']))
    menu(); pg.click('.padbar-ink'); pg.wait_for_timeout(300); print('colours offered:', pg.locator('.padpop .pad-swatch').count()); pg.click('.padbar-ink'); pg.wait_for_timeout(200)
    if __import__('os').environ.get('PHONE'): print('errors:', errs); b.close(); raise SystemExit
    menu('Type'); pg.mouse.click(700,300); pg.wait_for_timeout(500); pg.keyboard.type('Crack at sill'); pg.wait_for_timeout(200)
    menu(); keys=pg.locator('.padbar-key[aria-label="Leader"]').count(); print('Leader key while typing:', keys)
    pg.click('.padbar-key[aria-label="Leader"]'); pg.wait_for_timeout(500)
    print('asks:', pg.locator('.pad-leading').inner_text() if pg.locator('.pad-leading').count() else None)
    pg.mouse.click(560,560); pg.wait_for_timeout(800)
    lead=[x for x in patches if 'style' in x and x['style'].get('leaders')]
    print('leader saved:', lead[-1]['style']['leaders'] if lead else None, '| dots shown:', pg.locator('.pad-leaderdot').count())
    pg.screenshot(path='padtools.png')
    menu('More'); pg.locator('label:has-text("Contrast") input').check(); pg.wait_for_timeout(500)
    print('contrast sent:', padpatch[-1:] , '| text layer:', pg.locator('.pad-texts.contrast').count())
    pg.keyboard.press('Escape'); pg.screenshot(path='padtools_contrast.png')
    print('errors:', errs); b.close()
