"""A notebook page: Enter keeps the bullet going; in and out change the marker; observations split into this page's and previous; right-click deletes a page."""
from common import *
import datetime
today=time.strftime('%Y-%m-%d'); now=datetime.datetime.now()
def V(i,at,title): return {'id':'cccccccc-cccc-4ccc-8ccc-ccccccccccc%d'%i,'project_id':PROJ,'kind':'visit','visited_on':today,'visited_at':at,'title':title,'weather':'Clear','location':None,'notes':'1. Site\n  a. Grading done\n2. Structure\n  a. ','names':None,'photos':[],'photo_labels':{},'cover_photo':None,'pad_id':None,'issued_id':None,'created_at':today+'T00:00:00Z'}
t=lambda h,m: '%02d:%02d:00'%(h,m)
visits=[V(2,t(now.hour, max(0,now.minute-1)) if now.hour>0 else '00:00:00','Afternoon walk'),V(1,'00:00:00','Morning walk')]
T1='77777777-7777-4777-8777-777777777771'
def O(i,title,when,status='open',day=today): return {'id':'dddddddd-dddd-4ddd-8ddd-ddddddddddd%d'%i,'project_id':PROJ,'type_id':T1,'number':i,'title':title,'detail':None,'status':status,'area':None,'trade':None,'observed_on':day,'photos':[],'sheet_id':None,'revision_id':None,'region':None,'created_by':UID,'created_at':when,'updated_at':when}
iso=lambda d: d.astimezone(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.000Z')
obs=[O(1,'Old open item from last week',iso(now-datetime.timedelta(days=7)),day=(now-datetime.timedelta(days=7)).strftime('%Y-%m-%d')),O(2,'Old item, closed',iso(now-datetime.timedelta(days=6)),'closed'),O(3,'Seen on this page',iso(now+datetime.timedelta(seconds=30)))]
gone=[]
ex={'site_visits':lambda r: visits if 'kind=eq.visit' in r.url else [],'observations':lambda r: obs,'observation_types':[{'id':T1,'firm_id':FIRM,'code':'N','name':'Note','position':0,'on_punch_list':False}],'project_people':[],'DELETE:site_visits':lambda r:(gone.append(r.url[-40:]),[])[1]}
with sync_playwright() as p:
    b=p.chromium.launch(channel='chrome'); ctx=b.new_context(viewport={'width':1440,'height':900}); install(ctx,ex); signed_in(ctx)
    pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)[:200])); pg.on('dialog',lambda d:d.accept())
    pg.goto(BASE); pg.wait_for_selector('text=Stand-in Office'); pg.click('td.p-name'); pg.wait_for_timeout(300); pg.goto(BASE+'#/documents'); pg.wait_for_timeout(400); pg.goto(BASE+'#/field-notes/reports'); pg.wait_for_selector('.nb-toc-title')
    pg.click('.nb-toc-title >> nth=0'); pg.wait_for_selector('.nb-z-notes textarea.nb-outline'); box='.nb-z-notes textarea.nb-outline'; val=lambda: pg.input_value(box)
    pg.click(box); pg.evaluate("(()=>{const t=document.querySelector('%s');const i=t.value.indexOf('Grading done')+12;t.setSelectionRange(i,i)})()"%box)
    pg.keyboard.press('Enter'); pg.keyboard.type('Silt fence down at east edge'); pg.wait_for_timeout(150); print('Enter in a sub-item:',repr(val().split('\n')[1:3]))
    pg.keyboard.press('Enter'); pg.keyboard.press('Tab'); pg.keyboard.type('Reset before rain'); print('Enter, then Tab (in a level):',repr(val().split('\n')[3]))
    pg.keyboard.press('Enter'); pg.keyboard.press('Enter'); pg.keyboard.type('Stockpile moved'); print('Enter on an empty item steps back out:',repr(val().split('\n')[4]))
    pg.click('.nb-z-notes button[aria-label="Promote"]'); pg.wait_for_timeout(200); print('Promote button:',repr(val().split('\n')[4]),'| what followed renumbered:',repr(val().split('\n')[5]))
    pg.click('.nb-z-notes button[aria-label="Demote"]'); pg.wait_for_timeout(200); print('Demote button:',repr(val().split('\n')[4]),'|',repr(val().split('\n')[5]))
    items=pg.evaluate("[...document.querySelectorAll('.nb-seen > li')].map(li=>li.className.includes('nb-seen-rule')?'—— '+li.innerText+' ——':(li.className.includes('old')?'(previous) ':'')+li.querySelector('.nb-seen-text span').innerText)")
    print('observations on the later page:',items,'| heading:',pg.inner_text('.nb-z-seen h2'))
    pg.goto(BASE+'#/'); pg.goto(BASE+'#/field-notes/reports'); pg.wait_for_selector('.nb-toc-title')
    pg.click('.nb-toc li >> nth=1',button='right'); pg.wait_for_selector('.nb-tear'); print('right-click on a page in the contents:',pg.locator('.nb-tear button').all_inner_texts()); pg.click('.nb-tear button:has-text("Delete this page")'); pg.wait_for_timeout(600)
    print('after deleting: pages listed',pg.locator('.nb-toc li').count(),'| server told:',len(gone)==1,'| errors:',errs[:3]); b.close()
