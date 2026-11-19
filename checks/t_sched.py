from common import *
C='88888888-8888-4888-8888-888888888881'
contract={'id':C,'project_id':PROJ,'name':None,'contractor':'Builder','form':'g702_g703','original_sum':500000,'retainage_work':5,'retainage_stored':5}
names=['General conditions','Sitework','Concrete foundations','Structural steel','Roofing','HVAC','Electrical','Gypsum board assemblies','Painting']
sov=[{'id':'9%07d-0000-4000-8000-000000000000'%i,'contract_id':C,'item_no':str(i+1),'description':n,'scheduled_value':50000,'is_heading':False,'sort':i,'is_change_order':False,'change_order_id':None,'retainage_rate':None,'parent_id':None,'approved_on':None} for i,n in enumerate(names)]
state={'acts':[],'links':[]}
def post_acts(req):
    rows=json.loads(req.post_data); rows=rows if isinstance(rows,list) else [rows]
    made=[dict(r,id='a%07d-0000-4000-8000-000000000000'%(len(state['acts'])+i)) for i,r in enumerate(rows)]; state['acts']+=made; return made
def post_links(req): state['links']+=json.loads(req.post_data); return []
extra={'pay_contracts':lambda r: contract if 'pgrst.object' in (r.headers.get('accept') or '') else [contract],'sov_lines':sov,
 'schedule_activities':lambda r: state['acts'],'POST:schedule_activities':post_acts,'POST:schedule_activity_lines':post_links,'schedule_activity_lines':lambda r: state['links']}
with sync_playwright() as p:
    b=p.chromium.launch(channel='chrome'); ctx=b.new_context(viewport={'width':1440,'height':1000}); install(ctx,extra); signed_in(ctx)
    pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('console',lambda m: m.type=='error' and errs.append(m.text[:200]))
    pg.goto(BASE); pg.wait_for_selector('text=Stand-in Office'); pg.click('td.p-name'); pg.goto(BASE+'#/schedule'); pg.click('text=Read from a PDF')
    t=time.time(); pg.set_input_files('.sched-import input[type=file]','scan.pdf')
    pg.wait_for_selector('.sched-read',timeout=120000); print('scan read in %.1fs'%(time.time()-t))
    print(pg.inner_text('.sched-import p.small'))
    rows=pg.evaluate("[...document.querySelectorAll('.sched-read tbody tr')].map(r=>[r.querySelector('.sched-no').textContent,r.querySelector('input.cell').value,...[...r.querySelectorAll('input[type=date]')].map(i=>i.value),[...r.querySelectorAll('.sched-tie')].map(t=>t.firstChild.textContent).join('|')])")
    for r in rows: print('  ',r)
    pg.screenshot(path='sched_read.png')
    pg.click('.sched-import button.primary'); pg.wait_for_timeout(1500)
    print(pg.inner_text('.notice')); print('activities kept:',len(state['acts']),'links:',len(state['links']))
    pg.screenshot(path='sched_after.png',full_page=True); print('errors:',[e for e in errs if 'favicon' not in e][:5])
    b.close()
