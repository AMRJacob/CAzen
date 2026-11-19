import sys, math
from common import *
PAD='dddddddd-dddd-4ddd-8ddd-dddddddddddd'; V='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
pad={'id':PAD,'project_id':PROJ,'kind':'field_report','title':None,'noted_on':'2026-11-19','pages':1,'rule':'grid','rule_ink':40,'issued_id':None,'created_by':UID,'created_at':'2026-11-19T12:00:00Z','updated_at':'2026-11-19T12:00:00Z'}
visit={'id':V,'project_id':PROJ,'kind':'visit','visited_on':time.strftime('%Y-%m-%d'),'visited_at':'10:00:00','title':'Select check','weather':'Clear','notes':'','names':None,'photos':[],'photo_labels':{},'cover_photo':None,'pad_id':PAD,'issued_id':None,'created_at':'2026-11-19T12:00:00Z'}
made=[]; patched=[]; deleted=[]
def post(r):
    row=json.loads(r.post_data); row=dict(row,created_by=UID,created_at='2026-11-19T12:00:00Z'); made.append(row); return row
extra={'site_visits':[visit],'note_pads':lambda r: pad if 'pgrst.object' in (r.headers.get('accept') or '') else [pad],'pad_marks':[],'POST:pad_marks':post,'PATCH:pad_marks':lambda r:(patched.append(json.loads(r.post_data)),[])[1],'DELETE:pad_marks':lambda r:(deleted.append(r.url),[])[1],'observations':[],'observation_types':[]}
with sync_playwright() as p:
    b=p.chromium.launch(channel='chrome'); ctx=b.new_context(viewport={'width':1300,'height':900}); install(ctx,extra); signed_in(ctx)
    pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(BASE); pg.wait_for_selector('text=Stand-in Office'); pg.click('td.p-name'); pg.goto(BASE+'#/field-notes/reports'); pg.click('.nb-toc button'); pg.wait_for_selector('.nb-pad'); pg.click('.nb-pad'); pg.wait_for_selector('.padview-frame'); pg.wait_for_timeout(500)
    def line(y):
        pg.mouse.move(300,y); pg.mouse.down()
        for i in range(1,16): pg.mouse.move(300+i*20,y+8*math.sin(i/2))
        pg.mouse.up(); pg.wait_for_timeout(350)
    line(300); line(420)
    tool=lambda name: (pg.click('.padmenu-mark') if pg.locator('.padmenu.open').count()==0 else None, pg.click('button[aria-label="%s"]'%name), pg.wait_for_timeout(200))
    def red(x,y):
        d=pg.screenshot(clip={'x':x-6,'y':y-14,'width':12,'height':28}); 
        from PIL import Image; import io
        px=list(Image.open(io.BytesIO(d)).convert('RGB').getdata()); return sum(1 for r,g,b_ in px if r>150 and g<90 and b_<90)
    tool('Select'); pg.mouse.click(400,303); pg.wait_for_timeout(250); print('picked by a click:',pg.inner_text('.padsel-count'))
    before=red(400,303); pg.click('.padsel .pad-swatch[aria-label="Colour #c0392b"]'); pg.click('.padsel .pad-nib[aria-label="broad line"]'); pg.wait_for_timeout(400); pg.mouse.move(900,700)
    print('recoloured on the page: red pixels on the stroke %d → %d | saved'%(before,red(400,303)),[x['style'] for x in patched if 'style' in x][-1])
    pg.mouse.move(400,303); pg.mouse.down(); pg.mouse.move(430,520,steps=6); pg.mouse.up(); pg.wait_for_timeout(400)
    g=[x for x in patched if 'geometry' in x][-1]['geometry']['points']; print('moved: stroke now starts at y=%.3f (was %.3f) | red at new place %d, old place %d'%(g[0][1],made[0]['geometry']['points'][0][1],red(430,520),red(400,303)))
    pg.mouse.click(1000,150); pg.wait_for_timeout(200); pg.mouse.move(250,250); pg.mouse.down(); pg.mouse.move(700,600,steps=6); pg.mouse.up(); pg.wait_for_timeout(250); print('box round both:',pg.inner_text('.padsel-count')); pg.screenshot(path='select.png')
    pg.keyboard.press('Escape'); pg.wait_for_timeout(200); print('escape clears, pad stays open:',pg.locator('.padsel').count()==0 and pg.locator('.padview-frame').count()==1)
    tool('Pen'); pg.mouse.click(400,423,button='right'); pg.wait_for_timeout(250); print('right-click with the pen in hand:',pg.inner_text('.padsel-count')); pg.keyboard.press('Delete'); pg.wait_for_timeout(300); print('deleted:',len(deleted)==1)
    # text size
    tool('Type'); pg.mouse.move(760,200); pg.mouse.down(); pg.mouse.move(1050,260,steps=4); pg.mouse.up(); pg.wait_for_selector('.pad-textbox'); pg.keyboard.type('Verify slope to drain'); f0=pg.evaluate("document.querySelector('.pad-text').getBoundingClientRect().height")
    k=pg.locator('.pad-textgrip.size').bounding_box(); pg.mouse.move(k['x']+10,k['y']+10); pg.mouse.down(); pg.mouse.move(k['x']+10,k['y']-50,steps=5); pg.mouse.up(); pg.wait_for_timeout(300)
    print('text size grip dragged up 60 px: line height %.0f → %.0f px | saved size'%(f0,pg.evaluate("document.querySelector('.pad-text').getBoundingClientRect().height")),[round(x['style'].get('size',0),3) for x in patched if 'style' in x][-1]); pg.screenshot(path='textsize.png')
    print('errors:',errs[:3]); b.close()
