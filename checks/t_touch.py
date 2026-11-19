import sys, math
from common import *
PAD='dddddddd-dddd-4ddd-8ddd-dddddddddddd'; V='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
pad={'id':PAD,'project_id':PROJ,'kind':'field_report','title':None,'noted_on':'2026-11-19','pages':1,'rule':'grid','rule_ink':40,'issued_id':None,'created_by':UID,'created_at':'2026-11-19T12:00:00Z','updated_at':'2026-11-19T12:00:00Z'}
visit={'id':V,'project_id':PROJ,'kind':'visit','visited_on':time.strftime('%Y-%m-%d'),'visited_at':'10:00:00','title':'Sketch check','weather':'Clear','notes':'1. Notes\n  a. ','names':None,'photos':[],'photo_labels':{},'cover_photo':None,'pad_id':PAD,'issued_id':None,'created_at':'2026-11-19T12:00:00Z'}
def run(base,label,across):
    made=[]
    extra={'site_visits':[visit],'note_pads':lambda r: pad if 'pgrst.object' in (r.headers.get('accept') or '') else [pad],'pad_marks':[],'POST:pad_marks':lambda r:(made.append(1),[])[1],'observations':[],'observation_types':[]}
    with sync_playwright() as p:
        b=p.chromium.launch(channel='chrome'); ctx=b.new_context(**PHONE); install(ctx,extra); signed_in(ctx)
        pg=ctx.new_page(); pg.goto(base); pg.wait_for_selector('text=Stand-in Office'); pg.click('.p-name'); pg.goto(base+'#/field-notes/reports'); pg.click('.nb-toc button'); pg.wait_for_selector('.nb-pad'); pg.click('.nb-pad'); pg.wait_for_selector('.padview-frame'); pg.wait_for_timeout(600)
        cdp=ctx.new_cdp_session(pg); r=across/2
        def touch(kind,x,y): cdp.send('Input.dispatchTouchEvent',{'type':kind,'touchPoints':[] if kind=='touchEnd' else [{'x':x,'y':y,'radiusX':r,'radiusY':r,'force':0.5,'id':1}]})
        def stroke(y):
            touch('touchStart',80,y)
            for i in range(1,12): touch('touchMove',80+i*18,y+6*math.sin(i)); pg.wait_for_timeout(12)
            touch('touchEnd',0,0); pg.wait_for_timeout(500)
        kept=[]
        for y in (300,380,460): stroke(y); kept.append(len(made))
        m=pg.locator('.padmenu-mark').bounding_box(); taps=0
        for _ in range(5):
            taps+=1; touch('touchStart',m['x']+24,m['y']+24); pg.wait_for_timeout(40); touch('touchEnd',0,0); pg.wait_for_timeout(250)
            if pg.locator('.padmenu.open').count(): break
        else: taps=None
        print('%-7s contact %2d px across | strokes kept after each of 3 finger strokes: %s | taps on the mark until the menu opened: %s'%(label,across,kept,taps)); b.close()
for a in sys.argv[1:]:
    for across in (30,60): run(a.split('=')[1],a.split('=')[0],across)
