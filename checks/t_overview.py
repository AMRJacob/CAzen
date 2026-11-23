"""A project's front page: where choosing a project and closing a notebook land, and what it says."""
from common import *
C='99999999-9999-4999-8999-999999999901'; A1='99999999-9999-4999-8999-99999999a001'; A2='99999999-9999-4999-8999-99999999a002'; L1='99999999-9999-4999-8999-99999999b001'; L2='99999999-9999-4999-8999-99999999b002'; T1='77777777-7777-4777-8777-777777777771'
def O(i,title,day,status='open'): return {'id':'dddddddd-dddd-4ddd-8ddd-ddddddddddd%d'%i,'project_id':PROJ,'type_id':T1,'number':i,'title':title,'detail':None,'status':status,'area':None,'trade':None,'observed_on':day,'photos':[],'sheet_id':None,'revision_id':None,'region':None,'created_by':UID,'created_at':day+'T15:00:00Z','updated_at':day+'T15:00:00Z'}
def F(i,kind,num,title,at,values=None): return {'id':'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee%d'%i,'project_id':PROJ,'kind':kind,'number':num,'title':title,'values':values or {},'file_path':None,'issuance_id':None,'issued_by':UID,'issued_at':at}
ex={
 'pay_contracts':lambda r: {'id':C,'project_id':PROJ,'form':'g702','original_sum':1000000,'retainage_work':0.1,'retainage_stored':0.1,'name':'General','contractor':'Builder','created_at':'2026-01-01T00:00:00Z'} if 'pgrst.object' in (r.headers.get('accept') or '') else [{'id':C,'project_id':PROJ,'form':'g702','original_sum':1000000,'retainage_work':0.1,'retainage_stored':0.1,'name':'General','contractor':'Builder','created_at':'2026-01-01T00:00:00Z'}],
 'sov_lines':[{'id':L1,'contract_id':C,'sort':1,'code':'1','description':'Sitework','scheduled_value':400000,'retainage_rate':None,'change_order_id':None,'is_title':False},{'id':L2,'contract_id':C,'sort':2,'code':'2','description':'Building','scheduled_value':600000,'retainage_rate':None,'change_order_id':None,'is_title':False}],
 'retainage_steps':[],
 'pay_apps':[{'id':A1,'contract_id':C,'number':1,'period_to':'2026-09-30','applied_on':'2026-10-02','retainage_work':None,'retainage_stored':None,'status':'certified','certified_sum':None},{'id':A2,'contract_id':C,'number':2,'period_to':'2026-10-31','applied_on':'2026-11-02','retainage_work':None,'retainage_stored':None,'status':'draft','certified_sum':None}],
 'pay_app_lines':[{'pay_app_id':A1,'sov_line_id':L1,'this_period':200000,'stored':0},{'pay_app_id':A2,'sov_line_id':L1,'this_period':100000,'stored':0},{'pay_app_id':A2,'sov_line_id':L2,'this_period':150000,'stored':0}],
 'observations':[O(1,'Oldest',  '2026-10-01','closed'),O(2,'Sealant missing at storefront','2026-11-10'),O(3,'Drywall needs repair','2026-11-15'),O(4,'Roof drain strainers missing','2026-11-18')],
 'observation_types':[{'id':T1,'firm_id':FIRM,'code':'W','name':'Work','position':0,'on_punch_list':False}],
 'issued_forms':[F(1,'asi','ASI-003','Door hardware revisions','2026-11-12T15:00:00Z'),F(2,'asi','ASI-002','Earlier ASI','2026-10-12T15:00:00Z'),F(3,'pr','PR-004','Added bollards','2026-11-05T15:00:00Z',{'pr.price':'12500'}),F(4,'change_order','CO-001','Sitework changes','2026-10-20T15:00:00Z',{'chg.cost':'8400'}),F(5,'field_report','FR-007','Site visit','2026-11-18T15:00:00Z')],
 'schedule_activities':[dict(id='5555555%d-5555-4555-8555-555555555555'%i,project_id=PROJ,contract_id=None,name=n,is_heading=h,starts_on=a,ends_on=e,percent=0,sort=i*10,level=l,ref=None,color=None) for i,(n,h,a,e,l) in enumerate([('Job',True,'2026-06-01','2027-03-09',0),('Tracking Milestones',True,'2026-06-01','2027-03-09',1),('Building Dried In',False,'2026-10-15','2026-10-15',2),('Building Complete',False,'2027-03-09','2027-03-09',2),('Interior',True,'2026-11-01','2027-03-08',1),('Hang Drywall',False,'2026-11-01','2026-12-10',2),('Inspection, above ceiling',False,'2026-12-01','2026-12-02',2),('Clean & Punch',False,'2027-02-23','2027-03-08',2)])],'schedule_activity_lines':[],
 'issued_form_links':[],'site_visits':[],'project_people':[],
}
with sync_playwright() as p:
    b=p.chromium.launch(channel='chrome')
    for name,kw in (('desk',dict(viewport={'width':1440,'height':900})),('phone',PHONE)):
        ctx=b.new_context(**kw); install(ctx,ex); signed_in(ctx); pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)[:200]))
        pg.goto(BASE); pg.wait_for_selector('text=Stand-in Office'); (pg.tap if name=='phone' else pg.click)('td.p-name'); pg.wait_for_selector('.overview'); pg.wait_for_timeout(900)
        print(name,'— choosing a project lands on:',pg.url.split('#')[1])
        print('  ',pg.inner_text('.ov-head').replace('\n',' | '))
        cards=[c.replace('\n',' | ') for c in pg.locator('.ov-card').all_inner_texts()]
        for c in cards: print('  ',c[:230])
        print('   fits the screen:',pg.evaluate("document.documentElement.scrollWidth<=innerWidth"),'| errors:',errs[:2]); pg.screenshot(path='overview_%s.png'%name,full_page=True)
        if name=='desk':
            pg.goto(BASE+'#/field-notes/reports'); pg.wait_for_selector('.nb-menu-contents'); pg.click('.nb-menu-contents .nb-menu-mark'); pg.wait_for_timeout(450); pg.click('.nb-menu-contents .nb-menu-spot:has-text("Close")'); pg.wait_for_timeout(500); print('   closing a notebook lands on:',pg.url.split('#')[1])
        ctx.close()
    b.close()
