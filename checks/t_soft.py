"""A sheet whose drawing is a picture: the upload review says how far it stays sharp; the viewer says so past that zoom."""
from common import *
import copy, t_fix
ex=copy.deepcopy(t_fix.extra); soft=open('soft_sheet.pdf','rb').read()
with sync_playwright() as p:
    b=p.chromium.launch(channel='chrome'); ctx=b.new_context(viewport={'width':1440,'height':950}); install(ctx,ex); signed_in(ctx)
    ctx.route(re.compile(r'.*/functions/v1/files.*'), lambda r: r.fulfill(status=200,content_type='application/json',body=json.dumps({'url':'https://stand-in.supabase.co/blob/sheet.pdf','configured':True})))
    ctx.route(re.compile(r'.*/blob/sheet\.pdf'), lambda r: r.fulfill(status=200,content_type='application/pdf',body=soft))
    pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(BASE); pg.wait_for_selector('text=Stand-in Office'); pg.click('td.p-name'); pg.wait_for_timeout(300); pg.goto(BASE+'#/documents')
    pg.click('button:has-text("Upload a set")'); pg.set_input_files('.upload-panel input[type=file]','soft_set.pdf')
    pg.wait_for_selector('.soft-note',timeout=40000); pg.wait_for_timeout(500)
    print('row notes:',pg.locator('.soft-note').all_inner_texts())
    print('notice:',pg.locator('.notice.warn:has-text("picture")').inner_text().replace('\n',' | '))
    pg.locator('.notice.warn:has-text("picture")').screenshot(path='soft_notice.png')
    pg.keyboard.press('Escape'); pg.goto(BASE+'#/documents'); pg.reload(); pg.wait_for_selector('tr.opens'); pg.click('text=A-101 >> nth=0'); pg.wait_for_timeout(3000)
    print('at fit, notice shown:',pg.locator('.sv-soft').count())
    for _ in range(8): pg.click('button[aria-label="Zoom in"] >> nth=0'); pg.wait_for_timeout(250)
    pg.wait_for_timeout(800); print('zoom',pg.inner_text('button[title="Fit the sheet to the screen"]'),'| notice:',pg.locator('.sv-soft').all_inner_texts())
    pg.screenshot(path='soft_viewer.png'); print('errors:',errs); b.close()
