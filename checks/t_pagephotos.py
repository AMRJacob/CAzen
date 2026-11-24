"""A new observation on a notebook page takes documentation photographs from the page: several at once, labels coming
too, a drawn-on one copied with its drawing laid in, and — when asked — taken off the page's Documentation photos."""
from common import *
import json, io, re
from PIL import Image, ImageDraw
def png(c):
    im=Image.new('RGB',(800,600),c); b=io.BytesIO(); im.save(b,'PNG'); return b.getvalue()
A,B='p/a.jpg','p/b.jpg'
V={'id':'cccccccc-cccc-4ccc-8ccc-ccccccccc001','project_id':PROJ,'kind':'visit','visited_on':'2026-11-18','visited_at':'15:00:00','title':'Walk','weather':'x','names':None,'notes':'1. A\n  a. x',
   'photos':[A,B],'photo_labels':{A:'Cracked lintel north wall',B:'Flashing gap at parapet'},'pad_id':None,'issued_id':None,'location':None,'widgets':{},'created_at':'2026-11-18T15:00:00Z'}
PAD={'id':'dddddddd-0000-4000-8000-00000000000d','project_id':PROJ,'kind':'field_report','title':'photo:'+B,'noted_on':'2026-11-18','pages':1,'rule':'blank','rule_ink':40,'contrast':False,'issued_id':None,'created_by':UID,'created_at':'2026-11-18T15:00:00Z','updated_at':'2026-11-18T15:00:00Z'}
MARKS=[{'id':'m1','pad_id':PAD['id'],'project_id':PROJ,'page':1,'kind':'text','geometry':{'x':0,'y':0,'w':1,'h':0.75},'style':{'image':B},'body':'','created_by':UID,'created_at':'2026-11-18T15:00:00Z'},
       {'id':'m2','pad_id':PAD['id'],'project_id':PROJ,'page':1,'kind':'ink','geometry':{'points':[[0.1,0.1,0.5],[0.5,0.4,0.5],[0.9,0.7,0.5]]},'style':{'color':'#d00000','width':0.02,'nib':'pen'},'body':None,'created_by':UID,'created_at':'2026-11-18T15:00:00Z'}]
obs=[]; patches=[]
with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={'width':1440,'height':900})
    def post(r):
        row=json.loads(r.post_data); row=row[0] if isinstance(row,list) else row; obs.append(row); return row
    def vpatch(r):
        body=json.loads(r.post_data); patches.append(body); V.update(body); return [V]
    install(ctx,{'site_visits':lambda r:[V],'PATCH:site_visits':vpatch,'note_pads':lambda r:[PAD],'pad_marks':lambda r:MARKS,'observations':lambda r:obs,'POST:observations':post,'observation_types':[],'project_people':[],'notebook_layouts':lambda r:None}); signed_in(ctx)
    ctx.route(re.compile(r'.*/a\.jpg.*'), lambda r: r.fulfill(status=200, content_type='image/png', body=png('#88a')))
    ctx.route(re.compile(r'.*/b\.jpg.*'), lambda r: r.fulfill(status=200, content_type='image/png', body=png('#8a8')))
    uploads=[]; ctx.route(re.compile(r'.*/(storage|r2|upload|object).*'), lambda r: (uploads.append(r.request.url), r.fulfill(status=200, body='{}'))[1] if r.request.method in ('PUT','POST') else r.fallback())
    pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(BASE); pg.wait_for_selector('text=Stand-in Office'); pg.locator('td.p-name, .p-card').first.click(); pg.wait_for_timeout(500)
    pg.goto(BASE+'#/field-notes/reports'); pg.wait_for_selector('.nb-toc li'); pg.click('.nb-toc li button'); pg.wait_for_selector('.nb-cell'); pg.wait_for_timeout(1000)
    pg.click('.nb-z-seen button:has-text("New observation")'); pg.wait_for_selector('.obs-form')
    pg.click('button:has-text("From this page’s photos")'); pg.wait_for_selector('.ppp-tile'); pg.wait_for_timeout(900)
    print('offered:', [t.replace('\n',' ') for t in pg.locator('.ppp-label').all_inner_texts()], '| ink drawn on B in the picker:', pg.locator(f'.ppp-tile[data-path="{B}"] .nb-light-ink svg').count())
    print('SVG:', pg.locator(f'.ppp-tile[data-path="{B}"] .nb-light-ink svg').evaluate('e=>e.outerHTML.slice(0,900)'))
    print('svg box:', pg.locator(f'.ppp-tile[data-path="{B}"] .nb-light-ink svg').bounding_box())
    pg.click(f'.ppp-tile[data-path="{A}"]'); pg.click(f'.ppp-tile[data-path="{B}"]'); pg.check('.ppp-off input'); pg.click('.ppp button.primary'); pg.wait_for_timeout(2500)
    print('form title:', pg.locator('.obs-form input').first.input_value(), '| details:', pg.locator('.obs-form textarea').first.input_value())
    paths=pg.evaluate("[...document.querySelectorAll('.obs-form .photo img, .obs-form .photo-strip img')].length")
    print('photos on the form:', paths)
    print('page patched:', patches[-1] if patches else None)
    pg.click('.obs-form .actions button.primary'); pg.wait_for_timeout(1500)
    o=obs[-1] if obs else {}
    print('observation saved photos:', o.get('photos'), '| A kept same file (taken off page, no ink):', A in (o.get('photos') or []), '| B copied:', B not in (o.get('photos') or []))
    # the flattened copy, read from the device's cache: has red ink in it?
    copy=[x for x in (o.get('photos') or []) if x!=A][0]
    red=pg.evaluate("""async (path)=>{
      const db=await new Promise(r=>{const q=indexedDB.open('cazen');q.onsuccess=()=>r(q.result)})
      const all=await new Promise(r=>{const q=db.transaction('files').objectStore('files').getAll();q.onsuccess=()=>r(q.result)})
      const rec=all.find(f=>JSON.stringify(f).includes(path.split('/').pop().slice(0,20)))
      const blob=rec?.blob||rec?.data||Object.values(rec||{}).find(v=>v instanceof Blob)
      if(!blob) return 'no cached copy'
      const img=await createImageBitmap(blob); const c=new OffscreenCanvas(img.width,img.height); const g=c.getContext('2d'); g.drawImage(img,0,0)
      const d=g.getImageData(0,0,img.width,img.height).data; let reds=0
      for(let i=0;i<d.length;i+=4) if(d[i]<70&&d[i+1]<70&&d[i+2]<70) reds++
      return {size:[img.width,img.height], inkPixels:reds}
    }""", copy)
    print('copied photograph:', red); print('errors', errs); b.close()
