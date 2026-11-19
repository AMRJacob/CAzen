"""The pad at a desk: the wheel zooms, the wheel pressed drags, text can be moved, and a right-click offers cut, copy, paste, duplicate, delete."""
from common import *
from t_touch import pad, visit
marks=[]; patches=[]; deleted=[]
def post(r):
    row=json.loads(r.post_data); row=row if isinstance(row,dict) else row[0]; marks[:]=[m for m in marks if m['id']!=row['id']]+[row]; return []
extra={'site_visits':[visit],'note_pads':lambda r: pad if 'pgrst.object' in (r.headers.get('accept') or '') else [pad],'pad_marks':lambda r: marks,'POST:pad_marks':post,'observations':[],'observation_types':[]}
with sync_playwright() as p:
    b=p.chromium.launch(channel='chrome'); ctx=b.new_context(viewport={'width':1440,'height':900}); install(ctx,extra); signed_in(ctx)
    def rest(route):
        req=route.request
        if req.method=='PATCH': patches.append(json.loads(req.post_data)); return route.fulfill(status=204,body='')
        if req.method=='DELETE':
            ids=re.search(r'id=in\.\(([^)]*)\)',req.url.replace('%28','(').replace('%29',')').replace('%2C',',')); gone=[i.strip('"') for i in ids.group(1).split(',')] if ids else []; deleted.extend(gone); marks[:]=[m for m in marks if m['id'] not in gone]; return route.fulfill(status=204,body='')
        route.fallback()
    ctx.route(re.compile(r'.*/rest/v1/pad_marks.*'),rest)
    pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)[:200]))
    pg.goto(BASE); pg.wait_for_selector('text=Stand-in Office'); pg.click('.p-name'); pg.wait_for_timeout(300); pg.goto(BASE+'#/documents'); pg.goto(BASE+'#/field-notes/reports'); pg.click('.nb-toc button'); pg.wait_for_selector('.nb-pad'); pg.click('.nb-pad'); pg.wait_for_selector('.padview-frame'); pg.wait_for_timeout(700)
    view=lambda: [round(float(v),2) for v in re.findall(r'-?[\d.]+',pg.evaluate("document.querySelector('.pad-texts').style.transform"))[:3]]
    pg.mouse.move(500,400); pg.mouse.down(); pg.mouse.move(560,430,steps=5); pg.mouse.move(640,410,steps=5); pg.mouse.up(); pg.wait_for_timeout(500); print('drawn with the mouse:',len(marks),'mark')
    v0=view(); pg.mouse.move(700,450); pg.mouse.wheel(0,-300); pg.wait_for_timeout(200); v1=view(); pg.mouse.wheel(0,300); pg.wait_for_timeout(200); v2=view()
    print('wheel up: scale',v0[2],'→',v1[2],'| wheel down again →',v2[2],'| zoomed in then back:',v1[2]>v0[2] and abs(v2[2]-v0[2])<0.01)
    pg.mouse.move(700,450); pg.mouse.down(button='middle'); pg.mouse.move(780,500,steps=5); pg.mouse.up(button='middle'); pg.wait_for_timeout(200); v3=view(); print('wheel pressed and dragged 80, 50: view moved by',[round(v3[0]-v2[0]),round(v3[1]-v2[1])],'| nothing drawn:',len(marks)==1)
    sx,sy=560+80,430+50
    pg.mouse.click(sx,sy,button='right'); pg.wait_for_selector('.padctx'); print('right-click on the stroke:',[t.split('\n')[0] for t in pg.locator('.padctx button').all_inner_texts()]); pg.screenshot(path='padmenu.png',clip={'x':sx-80,'y':sy-80,'width':420,'height':360})
    pg.click('.padctx button:has-text("Duplicate")'); pg.wait_for_timeout(500); print('Duplicate:',len(marks),'marks')
    pg.mouse.click(sx,sy,button='right'); pg.click('.padctx button:has-text("Copy")'); pg.wait_for_timeout(200)
    pg.mouse.click(300,700,button='right'); pg.wait_for_selector('.padctx'); print('right-click on bare paper:',[t.split('\n')[0] for t in pg.locator('.padctx button').all_inner_texts()]); pg.click('.padctx button:has-text("Paste")'); pg.wait_for_timeout(500)
    print('Paste:',len(marks),'marks')
    pg.mouse.click(sx,sy,button='right'); pg.click('.padctx button:has-text("Cut")'); pg.wait_for_timeout(500); print('Cut:',len(marks),'marks | deleted on server:',len(deleted))
    pg.keyboard.press('Control+v'); pg.wait_for_timeout(500); print('Ctrl+V:',len(marks),'marks')
    pg.mouse.click(300,700,button='right'); pg.wait_for_timeout(200); pg.click('.padctx button:has-text("Delete")') if pg.locator('.padctx button:has-text("Delete")').count() else None; pg.wait_for_timeout(400); print('Delete from the menu:',len(marks),'marks')
    # text
    pg.click('.padmenu-mark'); pg.click('button[aria-label="Type"]'); pg.wait_for_timeout(200)
    pg.mouse.move(900,300); pg.mouse.down(); pg.mouse.move(1150,380,steps=5); pg.mouse.up(); pg.wait_for_selector('.pad-text'); pg.keyboard.type('Check slope'); pg.wait_for_timeout(200)
    tx=[m for m in marks if m['kind']=='text'][0]; g0=dict(tx['geometry'])
    gb=pg.locator('.pad-textgrip.move').first.bounding_box(); n=len(patches); cx,cy=gb['x']+gb['width']/2,gb['y']+gb['height']/2; pg.mouse.move(cx,cy); pg.mouse.down(); pg.mouse.move(cx+100,cy+60,steps=6); pg.mouse.up(); pg.wait_for_timeout(500)
    g1=[x.get('geometry') for x in patches[n:] if x.get('geometry')]; print('text dragged by its move grip: saved',bool(g1),'| moved right and down:',bool(g1) and g1[-1]['x']>g0['x'] and g1[-1]['y']>g0['y'],'| words kept:',any(x.get('body')=='Check slope' for x in patches) or tx.get('body'))
    pg.mouse.click(300,820); pg.wait_for_timeout(300); pg.click('.padmenu-mark'); pg.click('button[aria-label="Select"]'); pg.wait_for_timeout(200)
    bx=pg.locator('.pad-textbox').first.bounding_box(); n=len(patches); pg.mouse.move(bx['x']+40,bx['y']+20); pg.mouse.down(); pg.mouse.move(bx['x']+100,bx['y']+90,steps=6); pg.mouse.up(); pg.wait_for_timeout(500)
    g2=[x.get('geometry') for x in patches[n:] if x.get('geometry')]; print('with Select, text dragged by its body: saved',bool(g2),'| moved:',bool(g2) and g2[-1]['y']>g1[-1]['y'])
    print('errors:',errs[:3]); b.close()
