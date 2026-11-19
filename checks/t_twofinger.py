"""With fingers drawing on the pad: one finger draws, two move and zoom the paper and draw nothing."""
import math
from common import *
from t_touch import pad, visit
made=[]
extra={'site_visits':[visit],'note_pads':lambda r: pad if 'pgrst.object' in (r.headers.get('accept') or '') else [pad],'pad_marks':[],'POST:pad_marks':lambda r:(made.append(1),[])[1],'observations':[],'observation_types':[]}
with sync_playwright() as p:
    b=p.chromium.launch(channel='chrome'); ctx=b.new_context(**PHONE); install(ctx,extra); signed_in(ctx)
    pg=ctx.new_page(); pg.goto(BASE); pg.wait_for_selector('text=Stand-in Office'); pg.click('.p-name'); pg.wait_for_timeout(300); pg.goto(BASE+'#/documents'); pg.goto(BASE+'#/field-notes/reports'); pg.click('.nb-toc button'); pg.wait_for_selector('.nb-pad'); pg.click('.nb-pad'); pg.wait_for_selector('.padview-frame'); pg.wait_for_timeout(600)
    cdp=ctx.new_cdp_session(pg)
    def send(kind,pts): cdp.send('Input.dispatchTouchEvent',{'type':kind,'touchPoints':[{'x':x,'y':y,'radiusX':12,'radiusY':12,'force':0.5,'id':i} for (i,x,y) in pts]})
    view=lambda: pg.evaluate("(()=>{const e=[...document.querySelectorAll('.padview-frame *')].find(x=>/translate\\(/.test(x.style.transform||''));return e?e.style.transform:''})()")
    def nums(t): m=re.findall(r'-?[\d.]+',t); return [round(float(v),2) for v in m[:3]]
    send('touchStart',[(1,80,300)])
    for i in range(1,12): send('touchMove',[(1,80+i*18,300+6*math.sin(i))]); pg.wait_for_timeout(12)
    send('touchEnd',[]); pg.wait_for_timeout(600); v0=nums(view()); print('one finger:',len(made),'stroke kept | view',v0)
    send('touchStart',[(1,150,400)]); pg.wait_for_timeout(30); send('touchMove',[(1,156,404)]); pg.wait_for_timeout(30)
    send('touchStart',[(1,156,404),(2,250,500)]); pg.wait_for_timeout(30)
    for i in range(1,11): send('touchMove',[(1,156-i*6,404-i*6+i*8),(2,250+i*6,500+i*6+i*8)]); pg.wait_for_timeout(15)
    send('touchEnd',[]); pg.wait_for_timeout(700); v1=nums(view())
    print('two fingers spread and dragged down:',len(made),'stroke(s) kept (still 1 = nothing drawn) | view',v1,'| zoomed in:',v1[2]>v0[2],'| moved:',v1[:2]!=v0[:2])
    send('touchStart',[(1,90,560)])
    for i in range(1,12): send('touchMove',[(1,90+i*14,560)]); pg.wait_for_timeout(12)
    send('touchEnd',[]); pg.wait_for_timeout(600); print('one finger again:',len(made),'strokes kept | view unchanged:',nums(view())==v1); b.close()
