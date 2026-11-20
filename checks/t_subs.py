"""The submittal register: log one in, send it to a consultant, bring it back, review and return, log a resubmittal."""
from common import *
import json, time
store=[{'id':'eeeeeeee-eeee-4eee-8eee-eeeeeeeee001','project_id':PROJ,'kind':'submittal_cover','number':'05 12 00 - 001','title':'Structural steel shop drawings','values':{'sub.number':'05 12 00 - 001','sub.title':'Structural steel shop drawings','sub.subcontractor':'Steel Co','sub.received':'10/01/2026','sub.returned':'10/08/2026','sub.action':'revise_resubmit'},'file_path':'r2:x/steel.pdf','issuance_id':None,'issued_by':UID,'issued_at':'2026-10-08T15:00:00Z'},
 {'id':'eeeeeeee-eeee-4eee-8eee-eeeeeeeee002','project_id':PROJ,'kind':'submittal_cover','number':'08 41 13 - 001','title':'Storefront','values':{'sub.number':'08 41 13 - 001','sub.title':'Storefront','sub.received':'10/20/2026'},'file_path':None,'issuance_id':None,'issued_by':UID,'issued_at':'2026-10-20T15:00:00Z'}]
calls=[]
def post(r):
    row=json.loads(r.post_data); row=dict(row,issued_at=time.strftime('%Y-%m-%dT12:00:00Z'),issuance_id=None); store.insert(0,row); calls.append(('POST',row['number'])); return row
def patch(r):
    i=r.url.split('id=eq.')[1].split('&')[0]; body=json.loads(r.post_data)
    for s in store:
        if s['id']==i: s.update(body)
    calls.append(('PATCH',sorted(k for k in body['values'] if 'consultant' in k))); return []
def delete(r):
    i=r.url.split('id=eq.')[1].split('&')[0]; store[:]=[s for s in store if s['id']!=i]; calls.append(('DELETE',i[-3:])); return []
ex={'issued_forms':lambda r: store,'POST:issued_forms':post,'PATCH:issued_forms':patch,'DELETE:issued_forms':delete,'issued_form_links':[],'spec_sections':[{'number':'09 30 00','title':'Tiling'}]}
with sync_playwright() as p:
    b=p.chromium.launch(channel='chrome')
    for name,vp in (('desk',dict(viewport={'width':1500,'height':950})),('phone',PHONE)):
        ctx=b.new_context(**vp); install(ctx,ex); signed_in(ctx)
        pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
        pg.goto(BASE); pg.wait_for_selector('text=Stand-in Office'); pg.locator('td.p-name').first.click(); pg.wait_for_selector('.overview'); pg.goto(BASE+'#/submittals'); pg.wait_for_selector('.subs-totals'); pg.wait_for_timeout(500)
        print(name,'| totals:',[t.replace('\n',' ') for t in pg.locator('.subs-totals > div').all_inner_texts()])
        print('  open rows:',[t.replace('\n',' | ').replace('\t',' | ')[:110] for t in pg.locator('.subs-table tbody tr').all_inner_texts()])
        if name=='desk':
            pg.click('button:has-text("Log a submittal")'); pg.fill('.subs-log input >> nth=0','093000'); pg.wait_for_timeout(200); print('  typed 093000 ->',pg.input_value('.subs-log input >> nth=0'))
            pg.fill('.subs-log input >> nth=1','Tile product data'); pg.click('.subs-log button.primary'); pg.wait_for_timeout(500)
            row=pg.locator('.subs-table tbody tr',has_text='Tile product data'); row.locator('button:has-text("Send to a consultant")').click(); pg.fill('.subs-route input >> nth=0','Interiors'); pg.click('.subs-route button.primary-lite'); pg.wait_for_timeout(500)
            print('  after sending:',row.inner_text().replace('\n',' | ').replace('\t',' | ')[:140])
            row.locator('button:has-text("Back from consultant")').click(); pg.wait_for_timeout(500); print('  after coming back:',row.locator('.subs-tag').inner_text())
            pg.click('.tabs button:has-text("Waiting on a resubmittal")'); pg.wait_for_timeout(200); pg.click('button:has-text("Log the resubmittal")'); print('  resubmittal number offered:',pg.input_value('.subs-log input >> nth=0'),'| name:',pg.input_value('.subs-log input >> nth=1'))
            pg.click('.subs-log button.primary'); pg.wait_for_timeout(500); pg.click('.tabs button:has-text("All")'); pg.wait_for_timeout(200)
            print('  all, in order:',[t.split('\t')[0].strip() for t in pg.locator('.subs-table tbody tr').all_inner_texts()])
            pg.screenshot(path='subs_desk.png')
            pg.locator('.subs-table tbody tr',has_text='Storefront').locator('button:has-text("Review and return")').click(); pg.wait_for_selector('.pf-page img',timeout=20000)
            pg.click('.pf-tabs button:has-text("List of fields")'); print('  review form prefilled:',pg.locator('.form.card input').first.input_value(),'|',pg.locator('.form.card input').nth(2).input_value())
            print('  server calls:',calls)
        else: pg.screenshot(path='subs_phone.png'); print('  page wider than screen:',pg.evaluate('document.documentElement.scrollWidth>innerWidth+1'))
        print('  errors:',errs); ctx.close()
    b.close()
