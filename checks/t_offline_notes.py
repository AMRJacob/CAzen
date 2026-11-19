"""A notebook page made with no signal: written, photographed and sketched on, kept, then sent."""
import base64, io
from common import *
srv={'site_visits':[],'note_pads':[],'pad_marks':[],'project_people':[]}; wrote=[]; files={}; calls=[]
def lister(t):
    def f(req):
        rows=srv[t]
        k=re.search(r'[?&]kind=eq\.(\w+)',req.url)
        if k: rows=[r for r in rows if r.get('kind')==k.group(1)]
        k=re.search(r'pad_id=eq\.([0-9a-f-]+)',req.url)
        if k: rows=[r for r in rows if r.get('pad_id')==k.group(1)]
        if 'project_id=neq' in req.url: return []
        if 'application/vnd.pgrst.object' in (req.headers.get('accept') or ''): return rows[0] if rows else {}
        return rows
    return f
def poster(t):
    def f(req):
        r=json.loads(req.post_data); r=r if isinstance(r,list) else [r]
        for x in r: srv[t][:]=[y for y in srv[t] if y['id']!=x['id']]+[x]
        wrote.append(('PUT',t)); return []
    return f
extra={}
for t in srv: extra[t]=lister(t); extra['POST:'+t]=poster(t)
T1='77777777-7777-4777-8777-777777777771'
extra['observation_types']=[{'id':T1,'firm_id':FIRM,'code':'N','name':'Note','position':0,'on_punch_list':False}]
PNG=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAGCAIAAABxZ0isAAAAEklEQVR4nGP4z8CAFWEXHbQSACj/P8Fu7N9hAAAAAElFTkSuQmCC')
with sync_playwright() as p:
    b=p.chromium.launch(channel='chrome'); ctx=b.new_context(**PHONE); install(ctx,extra); signed_in(ctx)
    def rest(route):
        req=route.request; m=re.search(r'/rest/v1/([a-z_]+)',req.url); t=m.group(1)
        if req.method=='PATCH':
            i=re.search(r'id=eq\.([0-9a-f-]+)',req.url).group(1)
            for r in srv[t]:
                if r['id']==i: r.update(json.loads(req.post_data))
            wrote.append(('PATCH',t)); return route.fulfill(status=204,body='')
        if req.method=='DELETE':
            wrote.append(('DELETE',t)); return route.fulfill(status=204,body='')
        route.fallback()
    ctx.route(re.compile(r'.*/rest/v1/(site_visits|note_pads|pad_marks|project_people)\b.*'),rest)
    def fn(route):
        body=json.loads(route.request.post_data or '{}'); a=body.get('action'); k=body.get('key'); calls.append(a)
        if a=='confirm':
            if k in files: return route.fulfill(status=200,content_type='application/json',body='{"ok":true}')
            return route.fulfill(status=404,content_type='application/json',body=json.dumps({'error':'The upload didn’t arrive.'}))
        if a=='put': return route.fulfill(status=200,content_type='application/json',body=json.dumps({'key':k,'url':'https://stand-in.supabase.co/blob/'+base64.urlsafe_b64encode(k.encode()).decode()}))
        route.fulfill(status=200,content_type='application/json',body=json.dumps({'configured':True,'bytes':0,'objects':0,'by_project':{}}))
    ctx.route(re.compile(r'.*/functions/v1/files.*'),fn)
    def blob(route):
        k=base64.urlsafe_b64decode(route.request.url.split('/blob/')[1]).decode(); files[k]=len(route.request.post_data_buffer or b''); wrote.append(('FILE','r2')); route.fulfill(status=200,body='')
    ctx.route(re.compile(r'.*/blob/.*'),blob)
    pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    idb=lambda store: pg.evaluate("s=>new Promise(r=>{const q=indexedDB.open('cazen');q.onsuccess=()=>{const g=q.result.transaction(s).objectStore(s).getAll();g.onsuccess=()=>r(g.result.map(x=>s==='files'?{path:x.path,size:x.bytes.size}:x))}})",store)
    pg.goto(BASE); pg.wait_for_selector('text=Stand-in Office'); pg.tap('td.p-name'); pg.wait_for_timeout(400)
    pg.goto(BASE+'#/field-notes/reports'); pg.wait_for_selector('.nb-today')
    ctx.set_offline(True); pg.wait_for_timeout(200); print('— signal off —')
    pg.tap('.nb-today'); pg.wait_for_selector('.nb-quick textarea'); print('page opened with no signal:',pg.locator('.nb-z-notes').count()==1)
    pg.fill('.nb-quick textarea','Sealant joint at the north stair is cracked'); pg.keyboard.press('Enter'); pg.wait_for_timeout(300)
    pg.fill('.nb-quick textarea','Roof drain strainers missing'); pg.keyboard.press('Enter'); pg.wait_for_timeout(300)
    pg.locator('input[type=file][multiple]').set_input_files({'name':'a.png','mimeType':'image/png','buffer':PNG}); pg.wait_for_selector('.nb-gallery img',timeout=8000)
    print('photo on the page from this device:',pg.locator('.nb-gallery img').first.get_attribute('src')[:5])
    pg.fill('.nb-light input','Cracked joint'); pg.tap('.nb-light button:has-text("Done")'); pg.wait_for_timeout(300)
    pg.tap('.nb-pad'); pg.wait_for_selector('.padbar-out',timeout=8000); pg.wait_for_timeout(400)
    cdp=ctx.new_cdp_session(pg)
    def stroke(pts):
        cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':pts[0][0],'y':pts[0][1],'id':1,'radiusX':4,'radiusY':4}]})
        for x,y in pts[1:]: cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':x,'y':y,'id':1,'radiusX':4,'radiusY':4}]}); pg.wait_for_timeout(15)
        cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]}); pg.wait_for_timeout(250)
    stroke([(100+i*8,400+(i%5)*6) for i in range(20)]); stroke([(120+i*6,480) for i in range(20)])
    pg.tap('.padbar-out'); pg.wait_for_timeout(500)
    v=idb('visits'); pads=idb('pads'); marks=idb('padMarks'); fl=idb('files'); box=idb('outbox')
    print('kept on the device — pages:',len(v),'| notes kept:','north stair' in (v[0]['notes'] or '') and 'strainers' in v[0]['notes'],'| photos on page:',len(v[0]['photos']),'| pad:',len(pads),'linked:',v[0]['pad_id']==(pads[0]['id'] if pads else 0),'| strokes:',len(marks),'| photo bytes held:',[f['size']>0 for f in fl])
    print('waiting to go:',[q['job']['kind']+(':'+q['job']['table'] if 'table' in q['job'] else '') for q in sorted(box,key=lambda q:q['at'])])
    print('reached the server so far:',wrote)
    pg.goto(BASE+'#/'); pg.wait_for_selector('tr.opens'); pg.wait_for_function("document.querySelector('tr.opens').classList.contains('p-unsynced')",timeout=8000)
    print('project list, still no signal:',pg.evaluate("document.querySelector('tr.opens').className"),'|',pg.inner_text('.p-state')); pg.screenshot(path='offline_notes_hatched.png')
    pg.goto(BASE+'#/field-notes/reports'); pg.wait_for_selector('.nb-toc',timeout=8000); print('contents with no signal lists the page:',pg.locator('.nb-toc li, .nb-toc button, .nb-toc a').count()>0, pg.inner_text('.nb-toc')[:80].replace('\n',' | '))
    pg.locator('.nb-toc-title').first.tap(); pg.wait_for_selector('.nb-z-notes textarea.nb-outline'); pg.wait_for_timeout(600)
    print('reopened with no signal — notes:','north stair' in pg.input_value('.nb-z-notes textarea.nb-outline'),'| photo:',pg.locator('.nb-gallery img').count(),'| sketch strokes drawn:',pg.locator('.nb-pad-empty').count()==0)
    pg.screenshot(path='offline_notes_page.png',full_page=True)
    ctx.set_offline(False); print('— signal back —')
    for _ in range(40):
        pg.wait_for_timeout(500)
        if not idb('outbox'): break
    print('sent, in order:',wrote); print('file function calls:',calls[-4:])
    sv=srv['site_visits'][0]
    print('server now has — page notes:','strainers' in sv['notes'],'| photo path:',sv['photos'],'| uploaded:',{k[-40:]:n for k,n in files.items()},'| path matches upload:',sv['photos'][0]=='r2:'+list(files)[0],'| pad linked:',sv['pad_id']==srv['note_pads'][0]['id'],'| strokes:',len(srv['pad_marks']))
    pg.goto(BASE+'#/'); pg.wait_for_selector('tr.opens'); pg.wait_for_timeout(600); print('project list after:',repr(pg.evaluate("document.querySelector('tr.opens').className")),'|',repr(pg.inner_text('.p-state')))
    print('errors:',errs[:3]); b.close()
