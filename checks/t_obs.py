from common import *
from t_fix import extra
T1='77777777-7777-4777-8777-777777777771'
extra=dict(extra); extra['observation_types']=[{'id':T1,'firm_id':FIRM,'code':'N','name':'Note','position':0,'on_punch_list':False},{'id':T1[:-1]+'2','firm_id':FIRM,'code':'P','name':'Punch','position':1,'on_punch_list':True}]
with sync_playwright() as p:
    b=p.chromium.launch(channel='chrome'); ctx=b.new_context(**PHONE); log=[]; install(ctx,extra,log); signed_in(ctx)
    ctx.add_init_script("localStorage.setItem('cazen.currentProject','%s')"%PROJ)
    pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(BASE+'#/documents'); pg.wait_for_timeout(800)
    pg.click('.pn-mark'); pg.wait_for_timeout(400); pg.click('.pn-spot:has-text("Field notes")'); pg.wait_for_timeout(800)
    print('phone menu → Field notes lands on:', pg.inner_text('h1'), '| switcher:', pg.inner_text('.area-switch').replace('\n',' · '))
    pg.wait_for_timeout(2500); ctx.set_offline(True)
    pg.click('text=New observation'); pg.click('.chip:has-text("Punch")')
    pg.click('text=Where, who and when'); pg.fill('input[placeholder="Level 2, east"]','Level 2'); pg.fill('input[placeholder="Glazing"]','Drywall')
    for t in ['Corner bead loose at column C4','Tape joint cracked above door 214','Outlet cover missing']:
        pg.fill('input[placeholder^="Sealant"]',t); pg.keyboard.press('Enter') if t!='Corner bead loose at column C4' else pg.click('text=Keep and add another')
        pg.wait_for_timeout(300)
    pg.screenshot(path='obs_form.png')
    print('status:',pg.inner_text('[role=status]'),'| area kept:',pg.input_value('input[placeholder="Level 2, east"]'))
    pg.click('button:has-text("Done")'); pg.wait_for_timeout(800)
    print('OFFLINE list rows:',pg.locator('.obs-row').count())
    pg.screenshot(path='obs_list.png')
    posts=[u for m,u in log if m=='POST' and 'observations' in u]; print('posts while offline:',len(posts))
    ctx.set_offline(False); pg.evaluate("window.dispatchEvent(new Event('online'))"); pg.wait_for_timeout(1500)
    posts=[u for m,u in log if m=='POST' and '/observations' in u]; print('posts after signal returns:',len(posts))
    pg.reload(); pg.wait_for_timeout(1000); pg.goto(BASE+'#/field-notes'); pg.wait_for_timeout(600); pg.click('text=New observation')
    print('last type remembered:',pg.inner_text('.chip.on'))
    print('errors:',errs); b.close()
