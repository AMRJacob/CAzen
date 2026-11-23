"""New application: the contractor's PDF dropped on the panel opens the application and reads this period from it.
Then, on a contract with no schedule of values yet, the PDF's lines become the schedule of values."""
from common import *
import t_overview as o, json, re, base64
apps=[a for a in o.ex['pay_apps'] if a['id']==o.A1]
ex=dict(o.ex); ex['issued_form_links']=[]; ex['pay_app_lines']=[x for x in o.ex['pay_app_lines'] if x['pay_app_id']==o.A1]
ex['pay_apps']=lambda r: apps
NEW='99999999-9999-4999-8999-99999999a0ff'
def post_app(r):
    row=dict(json.loads(r.post_data), id=NEW, retainage_work=None, retainage_stored=None, certified_sum=None); apps.append(row); return row
ex['POST:pay_apps']=post_app
pdf=base64.b64encode(open('g703.pdf','rb').read()).decode()
with sync_playwright() as p:
    b=p.chromium.launch(channel='chrome'); ctx=b.new_context(viewport={'width':1440,'height':900}); install(ctx,ex); signed_in(ctx)
    pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(BASE); pg.wait_for_selector('text=Stand-in Office'); pg.click('td.p-name'); pg.wait_for_selector('.overview'); pg.goto(BASE+'#/pay'); pg.wait_for_timeout(1200)
    pg.click('button:has-text("New application")'); pg.wait_for_selector('.pay-new')
    print('panel:',pg.inner_text('.pay-new').replace('\n',' | ')); print('apps before drop:',len(apps))
    pg.screenshot(path='paynew.png')
    # Dropped as from a folder: a real DataTransfer carrying the PDF.
    pg.evaluate("""b64=>{const bin=atob(b64),u=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i)
      const dt=new DataTransfer();dt.items.add(new File([u],'App 2.pdf',{type:'application/pdf'}))
      const el=document.querySelector('.pay-new .drop-spot');el.dispatchEvent(new DragEvent('dragover',{dataTransfer:dt,bubbles:true,cancelable:true}));el.dispatchEvent(new DragEvent('drop',{dataTransfer:dt,bubbles:true,cancelable:true}))}""",pdf)
    pg.wait_for_selector('.pay-read-card',timeout=60000)
    print('apps after drop:',len(apps),'| tab on:',pg.inner_text('.pay-tabs button.on'),'| panel gone:',pg.locator('.pay-new').count()==0)
    print('says:',pg.inner_text('.pay-read-card p')[:140])
    pg.click('.pay-read-card button:has-text("Cancel")'); pg.wait_for_timeout(300)
    pg.click('button:has-text("New application")'); pg.click('.pay-new button:has-text("without a PDF")'); pg.wait_for_timeout(900)
    print('blank start → apps:',len(apps),'| read dialog:',pg.locator('.pay-read-card').count(),'| errors:',errs); b.close()

# No schedule of values on record: the lines come from the PDF.
ex2=dict(ex); ex2['sov_lines']=[]; added=[]; billed=[]
ex2['POST:sov_lines']=lambda r:(added.append(json.loads(r.post_data)) or {'id':'99999999-9999-4999-8999-9999999c%04d'%len(added)})
ex2['POST:pay_app_lines']=lambda r:(billed.append(json.loads(r.post_data)) or [])
del apps[1:]
with sync_playwright() as p:
    b=p.chromium.launch(channel='chrome'); ctx=b.new_context(viewport={'width':1440,'height':900}); install(ctx,ex2); signed_in(ctx)
    pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(BASE); pg.wait_for_selector('text=Stand-in Office'); pg.click('td.p-name'); pg.wait_for_selector('.overview'); pg.goto(BASE+'#/pay'); pg.wait_for_timeout(1200)
    pg.click('button:has-text("New application")'); pg.set_input_files('.pay-new input[type=file]','g703.pdf'); pg.wait_for_selector('.pay-read-card',timeout=60000)
    print('empty contract says:',pg.inner_text('.pay-read-card p')[:150]); print('button:',pg.inner_text('.pay-read-card button.primary'))
    allbox=pg.locator('.pay-read-all input').first; allbox.uncheck(); print('all unticked →',pg.inner_text('.pay-read-card button.primary'))
    pg.locator('.pay-read-new input[type=checkbox]').first.check(); print('one ticked → indeterminate:',allbox.evaluate('e=>e.indeterminate'))
    allbox.check(); print('all ticked →',pg.inner_text('.pay-read-card button.primary'))
    pg.locator('.pay-read-head input').first.check(); print('line 1 as a heading:',pg.locator('.pay-read-new.heading').count(),'row(s); its this-period box disabled:',pg.locator('.pay-read-new.heading input.cell').first.is_disabled())
    pg.click('.pay-read-card button.primary'); pg.wait_for_timeout(1200)
    print('lines added:',[(l.get('item_no'),l['description'],l['scheduled_value'],l.get('is_heading',False)) for l in added]); print('billed:',[(x['this_period'],x['stored']) for x in billed],'| errors:',errs); b.close()
