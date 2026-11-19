"""A project held on the phone: goes stale by the clock, updates itself when there is signal, and can be removed."""
from common import *
S1='44444444-4444-4444-8444-444444444441'; S2='44444444-4444-4444-8444-444444444442'; R1='55555555-5555-4555-8555-555555555551'; R2='55555555-5555-4555-8555-555555555552'; I1='66666666-6666-4666-8666-666666666661'
def path(n): return 'r2:'+PROJ+'/drawings/'+n+'.pdf'
sheets=[{'id':S1,'project_id':PROJ,'number':'A-101','title':'FLOOR PLAN','discipline':'A','filed_under':None,'is_void':False,'scale':None}]
revs=[{'id':R1,'sheet_id':S1,'issuance_id':I1,'revision_index':0,'revision_label':'Bid Set','file_path':path('A-101'),'bytes':1500,'title_at_rev':'FLOOR PLAN','created_at':'2026-09-01T00:00:00Z','sheet_date':None,'issuances':{'kind':'bid_set','number':'1','issued_on':'2026-09-01'}}]
def sheets_h(req):
    if req.method=='HEAD': return None
    return sheets
extra={'sheets':lambda r: sheets,'sheet_revisions':lambda r: revs,'issuances':[{'id':I1,'project_id':PROJ,'kind':'bid_set','number':'1','title':'Bid Set','issued_on':'2026-09-01'}]}
pdf=open('sheet.pdf','rb').read(); fetched=[]
with sync_playwright() as p:
    b=p.chromium.launch(channel='chrome'); ctx=b.new_context(**PHONE); install(ctx,extra); signed_in(ctx)
    def fn(route):
        k=json.loads(route.request.post_data or '{}').get('key','')
        route.fulfill(status=200,content_type='application/json',body=json.dumps({'url':'https://stand-in.supabase.co/blob/'+k.split('/')[-1],'configured':True,'bytes':0,'objects':0,'by_project':{}}))
    ctx.route(re.compile(r'.*/functions/v1/files.*'),fn)
    ctx.route(re.compile(r'.*/blob/.*'), lambda r: (fetched.append(r.request.url.split('/')[-1]), r.fulfill(status=200,content_type='application/pdf',body=pdf)))
    pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(BASE); pg.wait_for_selector('text=Stand-in Office'); cdp=ctx.new_cdp_session(pg)
    row=pg.locator('tr.opens').first; bx=row.bounding_box()
    cls=lambda: pg.evaluate("document.querySelector('tr.opens').className"); st=lambda: pg.inner_text('.p-state')
    def hold():
        cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':bx['x']+80,'y':bx['y']+20,'id':1}]}); pg.wait_for_timeout(750); cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]}); pg.wait_for_timeout(900)
    hold(); pg.wait_for_selector('.take-choices button'); pg.tap('.take-choices button >> nth=0')
    pg.wait_for_function("document.querySelector('tr.opens').classList.contains('p-held')",timeout=30000); print('downloaded:',cls(),'|',st(),'| files fetched:',fetched)
    # three weeks pass with the phone in a drawer
    age="""ms=>new Promise(r=>{const q=indexedDB.open('cazen');q.onsuccess=()=>{const s=q.result.transaction('meta','readwrite').objectStore('meta');const g=s.getAll();g.onsuccess=()=>{for(const n of g.result){n.at-=ms;n.checked-=ms;s.put(n)}r(1)}}})"""
    ctx.set_offline(True); pg.evaluate(age,21*86400000)
    # the office issues a new revision of A-101 and a new sheet meanwhile
    sheets.append({'id':S2,'project_id':PROJ,'number':'A-102','title':'ROOF PLAN','discipline':'A','filed_under':None,'is_void':False,'scale':None})
    revs.append(dict(revs[0],id=R2,sheet_id=S2,file_path=path('A-102'),title_at_rev='ROOF PLAN'))
    revs.append(dict(revs[0],id='55555555-5555-4555-8555-555555555553',revision_index=1,revision_label='ASI 1',file_path=path('A-101r1')))
    pg.reload(); pg.wait_for_selector('tr.opens'); pg.wait_for_timeout(800)
    print('three weeks later, opened with no signal:',cls(),'|',st()); pg.screenshot(path='keep_stale.png',clip={'x':0,'y':bx['y']-80,'width':402,'height':260})
    fetched.clear(); ctx.set_offline(False)
    pg.wait_for_function("document.querySelector('tr.opens').classList.contains('p-held') && !document.querySelector('tr.opens').classList.contains('p-loading')",timeout=30000)
    print('signal found, nothing pressed:',cls(),'|',st(),'| fetched by itself:',sorted(fetched))
    held=pg.evaluate("new Promise(r=>{const q=indexedDB.open('cazen');q.onsuccess=()=>{const g=q.result.transaction('files').objectStore('files').getAllKeys();g.onsuccess=()=>r(g.result.map(k=>k.split('/').pop()))}})")
    print('drawings on the device now:',sorted(held),'(superseded A-101 dropped:', 'A-101.pdf' not in held,')')
    hold(); pg.wait_for_selector('.take-remove'); print('held again:',pg.inner_text('.take-card h3'),'|',[t.split('\n')[0] for t in pg.locator('.take-choices button').all_inner_texts()]); pg.screenshot(path='keep_sheet.png')
    pg.tap('.take-remove'); pg.wait_for_timeout(800)
    left=pg.evaluate("new Promise(r=>{const q=indexedDB.open('cazen');q.onsuccess=()=>{const t=q.result.transaction(['files','sheets','meta']);const a=t.objectStore('files').count(),b=t.objectStore('sheets').count(),c=t.objectStore('meta').count();t.oncomplete=()=>r([a.result,b.result,c.result])}})")
    print('removed:',repr(cls()),'|',repr(st()),'| files, sheets, held notes left:',left); print('errors:',errs[:3]); b.close()
