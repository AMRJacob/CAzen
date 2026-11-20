"""With 59 sheets chosen the re-read list scrolls inside the window and the Change button stays on screen."""
from common import *
import copy, t_fix
ex=copy.deepcopy(t_fix.extra); S=ex['sheets'][0]; R=ex['sheet_revisions'][0]; C=ex['current_sheets'][0]
for i in range(2,60):
    k='%04d'%i; num='A-%d'%(100+i)
    s=dict(S,id=S['id'][:-4]+k,number=num,title='Plan %d'%i); r=dict(R,id=R['id'][:-4]+k,sheet_id=s['id'],title_at_rev=s['title']); c=dict(C,sheet_id=s['id'],revision_id=r['id'],number=num,title=s['title'])
    ex['sheets'].append(s); ex['sheet_revisions'].append(r); ex['current_sheets'].append(c)
ex['titleblock_templates']=[]
pdf=open('sheet.pdf','rb').read()
with sync_playwright() as p:
    b=p.chromium.launch(channel='chrome')
    for vp in ({'width':1440,'height':800},{'width':1920,'height':1000}):
        ctx=b.new_context(viewport=vp); install(ctx,ex); signed_in(ctx)
        ctx.route(re.compile(r'.*/functions/v1/files.*'), lambda r: r.fulfill(status=200,content_type='application/json',body=json.dumps({'url':'https://stand-in.supabase.co/blob/sheet.pdf','configured':True})))
        ctx.route(re.compile(r'.*/blob/sheet\.pdf'), lambda r: r.fulfill(status=200,content_type='application/pdf',body=pdf))
        pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
        pg.goto(BASE); pg.wait_for_selector('text=Stand-in Office'); pg.click('td.p-name'); pg.wait_for_timeout(300); pg.goto(BASE+'#/documents'); pg.wait_for_selector('tr.opens >> nth=20')
        w=pg.locator('.content').bounding_box(); t=pg.locator('table').first.bounding_box(); print(vp['width'],'drawings: content',round(w['width']),'table',round(t['width']))
        pg.click('button:has-text("Re-read titles and dates")'); pg.click('tr.group-pick'); pg.wait_for_timeout(200); print('chosen:',pg.inner_text('.pick-bar strong'))
        pg.click('tr.opens >> nth=1',button='right'); pg.wait_for_selector('.pick-menu'); pg.click('.pick-menu button >> nth=0')
        pg.wait_for_selector('.reread tbody tr >> nth=30',timeout=60000); pg.wait_for_function("!document.querySelector('.reread p strong')",timeout=120000); pg.wait_for_timeout(400)
        print(pg.evaluate("""() => { const c=document.querySelector('.reread-card').getBoundingClientRect(), t=document.querySelector('.reread-card > .reread-table'), b=document.querySelector('.reread button.primary').getBoundingClientRect();
          t.scrollTop = 1e6; const last=[...document.querySelectorAll('.reread tbody tr')].pop().getBoundingClientRect(), tb=t.getBoundingClientRect(); const head=document.querySelector('.reread thead').getBoundingClientRect();
          return JSON.stringify({rows: document.querySelectorAll('.reread tbody tr').length, window: innerHeight, cardBottom: Math.round(c.bottom), listScrolls: t.scrollHeight > t.clientHeight, changeButtonBottom: Math.round(b.bottom), lastRowVisibleAfterScroll: last.bottom <= tb.bottom + 1 && last.top >= tb.top, headStillAtTop: Math.round(head.top - tb.top)}) }"""))
        print('button says:',pg.inner_text('.reread button.primary'),'| errors:',errs)
        pg.screenshot(path='reread_long_%d.png'%vp['width']); ctx.close()
