"""A photograph on a notebook page is sent to the page's pad and laid on the paper to be drawn over."""
from common import *
from t_touch import pad, visit
import json, re
posts=[]
def post(r):
    row=json.loads(r.post_data); row=row[0] if isinstance(row,list) else row; posts.append(row); return [row] if 'pgrst.object' not in (r.headers.get('accept') or '') else row
v=dict(visit); v['photos']=['r2:'+PROJ+'/photos/North wall.jpg']; v['photo_labels']={}
ex={'site_visits':[v],'note_pads':lambda r: pad if 'pgrst.object' in (r.headers.get('accept') or '') else [pad],'pad_marks':[],'POST:pad_marks':post,'observations':[],'observation_types':[]}
jpg=open('site.jpg','rb').read()
with sync_playwright() as p:
    b=p.chromium.launch(channel='chrome'); ctx=b.new_context(**PHONE); install(ctx,ex); signed_in(ctx)
    ctx.route(re.compile(r'.*/functions/v1/files.*'), lambda r: r.fulfill(status=200,content_type='application/json',body=json.dumps({'url':'https://stand-in.supabase.co/blob/site.jpg','configured':True})))
    ctx.route(re.compile(r'.*/blob/site\.jpg'), lambda r: r.fulfill(status=200,content_type='image/jpeg',body=jpg))
    pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(BASE); pg.wait_for_selector('text=Stand-in Office'); pg.tap('.p-name'); pg.wait_for_timeout(400); pg.goto(BASE+'#/field-notes/reports'); pg.tap('.nb-toc li button'); pg.wait_for_selector('.nb-page'); pg.wait_for_timeout(600)
    pg.locator('.nb-shot').first.scroll_into_view_if_needed(); pg.locator('.nb-shot').first.tap(); pg.wait_for_selector('.nb-light'); print('viewer buttons:',pg.locator('.nb-light-foot button').all_inner_texts())
    pg.tap('.nb-light-foot button:has-text("Draw on it")'); pg.wait_for_selector('.padview'); pg.wait_for_selector('.pad-pic img',timeout=15000); pg.wait_for_timeout(600)
    bx=pg.locator('.pad-pic').bounding_box(); print('on the pad: picture',round(bx['width']),'x',round(bx['height']),'| same file, not a new upload:',posts[-1]['style']['image']==v['photos'][0],'| marks added:',len(posts))
    pg.screenshot(path='drawon.png'); print('errors:',errs); b.close()
