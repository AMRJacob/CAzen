"""A section of the project manual reads straight through: the wheel moves down the page and on into the next."""
from common import *
import re, json
S={'section_id':'5ec00000-0000-4000-8000-000000000001','project_id':PROJ,'number':'09 30 00','title':'TILING','division':'09','is_void':False,'sort_key':None,'revision_id':'5ec00000-0000-4000-8000-000000000002','revision_index':0,'revision_label':None,'file_path':'r2:m/093000.pdf','pages':4,'issuance_id':None,'issued_on':'2026-09-01','issuance_title':'Bid set','superseded':False,'revision_count':1}
pdf=open('spec.pdf','rb').read()
where="(()=>{const p=document.querySelector('.sv-page'),s=document.querySelector('.sv-scroll').getBoundingClientRect(),r=p.getBoundingClientRect();return {top:Math.round(r.top-s.top),bottom:Math.round(s.bottom-r.bottom),label:[...document.querySelectorAll('.sv-bar .nowrap')].map(x=>x.textContent).find(t=>/Page/.test(t)),zoom:[...document.querySelectorAll('.sv-inline-tools button')].map(b=>b.textContent).find(t=>/%/.test(t))}})()"
with sync_playwright() as p:
    b=p.chromium.launch(channel='chrome'); ctx=b.new_context(viewport={'width':1440,'height':900}); install(ctx,{'current_specs':[S],'spec_sections':[],'spec_revisions':[]}); signed_in(ctx)
    ctx.route(re.compile(r'.*/functions/v1/files.*'), lambda r: r.fulfill(status=200,content_type='application/json',body=json.dumps({'url':'https://stand-in.supabase.co/blob/spec.pdf','configured':True})))
    ctx.route(re.compile(r'.*/blob/spec\.pdf'), lambda r: r.fulfill(status=200,content_type='application/pdf',body=pdf))
    pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(BASE); pg.wait_for_selector('text=Stand-in Office'); pg.click('td.p-name'); pg.wait_for_selector('.overview'); pg.goto(BASE+'#/manual'); pg.wait_for_selector('text=TILING',timeout=10000)
    pg.locator('text=09 30 00').first.click(); pg.wait_for_selector('.ps-page canvas'); pg.wait_for_timeout(1200)
    st="(()=>{const s=document.querySelector('.ps-scroll'),ps=[...document.querySelectorAll('.ps-page')],r=ps[0].getBoundingClientRect(),b=s.getBoundingClientRect();return {pages:ps.length,pageW:Math.round(r.width),pageH:Math.round(r.height),windowH:Math.round(b.height),topGap:Math.round(r.top-b.top),gap:Math.round(ps[1].getBoundingClientRect().top-r.bottom),drawn:ps.filter(p=>{const c=p.querySelector('canvas');return c&&c.width>300}).length,scrollTop:Math.round(s.scrollTop),label:[...document.querySelectorAll('.sv-bar .nowrap')].map(x=>x.textContent).find(t=>/Page/.test(t)),zoom:[...document.querySelectorAll('.sv-inline-tools button')].map(b=>b.textContent).find(t=>/%/.test(t))}})()"
    print('opened:',pg.evaluate(st)); pg.mouse.move(720,500)
    for i in range(9): pg.mouse.wheel(0,100); pg.wait_for_timeout(60)
    pg.wait_for_timeout(500); print('wheel 900 px:',pg.evaluate(st))
    pg.click('button[aria-label="Next page"]'); pg.wait_for_timeout(500); print('next-page arrow:',pg.evaluate(st))
    pg.keyboard.press('ArrowLeft'); pg.wait_for_timeout(400); print('left arrow key:',pg.evaluate(st)['label'])
    pg.click('button[aria-label="Zoom in"]'); pg.wait_for_timeout(700); print('zoom in:',pg.evaluate(st))
    pg.mouse.move(720,500); pg.keyboard.down('Control'); pg.mouse.wheel(0,200); pg.keyboard.up('Control'); pg.wait_for_timeout(600); print('ctrl+wheel out:',pg.evaluate(st)['zoom'],'| errors:',errs)
    pg.screenshot(path='flow.png'); ctx.close()
    ctx=b.new_context(**PHONE); install(ctx,{'current_specs':[S],'spec_sections':[],'spec_revisions':[]}); signed_in(ctx)
    ctx.route(re.compile(r'.*/functions/v1/files.*'), lambda r: r.fulfill(status=200,content_type='application/json',body=json.dumps({'url':'https://stand-in.supabase.co/blob/spec.pdf','configured':True})))
    ctx.route(re.compile(r'.*/blob/spec\.pdf'), lambda r: r.fulfill(status=200,content_type='application/pdf',body=pdf))
    pg=ctx.new_page(); pg.goto(BASE); pg.wait_for_selector('text=Stand-in Office'); pg.tap('td.p-name'); pg.wait_for_selector('.overview'); pg.goto(BASE+'#/manual'); pg.wait_for_selector('text=TILING')
    pg.locator('text=09 30 00').first.tap(); pg.wait_for_selector('.ps-page canvas'); pg.wait_for_timeout(1000); print('phone:',pg.evaluate(st)); pg.screenshot(path='flow_phone.png'); b.close()
