"""A form is shown as its printed page; a part of the page is clicked to edit it; the page redraws."""
from common import *
import sys
with sync_playwright() as p:
    b=p.chromium.launch(channel='chrome')
    for name,vp in (('desk',dict(viewport={'width':1600,'height':1000})),('phone',PHONE)):
        ctx=b.new_context(**vp); install(ctx,{'issued_forms':[],'issued_form_links':[],'spec_sections':[]}); signed_in(ctx)
        pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
        pg.goto(BASE); pg.wait_for_selector('text=Stand-in Office'); pg.locator('td.p-name').first.click(); pg.wait_for_selector('.overview'); pg.goto(BASE+'#/ca-logs'); pg.wait_for_timeout(1200)
        pg.locator('button:has-text("ASI")').first.click(); pg.wait_for_selector('.pf-page img',timeout=20000); pg.wait_for_timeout(600)
        spots=pg.locator('.pf-spot'); print(name,'| pages:',pg.locator('.pf-page').count(),'| boxes on the page:',spots.count(),'| list hidden:',pg.locator('.form.card:not(.pf-rest):not(.pf-form) > label').count()==0)
        first=pg.locator('.pf-page img').first.get_attribute('src')
        subj=pg.locator('.pf-spot[title*="ubject"], .pf-spot[title*="escription"]').first; t=subj.get_attribute('title'); subj.click(); pg.wait_for_selector('.pf-edit')
        print('  clicked',repr(t),'-> editor fields:',pg.locator('.pf-edit label .field-head').all_inner_texts())
        box=pg.locator('.pf-edit textarea, .pf-edit input').first; box.fill('Relocate hose bibb at north wall'); pg.wait_for_function("(a)=>document.querySelector('.pf-page img').src!==a",arg=first,timeout=15000)
        print('  page redrawn after typing: True | still editing:',pg.locator('.pf-edit').count()==1)
        pg.screenshot(path='printed_%s.png'%name)
        pg.click('.pf-edit-foot button'); print('  done -> hint back:',pg.locator('.pf-hint').count()==1,'| errors:',errs)
        ctx.close()
    b.close()
