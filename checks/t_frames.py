import sys
from common import *
from t_fix import extra
pdf=open('dense.pdf','rb').read()
REC="""() => { const f=[]; let last=performance.now(); window.__stop=false; const loop=()=>{const n=performance.now(); f.push(n-last); last=n; if(!window.__stop) requestAnimationFrame(loop)}; requestAnimationFrame(loop); window.__f=f }"""
def stats(fr):
    fr=fr[2:]; n=len(fr); slow=[x for x in fr if x>34]; fr2=sorted(fr)
    return 'frames %3d, dropped(>34ms) %3d, p95 %4.0f ms, worst %4.0f ms'%(n,len(slow),fr2[int(n*0.95)] if n else 0,max(fr) if fr else 0)
def run(base,label,cpu):
    with sync_playwright() as p:
        b=p.chromium.launch(channel='chrome'); ctx=b.new_context(viewport={'width':1440,'height':900},device_scale_factor=2); install(ctx,extra); signed_in(ctx)
        ctx.route(re.compile(r'.*/functions/v1/files.*'), lambda r: r.fulfill(status=200,content_type='application/json',body=json.dumps({'url':'https://stand-in.supabase.co/blob/sheet.pdf','configured':True,'bytes':0,'objects':0,'by_project':{}})))
        ctx.route(re.compile(r'.*/blob/sheet\.pdf'), lambda r: r.fulfill(status=200,content_type='application/pdf',body=pdf))
        pg=ctx.new_page(); pg.goto(base); pg.wait_for_selector('text=Stand-in Office'); pg.click('td.p-name'); pg.wait_for_timeout(300); pg.goto(base+'#/documents'); pg.click('text=A-101 >> nth=0'); pg.wait_for_timeout(7000)
        cdp=ctx.new_cdp_session(pg); cdp.send('Emulation.setCPUThrottlingRate',{'rate':cpu})
        print(label,'(CPU ÷%d)'%cpu)
        # wheel zoom in, 90 events
        pg.mouse.move(800,450); pg.evaluate(REC)
        for i in range(90): pg.mouse.wheel(0,-30); pg.wait_for_timeout(14)
        pg.evaluate("window.__stop=true"); pg.wait_for_timeout(100); print('   zoom in :',stats(pg.evaluate("window.__f")))
        pg.wait_for_timeout(400)  # a pause, as a hand makes — long enough for a sharpen to start
        pg.evaluate(REC); pg.mouse.down()
        for i in range(90): pg.mouse.move(800-i*4,450-i*2); pg.wait_for_timeout(14)
        pg.mouse.up(); pg.evaluate("window.__stop=true"); pg.wait_for_timeout(100); print('   pan     :',stats(pg.evaluate("window.__f")))
        pg.wait_for_timeout(300); pg.evaluate(REC)
        for i in range(60): pg.mouse.wheel(0,30); pg.wait_for_timeout(14)
        pg.evaluate("window.__stop=true"); pg.wait_for_timeout(100); print('   zoom out:',stats(pg.evaluate("window.__f")))
        b.close()
cpu=int(sys.argv[1]) if len(sys.argv)>1 else 4
for base,label in [(a.split('=')[1],a.split('=')[0]) for a in sys.argv[2:]] or [(BASE,'now')]: run(base,label,cpu)
