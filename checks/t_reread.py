from common import *
import copy, t_fix
ex=copy.deepcopy(t_fix.extra); S=ex['sheets'][0]; R=ex['sheet_revisions'][0]; C=ex['current_sheets'][0]
for i,(num,title) in enumerate([('A-102','Flor pln'),('A-103','')],start=2):
    s=dict(S,id=S['id'][:-1]+str(i),number=num,title=title); r=dict(R,id=R['id'][:-1]+str(i),sheet_id=s['id'],title_at_rev=title); c=dict(C,sheet_id=s['id'],revision_id=r['id'],number=num,title=title)
    ex['sheets'].append(s); ex['sheet_revisions'].append(r); ex['current_sheets'].append(c)
ex['titleblock_templates']=[]
pdf=open('sheet.pdf','rb').read(); sent=[]
with sync_playwright() as p:
    b=p.chromium.launch(channel='chrome'); ctx=b.new_context(viewport={'width':1440,'height':900}); install(ctx,ex); signed_in(ctx)
    ctx.route(re.compile(r'.*/functions/v1/files.*'), lambda r: r.fulfill(status=200,content_type='application/json',body=json.dumps({'url':'https://stand-in.supabase.co/blob/sheet.pdf','configured':True})))
    ctx.route(re.compile(r'.*/blob/sheet\.pdf'), lambda r: r.fulfill(status=200,content_type='application/pdf',body=pdf))
    def patch(route):
        if route.request.method=='PATCH': sent.append((route.request.url.split('/rest/v1/')[1].split('?')[0],json.loads(route.request.post_data))); return route.fulfill(status=204,body='')
        route.fallback()
    ctx.route(re.compile(r'.*/rest/v1/(sheets|sheet_revisions)\?.*'),patch)
    pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(BASE); pg.wait_for_selector('text=Stand-in Office'); pg.click('td.p-name'); pg.goto(BASE+'#/documents'); pg.wait_for_selector('tr.opens >> nth=2')
    pg.click('tr.opens >> nth=0',modifiers=['Control']); pg.click('tr.opens >> nth=2',modifiers=['Shift']); print('after ctrl-click then shift-click:',pg.inner_text('.pick-bar strong'),'| viewer opened:',pg.locator('.sv-bar').count()>0)
    pg.click('tr.opens >> nth=1',button='right'); pg.wait_for_selector('.pick-menu'); print('menu:',pg.locator('.pick-menu button').all_inner_texts()); pg.click('.pick-menu button >> nth=0')
    pg.wait_for_function("!document.querySelector('.reread p strong')",timeout=30000); pg.wait_for_timeout(300)
    rows=pg.evaluate("[...document.querySelectorAll('.reread tbody tr')].map(r=>[r.cells[1].innerText.replace(/\\n/g,' / '),r.cells[2].innerText,r.querySelector('input[aria-label=\"Title read\"]')?.value,r.querySelector('input[type=date]')?.value,r.querySelector('input[type=checkbox]').checked])")
    for r in rows: print('  ',r)
    pg.fill('.reread tbody tr >> nth=1 >> input[aria-label="Title read"]','Floor plan — level 2'); pg.fill('.reread tbody tr >> nth=1 >> input[type=date]','2026-08-14'); pg.click('.reread button.primary'); pg.wait_for_timeout(600); print('sent:',sent); print('dialog closed, selection cleared:',pg.locator('.reread').count()==0 and pg.locator('.pick-bar').count()==0,'| errors:',errs[:3]); b.close()
