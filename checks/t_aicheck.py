"""Check with AI: copy the notes with the request, paste a reply back, review each change (accept, reject, edit), apply to the board."""
from common import *
import json
V={'id':'cccccccc-cccc-4ccc-8ccc-ccccccccc001','project_id':PROJ,'kind':'meeting','visited_on':'2026-11-18','visited_at':'10:00:00','title':'OAC','weather':None,'names':None,
   'notes':'1. Schedule\n  a. roof dryin by 12/5\n  b. Owner wants furnature date\n2. Submittals\n  a. door hardware resubmital\n3. Unsorted\n  a. Call roofer about flashing','photos':[],'photo_labels':{},'pad_id':None,'issued_id':None,'location':None,'widgets':{},'created_at':'2026-11-18T15:00:00Z'}
REPLY='Here are the revised notes:\n\n1. Schedule\n   a. Roof dry-in by 12/5.\n   b. Owner requested the furniture delivery date.\n2. Submittals\n   a. Door hardware resubmittal.\n3. Roofing\n   a. Call the roofer about flashing.'
saved=[]
with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={'width':1440,'height':900}, permissions=['clipboard-read','clipboard-write'])
    install(ctx,{'site_visits':lambda r:[V],'PATCH:site_visits':lambda r:(saved.append(json.loads(r.post_data).get('notes')),[{}])[1],'note_pads':[],'pad_marks':[],'observations':[],'observation_types':[],'project_people':[],'notebook_layouts':lambda r:None}); signed_in(ctx)
    pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(BASE); pg.wait_for_selector('text=Stand-in Office'); pg.locator('td.p-name, .p-card').first.click(); pg.wait_for_timeout(500)
    pg.goto(BASE+'#/field-notes/meetings'); pg.wait_for_selector('.nb-toc li'); pg.click('.nb-toc li button'); pg.wait_for_selector('.nbd'); pg.wait_for_timeout(600)
    pg.click('button:has-text("Check with AI")'); pg.click('button:has-text("Copy the notes for AI")'); pg.wait_for_timeout(200)
    clip=pg.evaluate('navigator.clipboard.readText()'); print('copied:', clip.split('\n')[0], '… ends with the notes:', clip.endswith('Call roofer about flashing'))
    pg.evaluate('t=>navigator.clipboard.writeText(t)', REPLY); pg.click('button:has-text("Paste from the clipboard")'); pg.wait_for_timeout(150)
    pg.click('button:has-text("Review the changes")'); pg.wait_for_timeout(200)
    print('bar:', pg.inner_text('.aic-bar span')); print('tags:', pg.locator('.aic-tag').all_inner_texts())
    print('starts:', pg.inner_text('.aic-bar span'), '| Apply enabled:', pg.locator('.aic .actions button.primary').is_enabled())
    pg.click('.aic-bar button:has-text("Accept all")')
    chs=pg.locator('.aic-ch')
    chs.nth(1).locator('button:has-text("Reject")').click()
    print("rows:", [c.get_attribute("class")+" | "+c.inner_text().replace("\n"," / ")[:70] for c in chs.all()])
    chs.locator("input").first.fill("Roof dry-in by Dec 5.")
    print('after one rejected:', pg.inner_text('.aic-bar span'))
    pg.click('.aic .actions button.primary:has-text("Apply")'); pg.wait_for_timeout(1200)
    print('saved:', repr(saved[-1]) if saved else None)
    print('board boxes:', pg.locator('.nbd-box.d0 > .nbd-box-head .nbd-box-name').all_inner_texts(), '| errors', errs)
    b.close()
