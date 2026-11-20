"""An observation tagged in several places: added from the form, shown as several dots on the sheet."""
"""Tagging a drawing: a sharp sheet, the corner menu, and choosing the kind of tag without leaving the screen."""
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
    pg.click('.obs-attach .photo-add:has-text("Drawing")'); pg.fill('.spot-bar input','101'); pg.click('.spot-list button'); pg.wait_for_selector('.spot-page img',timeout=15000); pg.wait_for_timeout(400)
    tap=lambda fx,fy: (lambda bx: pg.mouse.click(bx['x']+bx['width']*fx,bx['y']+bx['height']*fy))(pg.locator('.spot-page').bounding_box())
    tap(0.30,0.60); pg.wait_for_timeout(400); print('first tag -> tiles on the form:',pg.locator('.obs-spot').count(),'| add button says:',pg.locator('.obs-attach .photo-add').last.inner_text().replace('\n',' '))
    pg.locator('.obs-attach .photo-add').last.click(); pg.wait_for_selector('.spot-page img',timeout=15000); pg.wait_for_timeout(400)
    print('  "Another" opens straight on the same sheet:',pg.inner_text('.spot-name').replace('\n',' '),'| with no pin yet:',pg.locator('.spot-pin').count()==0)
    tap(0.70,0.25); pg.wait_for_timeout(400); print('second tag -> tiles:',pg.locator('.obs-spot').count(),[t for t in pg.locator('.obs-spot-no').all_inner_texts()])
    pg.locator('.obs-attach .photo-add').last.click(); pg.wait_for_selector('.spot-page img',timeout=15000); pg.wait_for_timeout(300); tap(0.5,0.5); pg.wait_for_timeout(300)
    pg.locator('.obs-spot-off').last.click(); pg.wait_for_timeout(200); print('third added then taken off -> tiles:',pg.locator('.obs-spot').count())
    pg.locator('.obs-spot').first.click(); pg.wait_for_selector('.spot-page img',timeout=15000); pg.wait_for_timeout(300); print('  reopening the first shows its pin:',pg.locator('.spot-pin').count()==1); tap(0.20,0.20); pg.wait_for_timeout(300)
    pg.click('button:has-text("Keep it")'); pg.wait_for_timeout(800)
    o=state['obs'][-1]; r=o['region']; print('saved: sheet',o['sheet_id'][-4:],'first at',round(r['x'],2),round(r['y'],2),'| more:',[(m['sheet_id'][-4:],m.get('number'),round(m['x'],2),round(m['y'],2)) for m in r.get('more',[])])
    pg.goto(BASE+'#/documents'); pg.click('text=A-101 >> nth=0'); pg.wait_for_selector('.obs-dot',timeout=15000); pg.wait_for_timeout(500)
    print('dots on the sheet for the one observation:',pg.evaluate("[...document.querySelectorAll('.obs-dot')].map(d=>d.style.left+' '+d.style.top)"),'| errors:',errs)
    pg.screenshot(path='multi.png'); b.close()
