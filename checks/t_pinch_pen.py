"""With a pen as the way of writing, two fingers landing together still pinch the pad; a resting hand still does not."""
import math
from common import *
from t_touch import pad, visit
made=[]
extra={'site_visits':[visit],'note_pads':lambda r: pad if 'pgrst.object' in (r.headers.get('accept') or '') else [pad],'pad_marks':[],'POST:pad_marks':lambda r:(made.append(1),[])[1],'observations':[],'observation_types':[]}
with sync_playwright() as p:
    b=p.chromium.launch(channel='chrome'); ctx=b.new_context(**PHONE); install(ctx,extra); signed_in(ctx); ctx.add_init_script("localStorage.setItem('cazen.pen.seen','yes')")
    pg=ctx.new_page(); pg.goto(BASE); pg.wait_for_selector('text=Stand-in Office'); pg.click('.p-name'); pg.wait_for_timeout(300); pg.goto(BASE+'#/documents'); pg.goto(BASE+'#/field-notes/reports'); pg.click('.nb-toc button'); pg.wait_for_selector('.nb-pad'); pg.click('.nb-pad'); pg.wait_for_selector('.padview-frame'); pg.wait_for_timeout(600)
    cdp=ctx.new_cdp_session(pg)
    R=[28]
    def send(kind,pts): cdp.send('Input.dispatchTouchEvent',{'type':kind,'touchPoints':[{'x':x,'y':y,'radiusX':R[0],'radiusY':R[0],'force':0.5,'id':i} for (i,x,y) in pts]})
    view=lambda: pg.evaluate("(()=>{const e=[...document.querySelectorAll('.padview-frame *')].find(x=>/translate\\(/.test(x.style.transform||''));return e?e.style.transform:''})()")
    def nums(t): m=re.findall(r'-?[\d.]+',t); return [round(float(v),2) for v in m[:3]]
    def pinch(stagger=30):
        send('touchStart',[(1,150,400)]); pg.wait_for_timeout(stagger); send('touchStart',[(1,150,400),(2,250,500)]); pg.wait_for_timeout(30)
        for i in range(1,11): send('touchMove',[(1,150-i*6,400-i*6),(2,250+i*6,500+i*6)]); pg.wait_for_timeout(15)
        send('touchEnd',[]); pg.wait_for_timeout(600)
    pg.wait_for_timeout(500); v0=nums(view()); print('pen is how this person writes; fingers 56 px across')
    pinch(); v1=nums(view()); print('  two fingers spread ->',v0,'->',v1,'| zoomed in:',v1[2]>v0[2],'| strokes drawn:',len(made))
    send('touchStart',[(1,200,600)])
    for i in range(1,10): send('touchMove',[(1,200+i*10,600)]); pg.wait_for_timeout(15)
    send('touchEnd',[]); pg.wait_for_timeout(500); v2=nums(view()); print('  one wide contact alone, dragged -> view unchanged:',v2==v1)
    pinch(700); v3=nums(view()); print('  second finger 0.7 s after the first -> view unchanged:',v3==v2)
    R[0]=50; pinch(); v4=nums(view()); print('  two contacts 100 px across (a hand) -> view unchanged:',v4==v3)
    R[0]=12; pinch(); v5=nums(view()); print('  two narrow fingers -> zoomed in:',v5[2]>v4[2]); b.close()
