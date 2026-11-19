"""Someone else's markup: a warning first, then it can be removed; your own goes without one."""
from common import *
from t_fix import extra, S1
OTHER='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
def mk(i,by,x): return {'id':'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb%d'%i,'sheet_id':S1,'project_id':PROJ,'revision_id':extra['sheet_revisions'][0]['id'],'kind':'rect','geometry':{'x':x,'y':0.3,'w':0.12,'h':0.1},'style':{'colour':'#c0392b'},'body':None,'created_by':by,'created_at':'2026-11-19T10:00:0%dZ'%i,'updated_at':'2026-11-19T10:00:00Z'}
rows=[mk(1,OTHER,0.2),mk(2,UID,0.5)]; deleted=[]
ex=dict(extra); ex['sheet_markups']=lambda r: rows
pdf=open('sheet.pdf','rb').read()
with sync_playwright() as p:
    b=p.chromium.launch(channel='chrome'); ctx=b.new_context(viewport={'width':1440,'height':900}); install(ctx,ex); signed_in(ctx)
    def dele(route):
        if route.request.method=='DELETE':
            i=re.search(r'id=eq\.([0-9a-f-]+)',route.request.url).group(1); deleted.append(i[-1]); rows[:]=[r for r in rows if r['id']!=i]
            return route.fulfill(status=200,content_type='application/json',body=json.dumps([{'id':i}]))
        route.fallback()
    ctx.route(re.compile(r'.*/rest/v1/sheet_markups.*'),dele)
    ctx.route(re.compile(r'.*/functions/v1/files.*'), lambda r: r.fulfill(status=200,content_type='application/json',body=json.dumps({'url':'https://stand-in.supabase.co/blob/sheet.pdf','configured':True})))
    ctx.route(re.compile(r'.*/blob/sheet\.pdf'), lambda r: r.fulfill(status=200,content_type='application/pdf',body=pdf))
    pg=ctx.new_page(); pg.goto(BASE); pg.wait_for_selector('text=Stand-in Office'); pg.click('td.p-name'); pg.click('text=A-101 >> nth=0'); pg.wait_for_timeout(2500)
    pg.click('button:has-text("Mark up")'); pg.wait_for_timeout(300); n=lambda: pg.evaluate("document.querySelectorAll('.mk-pickable').length")
    pg.keyboard.press('s'); pg.locator('.mk-pickable').first.click(); pg.keyboard.press('Delete'); pg.wait_for_timeout(300)
    print('Delete on someone else’s:',pg.inner_text('.sv-said').replace('\n',' | '),'| still on the sheet:',n()==2,'| sent to server:',deleted); pg.screenshot(path='theirs.png',clip={'x':300,'y':760,'width':840,'height':140})
    pg.click('.sv-said button:has-text("Leave it")'); pg.wait_for_timeout(200); print('Leave it:',n(),'marks, nothing sent:',deleted==[])
    pg.locator('.mk-pickable').first.click(); pg.keyboard.press('Delete'); pg.click('.sv-said button:has-text("Remove")'); pg.wait_for_timeout(900); print('Remove:',n(),'mark left | server told to delete mark',deleted,'|',pg.inner_text('.sv-said').replace('\n',' | '))
    pg.locator('.mk-pickable').first.click(); pg.keyboard.press('Delete'); pg.wait_for_timeout(700); print('own mark, no warning:',pg.inner_text('.sv-said').replace('\n',' | '),'| deleted:',deleted); b.close()
