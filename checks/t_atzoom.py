"""What a pad tool makes is sized for the zoom it is made at: the same on the glass, finer on the paper when zoomed in."""
from common import *
from t_touch import pad, visit
import json
made=[]
def post(r):
    row=json.loads(r.post_data); row=row[0] if isinstance(row,list) else row; made.append(row); return [row] if 'pgrst.object' not in (r.headers.get('accept') or '') else row
extra={'site_visits':[visit],'note_pads':lambda r: pad if 'pgrst.object' in (r.headers.get('accept') or '') else [pad],'pad_marks':[],'POST:pad_marks':post,'observations':[],'observation_types':[]}
scale="(()=>{const e=[...document.querySelectorAll('.padview-frame *')].find(x=>/translate\\(/.test(x.style.transform||''));return parseFloat(e.style.transform.match(/scale\\(([\\d.]+)\\)/)[1])*1000})()"
with sync_playwright() as p:
    b=p.chromium.launch(channel='chrome'); ctx=b.new_context(viewport={'width':1300,'height':900}); install(ctx,extra); signed_in(ctx)
    pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(BASE); pg.wait_for_selector('text=Stand-in Office'); pg.click('td.p-name'); pg.wait_for_timeout(300); pg.goto(BASE+'#/field-notes/reports'); pg.click('.nb-toc button'); pg.wait_for_selector('.nb-page'); pg.wait_for_timeout(400)
    pg.click('.nb-menu .nb-menu-mark'); pg.wait_for_timeout(450); pg.click('.nb-menu .nb-menu-spot:has-text("Sketch")'); pg.wait_for_selector('.padview'); pg.wait_for_timeout(700)
    def tool(name):
        if pg.locator('.padmenu.open').count()==0: pg.click('.padmenu > button'); pg.wait_for_timeout(400)
        pg.click('.padbar-key[aria-label="%s"]'%name); pg.wait_for_timeout(250)
    def stroke(y):
        n=len(made); pg.mouse.move(400,y); pg.mouse.down(); pg.mouse.move(520,y+10,steps=5); pg.mouse.up(); pg.wait_for_timeout(700); return made[-1] if len(made)>n else None
    labels=pg.evaluate("[...document.querySelectorAll('.padbar-key')].map(b=>b.getAttribute('aria-label'))"); pen='Pen'; txt='Type'
    rows=[]
    for step in ('as opened','zoomed in','zoomed out'):
        if step=='zoomed in':
            pg.mouse.move(650,450)
            for i in range(8): pg.mouse.wheel(0,-100); pg.wait_for_timeout(40)
        if step=='zoomed out':
            pg.mouse.move(650,450)
            for i in range(16): pg.mouse.wheel(0,100); pg.wait_for_timeout(40)
        pg.wait_for_timeout(500); sc=pg.evaluate(scale)
        tool(pen); m=stroke(300); w=m['style']['width']
        tool(txt); n=len(made); pg.mouse.click(700,560); pg.wait_for_timeout(700); t=made[-1] if len(made)>n else None
        pg.keyboard.type('Check'); pg.wait_for_timeout(200); fs=pg.evaluate("(()=>{const a=document.activeElement;return a?+a.getBoundingClientRect().height.toFixed(1):0})()"); pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
        rows.append((step,round(sc),w,round(w*sc,2),t['style'].get('size') if t else None,round((t['style'].get('size') or 0)*sc,1) if t else None,fs))
    for r in rows: print('%-11s zoom %5d | line width on paper %.5f = %s px on glass | type size on paper %s = %s px on glass (box %s px tall)'%r)
    pg.screenshot(path='atzoom.png'); print('errors:',errs); b.close()
