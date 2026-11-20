"""A notebook page can be duplicated from the page's menu and from the contents menu: title, names, place and notes; not photographs or sketch."""
from common import *
import json, re
V={'id':'cccccccc-cccc-4ccc-8ccc-ccccccccc001','project_id':PROJ,'kind':'visit','visited_on':'2026-11-18','visited_at':'2026-11-18T15:00:00Z','title':'OAC Meeting','weather':'Sunny 60','names':'Ann Lee | Owner | ann@x.com','notes':'1. Structure\n  a. Anchor bolts checked','photos':['p/a.jpg'],'photo_labels':{'p/a.jpg':'North wall'},'pad_id':'dddddddd-dddd-4ddd-8ddd-ddddddddd001','issued_id':None,'location':'Job site\n1 Main St','created_by':UID,'created_at':'2026-11-18T15:00:00Z'}
with sync_playwright() as p:
    b=p.chromium.launch()
    for name,vp,how in (('phone, from the page menu',PHONE,'page'),('desk, from the contents menu',dict(viewport={'width':1500,'height':950}),'contents')):
        store=[dict(V)]; posts=[]; patches=[]
        def post(r):
            row=json.loads(r.post_data); row=row[0] if isinstance(row,list) else row; posts.append(row); store.insert(0,row); return row
        ctx=b.new_context(**vp); install(ctx,{'site_visits':lambda r: store,'POST:site_visits':post,'note_pads':[],'pad_marks':[],'observations':[],'observation_types':[],'project_people':[]}); signed_in(ctx)
        def pt(route):
            if route.request.method=='PATCH':
                body=json.loads(route.request.post_data); patches.append(body); i=route.request.url.split('id=eq.')[1][:36]
                for s in store:
                    if s['id']==i: s.update(body)
                return route.fulfill(status=204,body='')
            route.fallback()
        ctx.route(re.compile(r'.*/rest/v1/site_visits\?.*'),pt)
        pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
        pg.goto(BASE); pg.wait_for_selector('text=Stand-in Office'); pg.locator('td.p-name').first.click(); pg.wait_for_selector('.overview'); pg.goto(BASE+'#/field-notes/reports'); pg.wait_for_selector('.nb-toc li'); pg.wait_for_timeout(400)
        if how=='page':
            pg.click('.nb-toc li button'); pg.wait_for_selector('.nb-page'); pg.wait_for_timeout(500); pg.click('.nb-menu .nb-menu-mark'); pg.wait_for_timeout(450)
            m=pg.locator('.nb-menu').bounding_box(); print(name,'| menu:',pg.locator('.nb-menu .nb-menu-spot').all_inner_texts(),'| fits:',m['x']>=0 and m['x']+m['width']<=pg.viewport_size['width'],'| last item inside:',pg.evaluate("(()=>{const k=[...document.querySelectorAll('.nb-menu .nb-menu-spot')].pop().getBoundingClientRect();return k.right<=innerWidth})()"))
            pg.screenshot(path='dup_menu.png'); pg.click('.nb-menu .nb-menu-spot:has-text("Duplicate")')
        else:
            pg.click('.nb-menu-contents .nb-menu-mark'); pg.wait_for_timeout(450); print(name,'| menu:',pg.locator('.nb-menu-contents .nb-menu-spot').all_inner_texts())
            pg.click('.nb-menu-contents .nb-menu-spot:has-text("Duplicate a page")'); pg.wait_for_selector('.nb-toc-copy'); print('  asks:',pg.inner_text('.nb-removing span')); pg.click('.nb-toc-copy')
        pg.wait_for_selector('.nb-page'); pg.wait_for_timeout(1500)
        made={**posts[0],**{k:v for d in patches for k,v in d.items()}} if posts else {}
        print('  new page:',{k:made.get(k) for k in ('title','names','location','notes','photos','pad_id','visited_on')})
        print('  is a different page:',made.get('id')!=V['id'],'| shown title:',pg.locator('.nb-page input').first.input_value() if pg.locator('.nb-page input').count() else '?','| errors:',errs); ctx.close()
    b.close()
