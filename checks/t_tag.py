from common import *
from t_fix import extra as sheets, S1
T1='77777777-7777-4777-8777-777777777771'
state={'obs':[]}
def post_obs(req):
    r=json.loads(req.post_data); r=r if isinstance(r,list) else [r]; state['obs']+=r; return []
extra=dict(sheets); extra.update({'observations':lambda r: state['obs'],'POST:observations':post_obs,'observation_types':[{'id':T1,'firm_id':FIRM,'code':'N','name':'Non-conforming','position':0,'is_punch':False}]})
pdf=open('sheet.pdf','rb').read()
with sync_playwright() as p:
    b=p.chromium.launch(channel='chrome'); ctx=b.new_context(viewport={'width':1440,'height':900}); install(ctx,extra); signed_in(ctx)
    ctx.route(re.compile(r'.*/rest/v1/observation_tags.*'), lambda r: r.fulfill(status=404,content_type='application/json',body=json.dumps({'code':'PGRST205','message':"Could not find the table 'public.observation_tags' in the schema cache"})))
    ctx.route(re.compile(r'.*/functions/v1/files.*'), lambda r: r.fulfill(status=200,content_type='application/json',body=json.dumps({'url':'https://stand-in.supabase.co/blob/sheet.pdf','configured':True,'bytes':0,'objects':0,'by_project':{}})))
    ctx.route(re.compile(r'.*/blob/sheet\.pdf'), lambda r: r.fulfill(status=200,content_type='application/pdf',body=pdf))
    pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(BASE); pg.wait_for_selector('text=Stand-in Office'); pg.click('td.p-name'); pg.wait_for_timeout(300); pg.goto(BASE+'#/documents'); pg.wait_for_timeout(500)
    print('sidebar books:',pg.evaluate("[...document.querySelectorAll('.sidebar .nb-tome')].map(a=>a.getAttribute('href')+' '+a.querySelector('.nb-tome-mono').textContent)"))
    pg.locator('.sidebar').screenshot(path='sidebar.png')
    pg.click('.sidebar .nb-tome-ob'); pg.wait_for_selector('text=New observation'); pg.click('button:has-text("New observation")')
    pg.click('.obs-tag-open'); pg.click('.obs-tag-trades .chip:has-text("Glazing")'); pg.click('.obs-tag-issues .chip:has-text("Sealant missing")')
    print('after the tag: title=%r chip=%r'%(pg.input_value('input[placeholder^="Sealant"]'),pg.inner_text('.obs-tag-open')))
    pg.click('.obs-attach .photo-add:has-text("Drawing")'); pg.fill('.spot-bar input','101'); pg.click('.spot-list button'); pg.wait_for_selector('.spot-page img',timeout=15000)
    bx=pg.locator('.spot-page').bounding_box(); pg.mouse.click(bx['x']+bx['width']*0.30,bx['y']+bx['height']*0.60); pg.wait_for_timeout(200); pg.screenshot(path='spot.png')
    pg.click('button:has-text("Tag it here")'); print('form says:',pg.inner_text('.obs-spot-no'),'| heading reads:',pg.input_value('.obs-name'))
    pg.fill('.obs-head-row input:not([type=date])','Sam Super')
    pg.screenshot(path='tagform.png'); pg.click('button:has-text("Keep it")'); pg.wait_for_timeout(800)
    o=state['obs'][-1]; print('saved:',{k:o.get(k) for k in('title','trade','sheet_id','region')})
    pg.goto(BASE+'#/documents'); pg.click('text=A-101 >> nth=0'); pg.wait_for_selector('.obs-pin',timeout=15000)
    print('pin on the sheet: colour',pg.evaluate("getComputedStyle(document.querySelector('.obs-pin')).backgroundColor"),'at',pg.evaluate("document.querySelector('.obs-pin').style.left+' '+document.querySelector('.obs-pin').style.top"))
    pg.goto(BASE+'#/settings'); pg.wait_for_selector('.set-group'); print('settings categories:',pg.evaluate("[...document.querySelectorAll('.set-group-title')].map(e=>e.textContent)")); pg.screenshot(path='settings.png'); pg.click('.set-group summary:has-text("Forms")'); pg.wait_for_selector('.tag-groups'); print('settings trades:',pg.locator('.tag-group').count(),'| custom-tag note:',pg.locator('.tag-groups ~ .notice').count()); print('errors:',errs); b.close()
