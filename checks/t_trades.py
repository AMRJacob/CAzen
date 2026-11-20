"""The trade board: guesses placed, a tile dragged into a tray and filed, guesses kept, pan and zoom."""
from common import *
import json, re, sys
C='99999999-9999-4999-8999-999999999901'; A1='99999999-9999-4999-8999-99999999a001'
names=[('1','General Conditions',120000),('2','Concrete Footings',90000),('3','Masonry - Block',40000),('4','Roofing',80000),('5','Doors/Frames/Hardware',30000),
 ('6','Interior Drywall',50000),('7','Painting',20000),('8','Plumbing Rough-in',60000),('9','HVAC Ductwork',70000),('10','Electrical Rough-in',65000),('11','Sitework Odds and Ends',15000)]
lines=[{'id':'99999999-9999-4999-8999-%012d'%i,'contract_id':C,'sort':i,'item_no':n,'description':d,'scheduled_value':v,'retainage_rate':None,'change_order_id':None,'is_heading':False,'is_change_order':False,'divisions':None} for i,(n,d,v) in enumerate(names)]
lines[3]['divisions']=['07']
acts=[{'id':'77777777-7777-4777-8777-%012d'%i,'project_id':PROJ,'name':n,'is_heading':h,'starts_on':s,'ends_on':e,'percent':p,'sort':i,'divisions':None} for i,(n,h,s,e,p) in enumerate([
 ('Footings',False,'2026-01-05','2026-01-30',100),('Roof',False,'2026-03-01','2026-03-31',60),('Rough-In Plbg, Elec, HVAC',False,'2026-04-01','2026-05-15',40),('Punchlist',False,'2026-08-01','2026-08-10',0)])]
ex={'pay_contracts':lambda r: ({'id':C,'project_id':PROJ,'form':'g702','original_sum':640000,'retainage_work':5,'retainage_stored':5,'name':'General','contractor':'Builder','created_at':'2026-01-01T00:00:00Z'} if 'pgrst.object' in (r.headers.get('accept') or '') else [{'id':C,'project_id':PROJ,'form':'g702','original_sum':640000,'retainage_work':5,'retainage_stored':5,'name':'General','contractor':'Builder','created_at':'2026-01-01T00:00:00Z'}]),
 'sov_lines':lines,'retainage_steps':[],'pay_apps':[{'id':A1,'contract_id':C,'number':1,'period_to':'2026-04-30','applied_on':'2026-05-01','retainage_work':None,'retainage_stored':None,'status':'certified','certified_sum':None}],
 'pay_app_lines':[{'pay_app_id':A1,'sov_line_id':lines[1]['id'],'this_period':90000,'stored':0},{'pay_app_id':A1,'sov_line_id':lines[3]['id'],'this_period':60000,'stored':0}],
 'schedule_activities':acts,'schedule_activity_lines':[]}
patched=[]
def patch(r):
    patched.append((r.url.split('id=eq.')[-1][-4:], json.loads(r.post_data))); return []
