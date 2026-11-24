"""Change register columns: default Number, Type, Status, Subject…; drag a heading to move it; kept after reload; totals follow; Reset."""
from common import *
mk=lambda i,kind,num,title,v={}: {'id':'c%07d-0000-4000-8000-000000000000'%i,'project_id':PROJ,'kind':kind,'number':num,'title':title,'values':v,'file_path':None,'issuance_id':None,'issued_by':UID,'issued_at':'2026-11-%02dT12:00:00Z'%(i+1)}
forms=[mk(1,'pr','PR-001','Add floor box',{'pr.price':'500','pr.decision':'approved'}),mk(2,'change_order','CO-001','Change order one'),mk(3,'asi','ASI-001','Hardware')]
links=[{'parent_id':forms[1]['id'],'child_id':forms[0]['id'],'project_id':PROJ}]
extra={'issued_forms':lambda r: forms,'issued_form_links':lambda r: links}
heads=lambda pg: [t.strip() for t in pg.locator('tr.reg-head th').all_inner_texts()]
cells=lambda pg,n: [t.strip() for t in pg.locator(f'tr:has(td.reg-num:text-is("{n}")) td').all_inner_texts()]
with sync_playwright() as p:
    b=p.chromium.launch(channel='chrome'); ctx=b.new_context(viewport={'width':1440,'height':900}); install(ctx,extra); signed_in(ctx)
    pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(BASE); pg.wait_for_selector('text=Stand-in Office'); pg.click('td.p-name'); pg.wait_for_timeout(300); pg.goto(BASE+'#/ca-logs'); pg.wait_for_selector('tr.reg-head')
    print('default:',heads(pg)); print('PR-001 row:',cells(pg,'PR-001'))
    def drag(col,to,after):
        a=pg.locator(f'th[data-col="{col}"]').bounding_box(); t=pg.locator(f'th[data-col="{to}"]').bounding_box()
        pg.mouse.move(a['x']+a['width']/2,a['y']+a['height']/2); pg.mouse.down()
        x=t['x']+t['width']*(0.8 if after else 0.2); y=t['y']+t['height']/2
        for k in range(1,9): pg.mouse.move(a['x']+a['width']/2+(x-a['x']-a['width']/2)*k/8,y)
        pg.mouse.up(); pg.wait_for_timeout(200)
    drag('cost','number',False); print('Cost dragged to the front:',heads(pg)); print('PR-001 row:',cells(pg,'PR-001'))
    print('totals row:',[t.strip() for t in pg.locator('tr.reg-total').first.locator('td').all_inner_texts()])
    drag('status','time',True); print('Status after Time:',heads(pg))
    pg.reload(); pg.wait_for_selector('tr.reg-head'); print('after reload:',heads(pg))
    pg.locator('tr:has(td.reg-num:text-is("ASI-001"))').click(button='right'); pg.click('.pick-menu button:has-text("Edit")'); print('edit row cells:',pg.locator('tr.reg-edit td').count()); pg.click('tr.reg-edit button:has-text("Cancel")')
    pg.screenshot(path='regcols.png')
    pg.click('button:has-text("Reset columns")'); pg.wait_for_timeout(200); print('reset:',heads(pg)); print('errors:',errs); b.close()
