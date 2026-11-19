import sys, io, base64
from common import *
from PIL import Image, ImageDraw
V='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1'
shapes=[(1600,1200),(1600,1200),(1200,1600),(1600,1200),(1920,1080),(1200,1600),(1200,1600),(1600,1200),(1400,1400),(1600,1200),(1600,1200)]
cols=['#6b7f6a','#8a3b2c','#2f3a52','#b08d3c','#4a6a7a','#7a4a6a','#3f5a48','#946a3a','#555','#3a6a5a','#6a3a3a']
imgs={}
for i,(w,h) in enumerate(shapes):
    im=Image.new('RGB',(w,h),cols[i]); d=ImageDraw.Draw(im)
    for k in range(0,w,200): d.line([(k,0),(k,h)],fill='#ffffff',width=2)
    for k in range(0,h,200): d.line([(0,k),(w,k)],fill='#ffffff',width=2)
    d.rectangle([w*0.5,h*0.25,w*0.95,h*0.75],outline='#ffd54a',width=14); d.text((w*0.55,h*0.3),'KEEP %d'%(i+1),fill='#fff',font_size=110)
    b=io.BytesIO(); im.save(b,'JPEG',quality=80); imgs['p%d.jpg'%(i+1)]=b.getvalue()
paths=['r2:%s/CAzen/Photos/p%d.jpg'%(PROJ,i+1) for i in range(len(shapes))]
labels={paths[0]:'North elevation, storefront',paths[1]:'Roof deck',paths[2]:'Erosion control at hay bale near the existing dumpster area draining toward the lake',paths[4]:'Slab pour'}
visit={'id':V,'project_id':PROJ,'kind':'visit','visited_on':time.strftime('%Y-%m-%d'),'visited_at':'10:00:00','title':'OAC walk','weather':'Clear','location':None,'notes':'1. Site\n  a. Cleared.','names':None,'photos':paths,'photo_labels':labels,'cover_photo':None,'pad_id':None,'issued_id':None,'created_at':'2026-11-19T12:00:00Z'}
extra={'site_visits':[visit],'observations':[],'observation_types':[]}
with sync_playwright() as p:
    b=p.chromium.launch(channel='chrome'); ctx=b.new_context(viewport={'width':1440,'height':1000},accept_downloads=True); install(ctx,extra); signed_in(ctx)
    def files(r):
        m=re.search(r'p\d+\.jpg',r.request.post_data or ''); r.fulfill(status=200,content_type='application/json',body=json.dumps({'url':'https://stand-in.supabase.co/blob/'+(m.group(0) if m else 'x'),'key':'k','configured':True}))
    ctx.route(re.compile(r'.*/functions/v1/files.*'), files)
    ctx.route(re.compile(r'.*/blob/.*'), lambda r: r.fulfill(status=200,content_type='image/jpeg',body=imgs.get(r.request.url.split('/')[-1],b'')))
    pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('console',lambda m: errs.append(m.text) if m.type=='error' else None)
    pg.goto(BASE); pg.wait_for_selector('text=Stand-in Office'); pg.click('td.p-name'); pg.goto(BASE+'#/field-notes')
    pg.wait_for_selector('.nb-toc button'); print('bare /field-notes lands on:',pg.url.split('#')[1])
    pg.click('.nb-toc button'); pg.wait_for_selector('.nb-page'); pg.click('button:has-text("Make the field report")'); pg.wait_for_selector('.psheet')
    pg.check('.psheet-on input'); pg.wait_for_function("document.querySelectorAll('.psheet-cell').length===11",timeout=15000); pg.wait_for_timeout(400)
    pg.locator('.psheet').screenshot(path='psheet_2.png'); print('2 a row:',pg.inner_text('.psheet-count'))
    pg.click('.psheet-bar .chip:has-text("3")'); pg.wait_for_timeout(300); print('3 a row:',pg.inner_text('.psheet-count'))
    # crop the first photograph to its right half by dragging the west grip
    pg.click('.psheet-cell >> nth=0'); pg.wait_for_selector('.pcrop-stage'); s=pg.locator('.pcrop-stage').bounding_box(); g=pg.locator('.pcrop-grip.g-w').bounding_box()
    pg.mouse.move(g['x']+14,g['y']+14); pg.mouse.down(); pg.mouse.move(s['x']+s['width']*0.5,g['y']+14,steps=6); pg.mouse.up()
    g=pg.locator('.pcrop-grip.g-n').bounding_box(); pg.mouse.move(g['x']+14,g['y']+14); pg.mouse.down(); pg.mouse.move(g['x']+14,s['y']+s['height']*0.2,steps=6); pg.mouse.up()
    pg.fill('.pcrop-cap input','Storefront head, cropped'); pg.screenshot(path='pcrop.png'); pg.click('.pcrop button:has-text("Done")')
    pg.click('.psheet-cell >> nth=3'); pg.click('.pcrop button:has-text("Leave out")'); pg.wait_for_timeout(300)
    print('after crop + leaving one out:',pg.inner_text('.psheet-count'),'| left-out strip:',pg.locator('.psheet-out').count())
    pg.locator('.psheet').screenshot(path='psheet_3.png')
    kept=pg.evaluate("JSON.parse(localStorage.getItem('cazen.photoSheet.%s'))"%V); print('remembered crop:',{k:round(v,2) for k,v in kept['items'][0]['crop'].items()})
    with pg.expect_download(timeout=30000) as d: pg.click('button:has-text("Issue & download")')
    d.value.save_as('report.pdf'); print('errors:',errs[:4]); b.close()
