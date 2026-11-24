"""A folding phone opened mid-use: start at phone size, widen the window (as unfolding does), and tap each corner menu.
Reports whether a tap opens it and, if not, what element is on top at the mark's centre."""
from common import *
import json, sys
V={'id':'cccccccc-cccc-4ccc-8ccc-ccccccccc001','project_id':PROJ,'kind':'visit','visited_on':'2026-11-18','visited_at':'15:00:00','title':'Walk','weather':'x','names':None,'notes':'1. Structure\n  a. x','photos':[],'photo_labels':{},'pad_id':None,'issued_id':None,'location':None,'widgets':{},'created_at':'2026-11-18T15:00:00Z'}
SIZES=[tuple(int(v) for v in a.split('x')) for a in sys.argv[1:]] or [(680,874),(820,874),(744,1133),(884,1100)]
OPEN_FIRST=True
def probe(pg,sel,opened):
    m=pg.locator(sel).first
    if not m.count() or not m.is_visible(): return 'not shown'
    bb=m.bounding_box(); x,y=bb['x']+bb['width']/2,bb['y']+bb['height']/2
    top=pg.evaluate("([x,y])=>{const e=document.elementFromPoint(x,y);return e?(e.closest('button,nav,[class]')?.className?.toString()||e.tagName).slice(0,60):'none'}",[x,y])
    pg.touchscreen.tap(x,y); pg.wait_for_timeout(450)
    ok=pg.locator(opened).count()>0
    r=('opens' if ok else f'DOES NOT OPEN (on top: {top})')+f' @({round(x)},{round(y)})'
    if ok: pg.touchscreen.tap(x+200 if x<300 else 20, 300); pg.wait_for_timeout(300)
    return r
with sync_playwright() as p:
    b=p.chromium.launch()
    for W,H in SIZES:
        ctx=b.new_context(viewport={'width':402,'height':874},device_scale_factor=3,is_mobile=True,has_touch=True)
        install(ctx,{'site_visits':lambda r:[V],'note_pads':[],'pad_marks':[],'observations':[],'observation_types':[],'project_people':[],'notebook_layouts':lambda r:None}); signed_in(ctx)
        pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
        pg.goto(BASE); pg.wait_for_selector('text=Stand-in Office'); pg.locator('.p-card, td.p-name').first.tap(); pg.wait_for_timeout(700)
        res={}
        for where,go in (('overview',lambda: pg.goto(BASE+'#/project')),('contents',lambda: pg.goto(BASE+'#/field-notes/reports')),('page',None)):
            if go: go(); pg.wait_for_timeout(900)
            else:
                if not pg.locator('.nb-toc li button').count(): pg.goto(BASE+'#/field-notes/reports'); pg.wait_for_timeout(900)
                pg.locator('.nb-toc li button').first.tap(); pg.wait_for_timeout(900)
            sel,op=(('.phone-nav .pn-mark','.phone-nav.open') if where=='overview' else ('.nb-menu .nb-menu-mark','.nb-menu.open'))
            before=probe(pg,sel,op)
            pg.set_viewport_size({'width':W,'height':H}); pg.wait_for_timeout(700)
            inframe=pg.evaluate("(s)=>{const m=document.querySelector(s);return m?(m.closest('.nb-paper')?'inside the page':(m.closest('.nb')?'in the notebook frame':'app')):'-'}", sel.split(' ')[0])
            after=probe(pg,sel,op)+' · menu drawn '+inframe
            res[where]=(before,after); print(f'  [{W}x{H}] {where}: phone {before} | unfolded {after} | at {pg.url.split("#")[1]}')
            pg.set_viewport_size({'width':402,'height':874}); pg.wait_for_timeout(500)
        print('  errors',errs[:2])
        ctx.close()
    b.close()
