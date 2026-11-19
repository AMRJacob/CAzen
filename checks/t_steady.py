"""The sheet-turning buttons stay where they are whether or not the sheet has revisions to step through."""
from common import *
from t_fix import extra as base, S1, I1
import copy
S2='44444444-4444-4444-8444-444444444442'; R2='55555555-5555-4555-8555-555555555552'; R3='55555555-5555-4555-8555-555555555553'
ex=copy.deepcopy(base)
r=ex['sheet_revisions'][0]; c=ex['current_sheets'][0]
ex['sheets'].append(dict(ex['sheets'][0],id=S2,number='A-102',title='ROOF PLAN WITH A LONG TITLE TO PUSH THINGS'))
ex['sheet_revisions']+= [dict(r,id=R2,sheet_id=S2,title_at_rev='ROOF PLAN'), dict(r,id=R3,revision_index=1,revision_label='ASI 1')]
ex['current_sheets'][0]=dict(c,revision_id=R3,revision_index=1,revision_label='ASI 1',revision_count=2)
ex['current_sheets'].append(dict(c,sheet_id=S2,number='A-102',title='ROOF PLAN WITH A LONG TITLE TO PUSH THINGS',revision_id=R2))
allrev=ex['sheet_revisions']
def revs(req):
    m=re.search(r'sheet_id=eq\.([0-9a-f-]+)',req.url)
    return [x for x in allrev if not m or x['sheet_id']==m.group(1)]
ex['sheet_revisions']=revs
pdf=open('sheet.pdf','rb').read()
with sync_playwright() as p:
    b=p.chromium.launch(channel='chrome')
    for w in (1440,1000):
        ctx=b.new_context(viewport={'width':w,'height':900}); install(ctx,ex); signed_in(ctx)
        ctx.route(re.compile(r'.*/functions/v1/files.*'), lambda r: r.fulfill(status=200,content_type='application/json',body=json.dumps({'url':'https://stand-in.supabase.co/blob/sheet.pdf','configured':True})))
        ctx.route(re.compile(r'.*/blob/sheet\.pdf'), lambda r: r.fulfill(status=200,content_type='application/pdf',body=pdf))
        pg=ctx.new_page(); pg.goto(BASE); pg.wait_for_selector('text=Stand-in Office'); pg.click('td.p-name'); pg.click('text=A-101 >> nth=0'); pg.wait_for_timeout(2500)
        at=lambda: [round(pg.locator('.sv-bar button[aria-label="%s sheet"]'%n).bounding_box()['x']) for n in ('Previous','Next')]
        a=at(); ra=pg.locator('.sv-revs').count(); pg.screenshot(path='steady_%d_a.png'%w,clip={'x':0,'y':0,'width':w,'height':60})
        pg.click('.sv-bar button[aria-label="Next sheet"]'); pg.wait_for_timeout(1800)
        bb=at(); rb=pg.locator('.sv-revs').count(); pg.screenshot(path='steady_%d_b.png'%w,clip={'x':0,'y':0,'width':w,'height':60})
        print(w,'px — A-101 (revision stepper shown: %s) buttons at'%bool(ra),a,'| A-102 (shown: %s) at'%bool(rb),bb,'| same place:',a==bb)
        ctx.close()
    b.close()
