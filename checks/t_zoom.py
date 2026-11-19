import sys
from common import *
import common
from t_fix import extra
pdf=open('dense.pdf','rb').read()
SAMPLER = """() => { window.__z = {frames:[], t0: performance.now()};
  const base = document.querySelector('.sv-detail').previousElementSibling, det = document.querySelector('.sv-detail');
  const ink = (c) => { if (!c.width || !c.height) return 0; const g = c.getContext('2d'); let n = 0;
    for (const fy of [0.3, 0.5, 0.7]) { const d = g.getImageData(0, Math.floor(c.height*fy), c.width, 1).data; for (let i = 0; i < d.length; i += 4) if (d[i+3] > 0 && d[i] < 200) n++ } return n / c.width };
  const loop = () => { window.__z.frames.push({t: performance.now() - window.__z.t0, ink: ink(base), w: base.width, det: det.style.display === 'block' ? det.width + 'x' + det.height + '@' + det.style.left : ''}); window.__zr = requestAnimationFrame(loop) }; loop() }"""
def run(base,label,cpu):
    with sync_playwright() as p:
        b=p.chromium.launch(channel='chrome'); ctx=b.new_context(viewport={'width':1440,'height':900},device_scale_factor=2); install(ctx,extra); signed_in(ctx)
        ctx.route(re.compile(r'.*/functions/v1/files.*'), lambda r: r.fulfill(status=200,content_type='application/json',body=json.dumps({'url':'https://stand-in.supabase.co/blob/sheet.pdf','configured':True,'bytes':0,'objects':0,'by_project':{}})))
        ctx.route(re.compile(r'.*/blob/sheet\.pdf'), lambda r: r.fulfill(status=200,content_type='application/pdf',body=pdf))
        pg=ctx.new_page(); pg.goto(base); pg.wait_for_selector('text=Stand-in Office'); pg.click('td.p-name'); pg.click('text=A-101 >> nth=0'); pg.wait_for_timeout(6000)
        cdp=ctx.new_cdp_session(pg); cdp.send('Emulation.setCPUThrottlingRate',{'rate':cpu})
        out=[]
        for step in range(3):
            pg.evaluate(SAMPLER); pg.click('button[aria-label="Zoom in"] >> nth=0'); pg.wait_for_timeout(5000*max(1,cpu//2))
            fr=pg.evaluate("(cancelAnimationFrame(window.__zr), window.__z.frames)")
            full=fr[-1]['ink']; gaps=[b2['t']-a['t'] for a,b2 in zip(fr,fr[1:])]
            first=fr[0]['det']; sharp=next((f['t'] for f in fr if f['det'] and f['det']!=first),None)
            blank_ms=sum(g for f,g in zip(fr,gaps) if f['ink']<0.5*full)
            out.append('zoom %d: drawing gone for %4.0f ms, longest frame %4.0f ms, sharp after %s ms, page canvas %s→%s px'%(step+1,blank_ms,max(gaps),'%4.0f'%sharp if sharp else '  — ',fr[0]['w'],fr[-1]['w']))
        print(label,'(CPU ÷%d)'%cpu); [print('  ',o) for o in out]; b.close()
cpu=int(sys.argv[1]) if len(sys.argv)>1 else 1
run(BASE,'now',cpu)   # to compare, serve an older build on another port and run() it too
