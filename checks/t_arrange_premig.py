"""Before migration 0044: no widgets column, no notebook_layouts table. The book still opens, the page can be arranged (kept on the device), Text box and Checklist are greyed."""
from common import *
import json, re
V={'id':'cccccccc-cccc-4ccc-8ccc-ccccccccc001','project_id':PROJ,'kind':'visit','visited_on':'2026-11-18','visited_at':'15:00:00','title':'OAC','weather':'Sunny','names':None,'notes':'1. Structure\n  a. x','photos':[],'photo_labels':{},'pad_id':None,'issued_id':None,'location':None,'created_at':'2026-11-18T15:00:00Z'}
with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={'width':1500,'height':950})
    install(ctx,{'site_visits':lambda r:[V],'note_pads':[],'pad_marks':[],'observations':[],'observation_types':[],'project_people':[]}); signed_in(ctx)
    asked=[]
    def miss(route):
        u=route.request.url; asked.append(u.split('/rest/v1/')[1][:60])
        if 'notebook_layouts' in u: return route.fulfill(status=404,content_type='application/json',body=json.dumps({'code':'PGRST205','message':'Could not find the table'}))
        if 'select=widgets' in u or ('widgets' in u and 'site_visits' in u): return route.fulfill(status=400,content_type='application/json',body=json.dumps({'code':'42703','message':'column site_visits.widgets does not exist'}))
        route.fallback()
    ctx.route(re.compile(r'.*/rest/v1/(site_visits|notebook_layouts).*'),miss)
    pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(BASE); pg.wait_for_selector('text=Stand-in Office'); pg.locator('td.p-name, .p-card').first.click(); pg.wait_for_timeout(600)
    pg.goto(BASE+'#/field-notes/reports'); pg.wait_for_selector('.nb-toc li'); pg.click('.nb-toc li button'); pg.wait_for_selector('.nb-cell'); pg.wait_for_timeout(600)
    pg.click('.nb-menu .nb-menu-mark'); pg.wait_for_timeout(300); pg.click('.nb-menu .nb-menu-spot:has-text("Arrange")'); pg.wait_for_selector('.nb-arr')
    print('greyed:', {t: pg.locator(f'.nb-menu-arrange .nb-menu-spot:has-text("{t}")').is_disabled() for t in ('Text box','Checklist','Show')})
    pg.click('.nb-cell[data-block="seen"] .nb-arr-hide'); pg.click('.nb-menu-arrange .nb-menu-spot:has-text("Close")'); pg.wait_for_timeout(500)
    pg.reload(); pg.wait_for_selector('.nb-toc li'); pg.click('.nb-toc li button'); pg.wait_for_selector('.nb-cell'); pg.wait_for_timeout(600)
    print('after reload, kept on the device:', pg.evaluate("[...document.querySelectorAll('.nb-cell')].map(c=>c.dataset.block)"), '| errors:', errs)
    b.close()
