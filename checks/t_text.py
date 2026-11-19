import sys
from common import *
PAD='dddddddd-dddd-4ddd-8ddd-dddddddddddd'; V='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
pad={'id':PAD,'project_id':PROJ,'kind':'field_report','title':None,'noted_on':'2026-11-19','pages':1,'rule':'grid','rule_ink':40,'issued_id':None,'created_by':UID,'created_at':'2026-11-19T12:00:00Z','updated_at':'2026-11-19T12:00:00Z'}
visit={'id':V,'project_id':PROJ,'kind':'visit','visited_on':time.strftime('%Y-%m-%d'),'visited_at':'10:00:00','title':'Text check','weather':'Clear','notes':'','names':None,'photos':[],'photo_labels':{},'cover_photo':None,'pad_id':PAD,'issued_id':None,'created_at':'2026-11-19T12:00:00Z'}
made=[]; patched=[]
def post(r):
    row=json.loads(r.post_data); row=dict(row,id=row.get('id') or 'f0000001-0000-4000-8000-000000000000',created_by=UID,created_at='2026-11-19T12:00:00Z'); made.append(row); return row
extra={'site_visits':[visit],'note_pads':lambda r: pad if 'pgrst.object' in (r.headers.get('accept') or '') else [pad],'pad_marks':[],'POST:pad_marks':post,'PATCH:pad_marks':lambda r:(patched.append(json.loads(r.post_data)),[])[1],'observations':[],'observation_types':[]}
with sync_playwright() as p:
    b=p.chromium.launch(channel='chrome'); ctx=b.new_context(viewport={'width':1300,'height':900}); install(ctx,extra); signed_in(ctx)
    pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(BASE); pg.wait_for_selector('text=Stand-in Office'); pg.click('td.p-name'); pg.goto(BASE+'#/field-notes/reports'); pg.click('.nb-toc button'); pg.wait_for_selector('.nb-pad'); pg.click('.nb-pad'); pg.wait_for_selector('.padview-frame'); pg.wait_for_timeout(500)
    pg.click('.padmenu-mark'); pg.click('button[aria-label="Type"]'); pg.wait_for_timeout(200)
    pg.mouse.move(300,250); pg.mouse.down(); pg.mouse.move(420,300,steps=4); pg.screenshot(path='text_drag.png'); pg.mouse.move(560,330,steps=4); pg.mouse.up(); pg.wait_for_selector('.pad-textbox')
    print('focused for typing straight away:',pg.evaluate("document.activeElement?.classList.contains('pad-text')"))
    pg.keyboard.type('Hay bale at the north swale has been bypassed by runoff; contractor to reset and add a second row.')
    bx=pg.locator('.pad-textbox').bounding_box(); print('dragged 260 px wide → box %d px wide, text wrapped to %d px tall'%(bx['width'],bx['height']))
    pg.screenshot(path='text_typed.png')
    pg.mouse.click(900,700); pg.wait_for_timeout(400)   # elsewhere: blurs (and starts another box, which is the tool's job)
    g=pg.locator('.pad-textbox >> nth=0 >> .pad-textgrip.e').bounding_box(); pg.mouse.move(g['x']+g['width']/2,g['y']+g['height']/2); pg.mouse.down(); pg.mouse.move(g['x']+200,g['y']+10,steps=5); pg.mouse.up(); pg.wait_for_timeout(300)
    b2=pg.locator('.pad-textbox >> nth=0').bounding_box(); print('after dragging the grip 200 px: %d px wide, %d px tall'%(b2['width'],b2['height']))
    print('saved: geometry on create',{k:round(v,3) for k,v in made[0]['geometry'].items()},'| body saved:',any('body' in x and 'Hay bale' in x['body'] for x in patched),'| width saved:',[round(x['geometry']['w'],3) for x in patched if 'geometry' in x])
    pg.screenshot(path='text_wide.png')
    fs=pg.evaluate("(()=>{const e=document.querySelector('.pad-text');return [parseFloat(getComputedStyle(e).fontSize), +(e.getBoundingClientRect().height).toFixed(0)]})()"); print('type is laid out at %s px (was 0.03)'%fs[0])
    pg.click('.padmenu-mark') if pg.locator('.padmenu.open').count()==0 else None
    n0=pg.locator('.pad-textbox').count(); pg.click('button[aria-label="Undo"]'); pg.wait_for_timeout(300); n1=pg.locator('.pad-textbox').count()
    pg.click('.padmenu-mark') if pg.locator('.padmenu.open').count()==0 else None
    pg.click('button[aria-label="Redo"]'); pg.wait_for_timeout(300); n2=pg.locator('.pad-textbox').count(); print('text boxes: %d → undo %d → redo %d | redo posted with the same id: %s'%(n0,n1,n2,len(made)>=3 and made[-1]['id']==made[-2]['id']))
    print('errors:',errs[:3]); b.close()
