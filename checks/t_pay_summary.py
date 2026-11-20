"""The pay application summary is the comparison with the schedule; the rest is folded away."""
from common import *
import t_overview as o
B=o.ex['sov_lines']; ids=[l['id'] for l in B]
A=lambda i,n,s,e,p: {'id':'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa0%d'%i,'project_id':PROJ,'contract_id':None,'name':n,'is_heading':False,'starts_on':s,'ends_on':e,'percent':p,'sort':i,'color':None}
ex=dict(o.ex); ex['issued_form_links']=[]
ex['schedule_activities']=[A(1,'Earthwork','2026-08-01','2026-09-15',100),A(2,'Building shell','2026-09-01','2027-02-01',30),A(3,'Punch','2027-03-01','2027-03-10',0)]
ex['schedule_activity_lines']=[{'activity_id':ex['schedule_activities'][0]['id'],'sov_line_id':ids[0],'project_id':PROJ},{'activity_id':ex['schedule_activities'][1]['id'],'sov_line_id':ids[1],'project_id':PROJ}]
with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={'width':1440,'height':900}); install(ctx,ex); signed_in(ctx)
    pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(BASE); pg.wait_for_selector('text=Stand-in Office'); pg.click('td.p-name'); pg.wait_for_selector('.overview'); pg.goto(BASE+'#/pay'); pg.wait_for_selector('.pay-sched',timeout=10000)
    print('top of the page:',[t.replace('\n',' / ')[:60] for t in pg.locator('.pay-summary .pay-figure').all_inner_texts()],'| above the schedule card:',pg.locator('.pay-summary').bounding_box()['y']<pg.locator('.pay-sched').bounding_box()['y'],'| outside the fold:',pg.locator('.pay-more .pay-summary').count()==0)
    print('figures:',[t.replace('\n',' / ') for t in pg.locator('.pay-sched-figures .pay-figure').all_inner_texts()])
    print('rows:',[t.replace('\t',' | ') for t in pg.locator('.pay-sched tbody tr').all_inner_texts()])
    print('by-trade table showing:',pg.locator('.pay-more .pay-trades').first.is_visible(),'| retainage showing:',pg.locator('.pay-more h3:has-text("Retainage")').is_visible())
    pg.screenshot(path='pay_summary.png'); pg.click('.pay-more > summary'); pg.wait_for_timeout(200)
    print('after opening the fold: by trade',pg.locator('.pay-more .pay-trades').first.is_visible(),'| retainage',pg.locator('.pay-more h3:has-text("Retainage")').is_visible(),'| errors:',errs); b.close()
