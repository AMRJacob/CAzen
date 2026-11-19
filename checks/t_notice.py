"""Signal lost inside a project: said plainly if the project is not on the device, silent if it is."""
from common import *
from t_fix import extra
pdf=open('sheet.pdf','rb').read()
with sync_playwright() as p:
    b=p.chromium.launch(channel='chrome'); ctx=b.new_context(**PHONE); install(ctx,extra); signed_in(ctx)
    ctx.route(re.compile(r'.*/functions/v1/files.*'), lambda r: r.fulfill(status=200,content_type='application/json',body=json.dumps({'url':'https://stand-in.supabase.co/blob/sheet.pdf','configured':True,'bytes':0,'objects':0,'by_project':{}})))
    ctx.route(re.compile(r'.*/blob/sheet\.pdf'), lambda r: r.fulfill(status=200,content_type='application/pdf',body=pdf))
    pg=ctx.new_page(); pg.goto(BASE); pg.wait_for_selector('text=Stand-in Office'); pg.tap('td.p-name'); pg.wait_for_timeout(300); pg.goto(BASE+'#/documents'); pg.wait_for_selector('text=A-101'); n=lambda: pg.locator('.offline-notice').count()
    a=n(); pg.tap('text=A-101 >> nth=0'); pg.wait_for_selector('.sheet-viewer'); pg.wait_for_timeout(1200)
    ctx.set_offline(True); pg.wait_for_timeout(500); print('in a project that is not downloaded — online:',a,'| signal lost, sheet open:',n(), '|', pg.inner_text('.offline-notice') if n() else '','| on top of the viewer:',pg.evaluate("(()=>{const e=document.querySelector('.offline-notice');if(!e)return false;const r=e.getBoundingClientRect();return document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)===e||e.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2))})()")); pg.screenshot(path='offline_notice.png')
    ctx.set_offline(False); pg.wait_for_timeout(500); print('signal back:',n())
    pg.tap('.sv-bar button[aria-label="Close"]'); pg.goto(BASE+'#/'); pg.wait_for_selector('tr.opens'); cdp=ctx.new_cdp_session(pg); bx=pg.locator('tr.opens').first.bounding_box()
    cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':bx['x']+80,'y':bx['y']+20,'id':1}]}); pg.wait_for_timeout(750); cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]}); pg.wait_for_timeout(900)
    pg.tap('.take-choices button >> nth=0'); pg.wait_for_function("document.querySelector('tr.opens').classList.contains('p-held')",timeout=30000)
    pg.tap('td.p-name'); pg.wait_for_timeout(300); pg.goto(BASE+'#/documents'); pg.wait_for_selector('text=A-101'); ctx.set_offline(True); pg.wait_for_timeout(600); print('downloaded project, signal lost — notice:',n(),'(0 = carries on quietly)'); b.close()
