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
    def drag(dx=90,hold=True):
        send('touchStart',[(1,200,600)])
        for i in range(1,10): send('touchMove',[(1,200+i*dx/9,600)]); pg.wait_for_timeout(15)
        if hold: send('touchEnd',[]); pg.wait_for_timeout(500)
    pen="(t)=>{const f=document.querySelector('.padview-frame');f.dispatchEvent(new PointerEvent(t,{pointerType:'pen',pointerId:77,clientX:300,clientY:300,bubbles:true,cancelable:true,pressure:t==='pointerup'?0:0.5,button:0,buttons:t==='pointerup'?0:1,isPrimary:true}))}"
    pg.wait_for_timeout(1700); v0=nums(view()); print('pen is how this person writes; fingers 56 px across; pen away')
    pinch(); v1=nums(view()); print('  two fingers spread -> zoomed in:',v1[2]>v0[2],'| strokes drawn:',len(made))
    drag(); v2=nums(view()); print('  one finger dragged 90 px -> paper moved:',round(v2[0]-v1[0]),'px')
    drag(6); v3=nums(view()); print('  one finger shifting 6 px (a hand settling) -> view unchanged:',v3==v2)
    R[0]=40; drag(40,hold=False); mid=nums(view()); pg.evaluate(pen,'pointerdown'); pg.wait_for_timeout(200); v4=nums(view()); pg.evaluate(pen,'pointerup'); send('touchEnd',[]); pg.wait_for_timeout(300)
    print('  hand down first and moved the paper',round(mid[0]-v3[0]),'px, then the pen lands -> put back:',v4==v3)
    R[0]=28; drag(); v5=nums(view()); print('  wide finger just after the pen (within 1.5 s) -> view unchanged:',v5==v4)
    pg.wait_for_timeout(1700); R[0]=60; pinch(); v6=nums(view()); print('  two contacts 120 px across (a hand), pen away -> view unchanged:',v6==v5)
    R[0]=12; pinch(); v7=nums(view()); print('  two narrow fingers -> zoomed in:',v7[2]>v6[2],'| strokes drawn by all of this:',len(made)); b.close()
