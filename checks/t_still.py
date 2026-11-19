import sys, math
from common import *
PAD='dddddddd-dddd-4ddd-8ddd-dddddddddddd'; V='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
pad={'id':PAD,'project_id':PROJ,'kind':'field_report','title':None,'noted_on':'2026-11-19','pages':1,'rule':'grid','rule_ink':40,'issued_id':None,'created_by':UID,'created_at':'2026-11-19T12:00:00Z','updated_at':'2026-11-19T12:00:00Z'}
def mark(i,kind,pts,colour='#2b2d2c',width=0.003): return {'id':'f%07d-0000-4000-8000-000000000000'%i,'pad_id':PAD,'project_id':PROJ,'page':1,'kind':kind,'geometry':{'points':pts},'style':{'colour':colour,'width':width},'body':None,'created_by':UID,'created_at':'2026-11-19T12:00:00Z'}
wave=[[0.20+i*0.004, 0.30+0.03*math.sin(i/6), 0.24] for i in range(120)]
box=[[0.25,0.45,0.3],[0.55,0.45,0.3],[0.55,0.62,0.3],[0.25,0.62,0.3],[0.25,0.45,0.3]]
marks=[mark(1,'ink',wave),mark(2,'ink',box),mark(3,'ink',[[0.40,0.38,0.24]]),mark(4,'highlight',[[0.50,0.40,0.3]],'#c9d9f2',0.02),mark(5,'ink',[[0.62,0.50,0.24]])]
visit={'id':V,'project_id':PROJ,'kind':'visit','visited_on':time.strftime('%Y-%m-%d'),'visited_at':'10:00:00','title':'Sketch check','weather':'Clear','notes':'1. Notes\n  a. ','names':None,'photos':[],'photo_labels':{},'cover_photo':None,'pad_id':PAD,'issued_id':None,'created_at':'2026-11-19T12:00:00Z'}
extra={'site_visits':[visit],'note_pads':lambda r: pad if 'pgrst.object' in (r.headers.get('accept') or '') else [pad],'pad_marks':marks}
def run(base,label):
    with sync_playwright() as p:
        b=p.chromium.launch(channel='chrome'); ctx=b.new_context(viewport={'width':1440,'height':1000}); install(ctx,extra); signed_in(ctx)
        pg=ctx.new_page(); pg.goto(base); pg.wait_for_selector('text=Stand-in Office'); pg.click('td.p-name'); pg.goto(base+'#/field-notes/reports'); pg.click('.nb-toc button'); pg.wait_for_selector('.nb-pad .pad-still path',timeout=8000); pg.wait_for_timeout(500)
        r=pg.evaluate("""(()=>{const f=document.querySelector('.nb-pad').getBoundingClientRect(), s=document.querySelector('.nb-pad .pad-still').getBoundingClientRect();
          const big=[...document.querySelectorAll('.nb-pad .pad-still > path')].map(p=>{const b=p.getBoundingClientRect();return Math.max(b.width/s.width,b.height/s.height)});
          return {frame:[Math.round(f.width),Math.round(f.height)], still:[Math.round(s.width),Math.round(s.height)], largest: big.map(x=>+x.toFixed(2))}})()""")
        pg.locator('.nb-pad').screenshot(path='still_%s.png'%label)
        from PIL import Image
        im=Image.open('still_%s.png'%label).convert('RGB'); px=list(im.getdata()); blue=sum(1 for (R,G,B) in px if abs(R-0xc9)<22 and abs(G-0xd9)<22 and abs(B-0xf2)<22 and B>R+20)/len(px)
        print(label,'| frame',r['frame'],'still',r['still'],'| each stroke as a share of the picture (wave, box, tap, highlighter tap, tap):',r['largest'],'| highlighter covers %.0f%% of the picture'%(blue*100)); b.close()
for a in sys.argv[1:]: run(a.split('=')[1],a.split('=')[0])