ex['PATCH:sov_lines']=patch; ex['PATCH:schedule_activities']=patch
phone = len(sys.argv) > 1 and sys.argv[1] == 'phone'
with sync_playwright() as p:
    b=p.chromium.launch(channel='chrome'); ctx=b.new_context(**(PHONE if phone else {'viewport':{'width':1440,'height':900}})); install(ctx,ex); signed_in(ctx)
    pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(BASE); pg.wait_for_selector('text=Stand-in Office'); pg.click('text=Stand-in Office'); pg.wait_for_timeout(700)
    pg.goto(BASE+'#/trades'); pg.wait_for_selector('.trb-tray'); pg.wait_for_timeout(500)
    print('sub:', pg.inner_text('.trb-sub'))
    def tray_of(label):
        return pg.evaluate("""(l) => { const t=[...document.querySelectorAll('.trb-tile')].filter(x=>x.textContent.includes(l)).map(x=>{const r=x.getBoundingClientRect(); const tr=[...document.querySelectorAll('.trb-tray')].find(s=>{const q=s.getBoundingClientRect(); return r.left>=q.left&&r.right<=q.right&&r.top>=q.top&&r.bottom<=q.bottom}); return tr?tr.querySelector('.trb-num').textContent:'-'}); return t }""", label)
    for l in ['General Conditions','Roofing','Interior Drywall','Sitework Odds','Rough-In Plbg']: print(l, '->', tray_of(l))
    print('guess tiles:', pg.locator('.trb-tile.guess').count(), '| drifting:', pg.locator('.trb-tile.drift').count())
    print('tray 07 bars:', pg.locator('.trb-tray').filter(has=pg.locator('.trb-num', has_text=re.compile('^07$'))).locator('.trb-bar').all_inner_texts())
    pg.screenshot(path='trades.png')
    # drag the loose line into Division 32
    tile=pg.locator('.trb-tile.drift').filter(has_text='Sitework Odds').first; tb=tile.bounding_box()
    tray=pg.locator('.trb-tray').filter(has=pg.locator('.trb-num', has_text=re.compile('^32$'))).first; trb=tray.bounding_box()
    if phone:
        pg.evaluate("""([x0,y0,x1,y1]) => { const s=document.querySelector('.trb-stage'); const t=document.elementFromPoint(x0,y0); const ev=(type,x,y)=>new PointerEvent(type,{bubbles:true,pointerId:7,pointerType:'touch',clientX:x,clientY:y,isPrimary:true,button:0});
          t.dispatchEvent(ev('pointerdown',x0,y0)); return new Promise(res=>setTimeout(()=>{ for(let i=1;i<=10;i++) s.dispatchEvent(ev('pointermove',x0+(x1-x0)*i/10,y0+(y1-y0)*i/10)); s.dispatchEvent(ev('pointerup',x1,y1)); res() },320)) }""", [tb['x']+20,tb['y']+tb['height']/2,trb['x']+trb['width']/2,trb['y']+trb['height']/2])
    else:
        pg.mouse.move(tb['x']+20,tb['y']+tb['height']/2); pg.mouse.down(); pg.mouse.move(trb['x']+trb['width']/2,trb['y']+trb['height']/2,steps=12)
        pg.screenshot(path='trades_drag.png'); pg.mouse.up()
    pg.wait_for_timeout(500)
    print('after drag ->', tray_of('Sitework Odds'), '| sent:', patched[-1:])
    # keep the guesses from the corner menu
    pg.click('.trb-menu .nb-menu-mark'); pg.wait_for_timeout(300)
    pg.locator('.trb-menu .nb-menu-spot').filter(has_text='Keep').click(); pg.wait_for_timeout(800)
    print('kept guesses:', len(patched)-1, 'patches | guess tiles left:', pg.locator('.trb-tile.guess').count())
    before=pg.evaluate("getComputedStyle(document.querySelector('.trb-plane')).transform")
    pg.mouse.move(700,500); pg.mouse.wheel(0,-300); pg.wait_for_timeout(200)
    after=pg.evaluate("getComputedStyle(document.querySelector('.trb-plane')).transform")
    print('wheel zooms:', before!=after)
    z0=pg.evaluate("getComputedStyle(document.querySelector('.trb-plane')).transform")
    pg.evaluate("""() => { const s=document.querySelector('.trb-stage'); const ev=(type,id,x,y)=>new PointerEvent(type,{bubbles:true,pointerId:id,pointerType:'touch',clientX:x,clientY:y,button:0});
      s.dispatchEvent(ev('pointerdown',1,180,600)); s.dispatchEvent(ev('pointerdown',2,220,600));
      for(let i=1;i<=8;i++){ s.dispatchEvent(ev('pointermove',1,180-i*10,600)); s.dispatchEvent(ev('pointermove',2,220+i*10,600)) }
      s.dispatchEvent(ev('pointerup',1,100,600)); s.dispatchEvent(ev('pointerup',2,300,600)) }""")
    z1=pg.evaluate("getComputedStyle(document.querySelector('.trb-plane')).transform")
    print('pinch zooms:', z0, '->', z1, '| errors:', errs); b.close()
