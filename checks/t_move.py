"""Select, then drag a markup to move it; corners reshape it; notes move and resize too."""
from common import *
from t_fix import extra, S1
def mk(i,kind,geo,body=None): return {'id':'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb%d'%i,'sheet_id':S1,'project_id':PROJ,'revision_id':extra['sheet_revisions'][0]['id'],'kind':kind,'geometry':geo,'style':{'colour':'#c0392b'},'body':body,'created_by':UID,'created_at':'2026-11-19T10:00:0%dZ'%i,'updated_at':'2026-11-19T10:00:00Z'}
rows=[mk(1,'rect',{'x':0.2,'y':0.2,'w':0.12,'h':0.1}),mk(2,'ink',{'points':[[0.5,0.2],[0.52,0.24],[0.56,0.22],[0.6,0.28]]}),mk(3,'arrow',{'from':{'x':0.2,'y':0.6},'to':{'x':0.35,'y':0.7}}),mk(4,'text',{'x':0.55,'y':0.55,'w':0.16,'h':0.08,'leader':{'x':0.5,'y':0.8}},'Check this')]
ex=dict(extra); ex['sheet_markups']=lambda r: rows; patches=[]
pdf=open('sheet.pdf','rb').read()
with sync_playwright() as p:
    b=p.chromium.launch(channel='chrome'); ctx=b.new_context(viewport={'width':1440,'height':900}); install(ctx,ex); signed_in(ctx)
    def pat(route):
        if route.request.method=='PATCH':
            i=re.search(r'id=eq\.([0-9a-f-]+)',route.request.url).group(1)[-1]; patches.append((i,json.loads(route.request.post_data).get('geometry'))); return route.fulfill(status=204,body='')
        route.fallback()
    ctx.route(re.compile(r'.*/rest/v1/sheet_markups.*'),pat)
    ctx.route(re.compile(r'.*/functions/v1/files.*'), lambda r: r.fulfill(status=200,content_type='application/json',body=json.dumps({'url':'https://stand-in.supabase.co/blob/sheet.pdf','configured':True})))
    ctx.route(re.compile(r'.*/blob/sheet\.pdf'), lambda r: r.fulfill(status=200,content_type='application/pdf',body=pdf))
    pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(BASE); pg.wait_for_selector('text=Stand-in Office'); pg.click('td.p-name'); pg.click('text=A-101 >> nth=0'); pg.wait_for_timeout(2500)
    pg.click('button:has-text("Mark up")'); pg.wait_for_timeout(300); pg.keyboard.press('s'); pg.wait_for_timeout(200)
    L=pg.locator('.mk-layer').first.bounding_box(); r2=lambda v: round(v,3)
    def drag(sel,dx,dy):
        bb=pg.locator(sel).bounding_box(); x=bb['x']+bb['width']/2; y=bb['y']+bb['height']/2
        pg.mouse.move(x,y); pg.mouse.down(); pg.mouse.move(x+dx/2,y+dy/2,steps=4); pg.mouse.move(x+dx,y+dy,steps=4); pg.mouse.up(); pg.wait_for_timeout(500)
    names={0:'box',1:'ink',2:'arrow',3:'note'}
    for i in range(4):
        n=len(patches); drag('.mk-pickable >> nth=%d'%i, 0.1*L['width'], 0.05*L['height']); g=patches[-1][1] if len(patches)>n else None
        first=(g.get('x'),g.get('y')) if g and 'x' in g else (g['from']['x'],g['from']['y']) if g and 'from' in g else tuple(g['points'][0][:2]) if g else None
        print(names[i],'dragged by (0.10, 0.05) → saved, first point now',tuple(r2(v) for v in first) if first else None, '| leader kept:' if i==3 else '', (g or {}).get('leader') if i==3 else '')
    n=len(patches); pg.locator('.mk-pickable >> nth=0').click(); pg.wait_for_timeout(300); print('a click without a drag saves nothing:',len(patches)==n,'| handles on the box:',pg.locator('.mk-handle').count())
    drag('.mk-handle >> nth=2', 0.05*L['width'], 0.05*L['height']); g=patches[-1][1]; print('corner dragged → box now',{k:r2(v) for k,v in g.items()})
    pg.locator('.mk-pickable >> nth=3').click(); pg.wait_for_timeout(200); print('handles on the note:',pg.locator('.mk-handle').count()); drag('.mk-handle >> nth=2', 0.04*L['width'], 0.03*L['height']); g=patches[-1][1]; print('note resized →',{k:(r2(v) if not isinstance(v,dict) else v) for k,v in g.items()})
    pg.locator('.mk-pickable >> nth=3').dblclick(); pg.wait_for_timeout(300); print('double-click a note edits its words:',pg.locator('.mk-note textarea, .mk-note input').count()>0)
    pg.screenshot(path='move.png'); print('errors:',errs[:3]); b.close()
