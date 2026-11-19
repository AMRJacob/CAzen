"""Tearing out a page takes its sketch and photographs with it, and its observations if asked."""
from common import *
import datetime
today=time.strftime('%Y-%m-%d'); PAD='dddddddd-dddd-4ddd-8ddd-dddddddddddd'; T1='77777777-7777-4777-8777-777777777771'
V={'id':'cccccccc-cccc-4ccc-8ccc-cccccccccccc','project_id':PROJ,'kind':'visit','visited_on':today,'visited_at':'00:00:00','title':'Walk','weather':'Clear','location':None,'notes':'1. Site\n  a. Grading done\n2. Structure','names':'Jacob | AMR','photos':['r2:'+PROJ+'/CAzen/09 Field Reports/Photos/a.jpg','r2:'+PROJ+'/CAzen/09 Field Reports/Photos/b.jpg'],'photo_labels':{},'cover_photo':None,'pad_id':PAD,'issued_id':None,'created_at':today+'T00:00:00Z'}
pad={'id':PAD,'project_id':PROJ,'kind':'field_report','title':None,'noted_on':today,'pages':1,'rule':'grid','rule_ink':40,'issued_id':None,'created_by':UID,'created_at':today+'T00:00:00Z','updated_at':today+'T00:00:00Z'}
now=datetime.datetime.now().astimezone(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.000Z')
obs=[{'id':'dddddddd-dddd-4ddd-8ddd-ddddddddddd1','project_id':PROJ,'type_id':T1,'number':1,'title':'Seen on this page','detail':None,'status':'open','area':None,'trade':None,'observed_on':today,'photos':[],'sheet_id':None,'revision_id':None,'region':None,'created_by':UID,'created_at':now,'updated_at':now}]
def run(tick):
    calls=[]
    ex={'site_visits':lambda r: [V] if 'kind=eq.visit' in r.url else [],'note_pads':lambda r: pad if 'pgrst.object' in (r.headers.get('accept') or '') else [pad],'pad_marks':[],'observations':lambda r: obs,'observation_types':[{'id':T1,'firm_id':FIRM,'code':'N','name':'Note','position':0,'on_punch_list':False}],'project_people':[],
     'DELETE:site_visits':lambda r:(calls.append('page'),[])[1],'DELETE:note_pads':lambda r:(calls.append('sketch'),[])[1],'DELETE:observations':lambda r:(calls.append('observation'),[])[1]}
    ctx=b.new_context(**PHONE); install(ctx,ex); signed_in(ctx)
    def fn(route):
        body=json.loads(route.request.post_data or '{}')
        if body.get('action')=='delete': calls.append('photographs:%d'%len(body.get('keys',[]))); return route.fulfill(status=200,content_type='application/json',body='{"deleted":2,"failed":0}')
        route.fulfill(status=200,content_type='application/json',body=json.dumps({'url':'https://stand-in.supabase.co/blob/x','configured':True}))
    ctx.route(re.compile(r'.*/functions/v1/files.*'),fn)
    pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)[:200]))
    pg.goto(BASE); pg.wait_for_selector('text=Stand-in Office'); pg.tap('td.p-name'); pg.wait_for_selector('.overview'); pg.goto(BASE+'#/field-notes/reports'); pg.tap('.nb-toc-title'); pg.wait_for_selector('.nbd-type input'); pg.wait_for_timeout(600)
    pg.tap('button:has-text("Tear out")'); pg.wait_for_selector('.nb-tearout')
    if tick: pg.tap('.nb-tear-obs input')
    pg.tap('.nb-tearout .take-remove'); pg.wait_for_timeout(1500)
    print('observations box %s → server told to delete:'%('ticked' if tick else 'left alone'),sorted(calls),'| pages left:',pg.locator('.nb-toc li').count(),'| errors:',errs[:2]); ctx.close()
with sync_playwright() as p:
    b=p.chromium.launch(channel='chrome'); run(False); run(True); b.close()
