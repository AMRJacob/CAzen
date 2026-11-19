from common import *
state={'acts':[],'versions':[]}
def post_acts(req):
    rows=json.loads(req.post_data); rows=rows if isinstance(rows,list) else [rows]
    made=[dict(r,id='a%07d-0000-4000-8000-000000000000'%(len(state['acts'])+i)) for i,r in enumerate(rows)]; state['acts']+=made; return made
def post_ver(req):
    v=dict(json.loads(req.post_data),id='b%07d-0000-4000-8000-000000000000'%len(state['versions']),created_at='2026-11-19T12:0%d:00Z'%len(state['versions'])); state['versions'].insert(0,v); return v
extra={'pay_contracts':[],'sov_lines':[],'schedule_activities':lambda r: state['acts'],'POST:schedule_activities':post_acts,'schedule_activity_lines':[],
 'schedule_versions':lambda r: state['versions'],'POST:schedule_versions':post_ver}
with sync_playwright() as p:
    b=p.chromium.launch(channel='chrome'); ctx=b.new_context(viewport={'width':1440,'height':1000}); install(ctx,extra); signed_in(ctx)
    def patch(route):
        req=route.request
        if req.method=='PATCH':
            fid=re.search(r'id=eq\.([0-9a-f-]+)',req.url).group(1)
            for a in state['acts']:
                if a['id']==fid: a.update(json.loads(req.post_data))
            return route.fulfill(status=204,body='')
        route.fallback()
    ctx.route(re.compile(r'.*/rest/v1/schedule_activities.*'),patch)
    pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(BASE); pg.wait_for_selector('text=Stand-in Office'); pg.click('td.p-name'); pg.wait_for_timeout(300); pg.goto(BASE+'#/documents'); pg.goto(BASE+'#/schedule')
    def issue(text,name,date):
        pg.click('text=Read from a PDF'); pg.fill('.sched-paste textarea',text); pg.click('text=Read what was pasted'); pg.wait_for_selector('.sched-read')
        nos=pg.evaluate("[...document.querySelectorAll('.sched-read .sched-no')].map(e=>e.textContent)")
        pg.fill('.sched-issue input[type=date]',date); pg.fill('.sched-issue input[aria-label="Name of this issue"]',name); pg.click('.sched-import button.primary'); pg.wait_for_timeout(900); print('  line column:',nos); print(' ',pg.inner_text('.notice'))
    print('first issue'); issue('SITEWORK\n1 Mobilization 5 days 01/05/26 01/09/26\n2 Roofing 10 days 04/06/26 04/17/26\n3 Painting 10 days 06/08/26 06/19/26','Baseline','2026-01-02')
    print('second issue'); issue('SITEWORK\n1 Mobilization 5 days 01/05/26 01/09/26 100%\n2 Roofing 12 days 04/13/26 04/29/26\n4 Punch list 5 days 06/22/26 06/30/26','Update 1','2026-03-02')
    pg.wait_for_selector('.sched-history'); pg.click('.sched-issue-row >> nth=0'); pg.wait_for_timeout(200)
    print('history rows:',[t.replace('\n',' | ') for t in pg.locator('.sched-issue-row').all_inner_texts()])
    print('changes in the newest:',pg.locator('.sched-changes li').all_inner_texts())
    pg.click('text=Show the schedule as it stood'); print('as it stood:',pg.locator('.sched-old tbody tr').count(),'rows'); pg.locator('.sched-history').screenshot(path='issues.png'); print('errors:',errs[:3]); b.close()
